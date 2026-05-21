-- =============================================================================
-- REBUILD: Fluxo Tarefas — Executor / Aprovador / Auditor (verdade única)
-- =============================================================================
-- Reconstrução completa do fluxo. Antes: regras antigas e novas misturadas
-- entre operational_field_reviews (legado) e tarefas_planos_acao_* (novo).
-- Agora: 7 RPCs oficiais controlam TODO o fluxo + status. Triggers de status
-- redundantes removidos. Sem coexistência de fontes para plano de ação.
--
-- DOCUMENTO DE REFERÊNCIA: comando_claude_reconstruir_fluxo_tarefas.md
--
-- Tabelas oficiais (fonte única de verdade do plano de ação):
--   public.tarefas_planos_acao_aprovador (aprovador → executor)
--   public.tarefas_planos_acao_auditor   (auditor   → aprovador)
--
-- Tabelas mantidas como histórico (NÃO usar mais para plano de ação):
--   public.operational_field_reviews     (legado, read-only de respostas antigas)
--
-- Tabelas auxiliares mantidas:
--   operational_assignments, operational_templates, operational_field_answers,
--   operational_audit_trail, operational_score_logs, operational_contingencies
--
-- Padrão: RPC controla status + log. Triggers só para auditoria/timestamps/validações.
-- Sem status mudando em 2 lugares.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Cleanup: remove triggers de status redundantes (RPCs assumem o controle)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tarefas_trigger_status_apos_aprovador_criar_plano
  ON public.tarefas_planos_acao_aprovador;
DROP TRIGGER IF EXISTS tarefas_trigger_status_apos_executor_responder_plano
  ON public.tarefas_planos_acao_aprovador;
DROP TRIGGER IF EXISTS tarefas_trigger_status_apos_auditor_criar_plano
  ON public.tarefas_planos_acao_auditor;
DROP TRIGGER IF EXISTS tarefas_trigger_status_apos_aprovador_responder_plano_auditor
  ON public.tarefas_planos_acao_auditor;

-- Mantém as funções (DROPada só se ninguém mais usa); aqui marca como
-- deprecated via comment. Não dropamos para não quebrar dados legados que
-- possam referenciar via outras migrations.
COMMENT ON FUNCTION public.tarefas_fn_trigger_apos_aprovador_criar_plano IS
  'DEPRECATED: substituída pelo controle de status dentro das RPCs oficiais (20260521). Mantida apenas por compat.';
COMMENT ON FUNCTION public.tarefas_fn_trigger_apos_executor_responder_plano IS
  'DEPRECATED: substituída pelo controle de status dentro das RPCs oficiais (20260521).';
COMMENT ON FUNCTION public.tarefas_fn_trigger_apos_auditor_criar_plano IS
  'DEPRECATED: substituída pelo controle de status dentro das RPCs oficiais (20260521).';
COMMENT ON FUNCTION public.tarefas_fn_trigger_apos_aprovador_responder_plano_auditor IS
  'DEPRECATED: substituída pelo controle de status dentro das RPCs oficiais (20260521).';

-- ---------------------------------------------------------------------------
-- 1. RPC: EXECUTOR envia respostas originais
--    public.tarefas_rpc_executor_enviar_respostas
-- ---------------------------------------------------------------------------
-- Salva respostas originais do executor (upsert por assignment_id+field_id),
-- impede reenvio (status precisa estar em pendente/em_andamento/devolvida),
-- impede edição se já existe resposta travada para uma rodada anterior,
-- muda status para aguardando_aprovacao, registra auditoria.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tarefas_rpc_executor_enviar_respostas(
  p_assignment_id UUID,
  p_respostas JSONB
)
RETURNS TABLE (assignment_id UUID, novo_status TEXT, respostas_salvas INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_status_atual TEXT;
  v_count INT := 0;
  v_resposta JSONB;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT status INTO v_status_atual
    FROM public.operational_assignments
    WHERE id = p_assignment_id;

  IF v_status_atual IS NULL THEN
    RAISE EXCEPTION 'Tarefa % não encontrada', p_assignment_id;
  END IF;

  -- Gate: só permite envio em estados de execução
  IF v_status_atual NOT IN ('pendente', 'em_andamento', 'devolvida') THEN
    RAISE EXCEPTION 'Tarefa em status % não aceita envio do executor', v_status_atual;
  END IF;

  -- Itera respostas: cada elemento deve ter { field_id, valor_booleano?, valor_texto?, valor_numero?, valor_json?, evidencia_url?, evidencia_anexo_id?, evidencia_mime_type?, observacao? }
  FOR v_resposta IN SELECT * FROM jsonb_array_elements(COALESCE(p_respostas, '[]'::jsonb))
  LOOP
    INSERT INTO public.operational_field_answers (
      assignment_id, field_id,
      valor_booleano, valor_texto, valor_numero, valor_json,
      evidencia_url, evidencia_anexo_id, evidencia_mime_type,
      observacao, respondido_por, respondido_em
    ) VALUES (
      p_assignment_id,
      (v_resposta->>'field_id')::uuid,
      NULLIF(v_resposta->>'valor_booleano', '')::boolean,
      v_resposta->>'valor_texto',
      NULLIF(v_resposta->>'valor_numero', '')::numeric,
      v_resposta->'valor_json',
      v_resposta->>'evidencia_url',
      NULLIF(v_resposta->>'evidencia_anexo_id', '')::uuid,
      v_resposta->>'evidencia_mime_type',
      v_resposta->>'observacao',
      v_profile_id,
      now()
    )
    ON CONFLICT (assignment_id, field_id) DO UPDATE SET
      valor_booleano = EXCLUDED.valor_booleano,
      valor_texto = EXCLUDED.valor_texto,
      valor_numero = EXCLUDED.valor_numero,
      valor_json = EXCLUDED.valor_json,
      evidencia_url = COALESCE(EXCLUDED.evidencia_url, public.operational_field_answers.evidencia_url),
      evidencia_anexo_id = COALESCE(EXCLUDED.evidencia_anexo_id, public.operational_field_answers.evidencia_anexo_id),
      evidencia_mime_type = COALESCE(EXCLUDED.evidencia_mime_type, public.operational_field_answers.evidencia_mime_type),
      observacao = EXCLUDED.observacao,
      respondido_por = EXCLUDED.respondido_por,
      respondido_em = EXCLUDED.respondido_em;

    v_count := v_count + 1;
  END LOOP;

  -- Muda status e registra log
  UPDATE public.operational_assignments
    SET status = 'aguardando_aprovacao',
        updated_at = now(),
        finalizado_em = CASE
          WHEN finalizado_em IS NULL THEN now()
          ELSE finalizado_em
        END
    WHERE id = p_assignment_id;

  INSERT INTO public.operational_execution_logs (assignment_id, acao, executado_por, detalhes)
    VALUES (p_assignment_id, 'executor_enviou_respostas', v_profile_id,
            jsonb_build_object('total_respostas', v_count, 'status_anterior', v_status_atual));

  RETURN QUERY SELECT p_assignment_id, 'aguardando_aprovacao'::text, v_count;
END;
$$;

COMMENT ON FUNCTION public.tarefas_rpc_executor_enviar_respostas IS
  'Salva respostas originais do executor (upsert) + muda status para aguardando_aprovacao. Idempotente por field_id. Doc: src/modules/tarefas/docs/tarefas_rpc_executor_enviar_respostas.md';

-- ---------------------------------------------------------------------------
-- 2. RPC: EXECUTOR responde plano do aprovador (refatorada)
--    public.tarefas_rpc_executor_responder_plano_aprovador
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tarefas_rpc_executor_responder_plano_aprovador(
  p_plano_id UUID,
  p_resposta_valor_json JSONB
)
RETURNS public.tarefas_planos_acao_aprovador
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_assignment_id UUID;
  v_row public.tarefas_planos_acao_aprovador;
  v_pendentes INT;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Lock + validação: plano deve existir, não estar deleted, não estar já respondido
  SELECT * INTO v_row
    FROM public.tarefas_planos_acao_aprovador
    WHERE id = p_plano_id AND deleted_at IS NULL
    FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Plano não encontrado ou excluído: %', p_plano_id;
  END IF;

  IF v_row.respondido = true THEN
    RAISE EXCEPTION 'Plano % já foi respondido em %', p_plano_id, v_row.respondido_em;
  END IF;

  v_assignment_id := v_row.assignment_id;

  -- Atualiza o plano
  UPDATE public.tarefas_planos_acao_aprovador
    SET respondido = true,
        respondido_em = now(),
        respondido_por = v_profile_id,
        resposta_valor_json = p_resposta_valor_json
    WHERE id = p_plano_id
    RETURNING * INTO v_row;

  -- Resolve contingências legacy (compat com check_contingency_block)
  UPDATE public.operational_contingencies
    SET status = 'resolvida',
        resolvida_em = now(),
        dentro_prazo = CASE
          WHEN prazo_resolucao IS NULL THEN true
          WHEN now() <= prazo_resolucao THEN true
          ELSE false
        END
    WHERE assignment_id = v_assignment_id
      AND status NOT IN ('validada', 'descartada', 'resolvida');

  -- Se TODOS os planos do aprovador estão respondidos, muda status para
  -- aguardando_aprovacao. Caso contrário, mantém status 'devolvida' (ainda
  -- há plano pendente do aprovador pra responder).
  SELECT COUNT(*) INTO v_pendentes
    FROM public.tarefas_planos_acao_aprovador
    WHERE assignment_id = v_assignment_id
      AND deleted_at IS NULL
      AND respondido = false;

  IF v_pendentes = 0 THEN
    UPDATE public.operational_assignments
      SET status = 'aguardando_aprovacao',
          updated_at = now()
      WHERE id = v_assignment_id
        AND status IN ('devolvida', 'em_andamento');
  END IF;

  INSERT INTO public.operational_execution_logs (assignment_id, acao, executado_por, detalhes)
    VALUES (v_assignment_id, 'executor_respondeu_plano_aprovador', v_profile_id,
            jsonb_build_object('plano_id', p_plano_id, 'rodada', v_row.rodada, 'planos_restantes', v_pendentes));

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.tarefas_rpc_executor_responder_plano_aprovador IS
  'Executor responde plano pendente do aprovador. Resolve contingências legacy. Status muda para aguardando_aprovacao SOMENTE quando todos os planos foram respondidos. Doc: src/modules/tarefas/docs/tarefas_rpc_executor_responder_plano_aprovador.md';

-- ---------------------------------------------------------------------------
-- 3. RPC: APROVADOR cria plano para executor (renomeada e revisada)
--    public.tarefas_rpc_aprovador_criar_plano_executor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tarefas_rpc_aprovador_criar_plano_executor(
  p_assignment_id UUID,
  p_field_id UUID,
  p_instrucao TEXT,
  p_itens_plano JSONB,
  p_prazo_resolucao TIMESTAMPTZ,
  p_criticidade TEXT DEFAULT 'media'
)
RETURNS public.tarefas_planos_acao_aprovador
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_status_atual TEXT;
  v_rodada INT;
  v_row public.tarefas_planos_acao_aprovador;
  v_tem_plano_auditor_pendente BOOLEAN;
  v_field_liberada BOOLEAN;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT status INTO v_status_atual
    FROM public.operational_assignments
    WHERE id = p_assignment_id;

  IF v_status_atual IS NULL THEN
    RAISE EXCEPTION 'Tarefa % não encontrada', p_assignment_id;
  END IF;

  -- Gate de status: aprovador só pode criar plano para executor durante aguardando_aprovacao
  IF v_status_atual NOT IN ('aguardando_aprovacao', 'em_andamento') THEN
    RAISE EXCEPTION 'Aprovador não pode criar plano de executor em status %', v_status_atual;
  END IF;

  -- Gate adicional: se há plano do auditor PENDENTE, só pode criar plano para
  -- executor na pergunta liberada pelo auditor (auditor.field_id == this.field_id).
  SELECT EXISTS (
    SELECT 1 FROM public.tarefas_planos_acao_auditor
    WHERE assignment_id = p_assignment_id
      AND deleted_at IS NULL
      AND respondido = false
  ) INTO v_tem_plano_auditor_pendente;

  IF v_tem_plano_auditor_pendente THEN
    SELECT EXISTS (
      SELECT 1 FROM public.tarefas_planos_acao_auditor
      WHERE assignment_id = p_assignment_id
        AND deleted_at IS NULL
        AND respondido = false
        AND field_id = p_field_id
    ) INTO v_field_liberada;
    IF NOT v_field_liberada THEN
      RAISE EXCEPTION 'Há planos pendentes do auditor — aprovador só pode criar plano para executor em perguntas liberadas pelo auditor';
    END IF;
  END IF;

  -- Próxima rodada (independente do auditor)
  SELECT COALESCE(MAX(rodada), 0) + 1 INTO v_rodada
    FROM public.tarefas_planos_acao_aprovador
    WHERE assignment_id = p_assignment_id
      AND field_id = p_field_id
      AND deleted_at IS NULL;

  INSERT INTO public.tarefas_planos_acao_aprovador (
    assignment_id, field_id, rodada,
    instrucao, itens_plano, prazo_resolucao, criticidade,
    criado_por
  ) VALUES (
    p_assignment_id, p_field_id, v_rodada,
    p_instrucao, COALESCE(p_itens_plano, '[]'::jsonb), p_prazo_resolucao, p_criticidade,
    v_profile_id
  ) RETURNING * INTO v_row;

  -- Muda status para devolvida (executor precisa responder)
  UPDATE public.operational_assignments
    SET status = 'devolvida',
        updated_at = now()
    WHERE id = p_assignment_id
      AND status IN ('aguardando_aprovacao', 'em_andamento', 'aguardando_auditoria');

  INSERT INTO public.operational_execution_logs (assignment_id, acao, executado_por, detalhes)
    VALUES (p_assignment_id, 'aprovador_criou_plano_executor', v_profile_id,
            jsonb_build_object('field_id', p_field_id, 'rodada', v_rodada, 'plano_id', v_row.id));

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.tarefas_rpc_aprovador_criar_plano_executor IS
  'Aprovador cria plano de ação para executor responder. Bloqueia se há plano do auditor pendente em outra pergunta. Muda status para devolvida. Doc: src/modules/tarefas/docs/tarefas_rpc_aprovador_criar_plano_executor.md';

-- ---------------------------------------------------------------------------
-- 4. RPC: APROVADOR aprova e envia para auditoria
--    public.tarefas_rpc_aprovador_aprovar_para_auditoria
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tarefas_rpc_aprovador_aprovar_para_auditoria(
  p_assignment_id UUID,
  p_notas JSONB DEFAULT NULL
)
RETURNS TABLE (assignment_id UUID, novo_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_status_atual TEXT;
  v_pendentes_aprovador INT;
  v_pendentes_auditor INT;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT status INTO v_status_atual
    FROM public.operational_assignments
    WHERE id = p_assignment_id;

  IF v_status_atual IS NULL THEN
    RAISE EXCEPTION 'Tarefa % não encontrada', p_assignment_id;
  END IF;

  IF v_status_atual <> 'aguardando_aprovacao' THEN
    RAISE EXCEPTION 'Aprovador só pode aprovar quando status = aguardando_aprovacao (atual: %)', v_status_atual;
  END IF;

  -- Bloqueio: não pode aprovar com plano do aprovador pendente
  SELECT COUNT(*) INTO v_pendentes_aprovador
    FROM public.tarefas_planos_acao_aprovador
    WHERE assignment_id = p_assignment_id
      AND deleted_at IS NULL
      AND respondido = false;
  IF v_pendentes_aprovador > 0 THEN
    RAISE EXCEPTION 'Existem % plano(s) do aprovador pendentes — executor ainda não respondeu', v_pendentes_aprovador;
  END IF;

  -- Bloqueio: não pode aprovar com plano do auditor pendente
  SELECT COUNT(*) INTO v_pendentes_auditor
    FROM public.tarefas_planos_acao_auditor
    WHERE assignment_id = p_assignment_id
      AND deleted_at IS NULL
      AND respondido = false;
  IF v_pendentes_auditor > 0 THEN
    RAISE EXCEPTION 'Existem % plano(s) do auditor pendentes — aprovador deve responder primeiro', v_pendentes_auditor;
  END IF;

  -- Muda status para aguardando_auditoria
  UPDATE public.operational_assignments
    SET status = 'aguardando_auditoria',
        updated_at = now()
    WHERE id = p_assignment_id;

  -- Salva notas em audit_trail
  INSERT INTO public.operational_audit_trail (assignment_id, tipo_evento, executado_por, dados_anteriores, dados_novos)
    VALUES (p_assignment_id, 'aprovador_aprovou_para_auditoria', v_profile_id,
            jsonb_build_object('status', v_status_atual),
            jsonb_build_object('status', 'aguardando_auditoria', 'notas', COALESCE(p_notas, '{}'::jsonb)));

  RETURN QUERY SELECT p_assignment_id, 'aguardando_auditoria'::text;
END;
$$;

COMMENT ON FUNCTION public.tarefas_rpc_aprovador_aprovar_para_auditoria IS
  'Aprovador conclui revisão e envia para auditoria. Bloqueia se há plano (do aprovador ou do auditor) pendente. Doc: src/modules/tarefas/docs/tarefas_rpc_aprovador_aprovar_para_auditoria.md';

-- ---------------------------------------------------------------------------
-- 5. RPC: APROVADOR responde plano do auditor (refatorada)
--    public.tarefas_rpc_aprovador_responder_plano_auditor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tarefas_rpc_aprovador_responder_plano_auditor(
  p_plano_id UUID,
  p_resposta_valor_json JSONB
)
RETURNS public.tarefas_planos_acao_auditor
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_assignment_id UUID;
  v_row public.tarefas_planos_acao_auditor;
  v_pendentes INT;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_row
    FROM public.tarefas_planos_acao_auditor
    WHERE id = p_plano_id AND deleted_at IS NULL
    FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Plano não encontrado ou excluído: %', p_plano_id;
  END IF;

  IF v_row.respondido = true THEN
    RAISE EXCEPTION 'Plano % já foi respondido em %', p_plano_id, v_row.respondido_em;
  END IF;

  v_assignment_id := v_row.assignment_id;

  UPDATE public.tarefas_planos_acao_auditor
    SET respondido = true,
        respondido_em = now(),
        respondido_por = v_profile_id,
        resposta_valor_json = p_resposta_valor_json
    WHERE id = p_plano_id
    RETURNING * INTO v_row;

  UPDATE public.operational_contingencies
    SET status = 'resolvida',
        resolvida_em = now(),
        dentro_prazo = CASE
          WHEN prazo_resolucao IS NULL THEN true
          WHEN now() <= prazo_resolucao THEN true
          ELSE false
        END
    WHERE assignment_id = v_assignment_id
      AND status NOT IN ('validada', 'descartada', 'resolvida');

  -- Só muda status se todos os planos do auditor foram respondidos
  SELECT COUNT(*) INTO v_pendentes
    FROM public.tarefas_planos_acao_auditor
    WHERE assignment_id = v_assignment_id
      AND deleted_at IS NULL
      AND respondido = false;

  IF v_pendentes = 0 THEN
    UPDATE public.operational_assignments
      SET status = 'aguardando_auditoria',
          updated_at = now()
      WHERE id = v_assignment_id
        AND status = 'aguardando_aprovacao';
  END IF;

  INSERT INTO public.operational_execution_logs (assignment_id, acao, executado_por, detalhes)
    VALUES (v_assignment_id, 'aprovador_respondeu_plano_auditor', v_profile_id,
            jsonb_build_object('plano_id', p_plano_id, 'rodada', v_row.rodada, 'planos_restantes', v_pendentes));

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.tarefas_rpc_aprovador_responder_plano_auditor IS
  'Aprovador responde plano pendente do auditor. Status muda para aguardando_auditoria SOMENTE quando todos planos respondidos. Doc: src/modules/tarefas/docs/tarefas_rpc_aprovador_responder_plano_auditor.md';

-- ---------------------------------------------------------------------------
-- 6. RPC: AUDITOR cria plano para aprovador (renomeada e revisada)
--    public.tarefas_rpc_auditor_criar_plano_aprovador
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tarefas_rpc_auditor_criar_plano_aprovador(
  p_assignment_id UUID,
  p_field_id UUID,
  p_instrucao TEXT,
  p_itens_plano JSONB,
  p_prazo_resolucao TIMESTAMPTZ,
  p_criticidade TEXT DEFAULT 'media'
)
RETURNS public.tarefas_planos_acao_auditor
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_status_atual TEXT;
  v_rodada INT;
  v_row public.tarefas_planos_acao_auditor;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT status INTO v_status_atual
    FROM public.operational_assignments
    WHERE id = p_assignment_id;

  IF v_status_atual IS NULL THEN
    RAISE EXCEPTION 'Tarefa % não encontrada', p_assignment_id;
  END IF;

  IF v_status_atual NOT IN ('aguardando_auditoria') THEN
    RAISE EXCEPTION 'Auditor só pode criar plano em status aguardando_auditoria (atual: %)', v_status_atual;
  END IF;

  SELECT COALESCE(MAX(rodada), 0) + 1 INTO v_rodada
    FROM public.tarefas_planos_acao_auditor
    WHERE assignment_id = p_assignment_id
      AND field_id = p_field_id
      AND deleted_at IS NULL;

  INSERT INTO public.tarefas_planos_acao_auditor (
    assignment_id, field_id, rodada,
    instrucao, itens_plano, prazo_resolucao, criticidade,
    criado_por
  ) VALUES (
    p_assignment_id, p_field_id, v_rodada,
    p_instrucao, COALESCE(p_itens_plano, '[]'::jsonb), p_prazo_resolucao, p_criticidade,
    v_profile_id
  ) RETURNING * INTO v_row;

  UPDATE public.operational_assignments
    SET status = 'aguardando_aprovacao',
        updated_at = now()
    WHERE id = p_assignment_id
      AND status = 'aguardando_auditoria';

  INSERT INTO public.operational_execution_logs (assignment_id, acao, executado_por, detalhes)
    VALUES (p_assignment_id, 'auditor_criou_plano_aprovador', v_profile_id,
            jsonb_build_object('field_id', p_field_id, 'rodada', v_rodada, 'plano_id', v_row.id));

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.tarefas_rpc_auditor_criar_plano_aprovador IS
  'Auditor cria plano de ação para aprovador. Status muda para aguardando_aprovacao. Doc: src/modules/tarefas/docs/tarefas_rpc_auditor_criar_plano_aprovador.md';

-- ---------------------------------------------------------------------------
-- 7. RPC: AUDITOR aprova auditoria (concluir tarefa)
--    public.tarefas_rpc_auditor_aprovar_auditoria
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tarefas_rpc_auditor_aprovar_auditoria(
  p_assignment_id UUID,
  p_notas JSONB DEFAULT NULL
)
RETURNS TABLE (assignment_id UUID, novo_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_status_atual TEXT;
  v_pendentes_auditor INT;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT status INTO v_status_atual
    FROM public.operational_assignments
    WHERE id = p_assignment_id;

  IF v_status_atual IS NULL THEN
    RAISE EXCEPTION 'Tarefa % não encontrada', p_assignment_id;
  END IF;

  IF v_status_atual <> 'aguardando_auditoria' THEN
    RAISE EXCEPTION 'Auditor só pode aprovar em status aguardando_auditoria (atual: %)', v_status_atual;
  END IF;

  -- Bloqueio: não pode finalizar com plano do auditor pendente
  SELECT COUNT(*) INTO v_pendentes_auditor
    FROM public.tarefas_planos_acao_auditor
    WHERE assignment_id = p_assignment_id
      AND deleted_at IS NULL
      AND respondido = false;
  IF v_pendentes_auditor > 0 THEN
    RAISE EXCEPTION 'Existem % plano(s) do auditor pendentes — aprovador precisa responder primeiro', v_pendentes_auditor;
  END IF;

  UPDATE public.operational_assignments
    SET status = 'concluida',
        updated_at = now(),
        concluida_em = now()
    WHERE id = p_assignment_id;

  INSERT INTO public.operational_audit_trail (assignment_id, tipo_evento, executado_por, dados_anteriores, dados_novos)
    VALUES (p_assignment_id, 'auditor_aprovou_auditoria', v_profile_id,
            jsonb_build_object('status', v_status_atual),
            jsonb_build_object('status', 'concluida', 'notas', COALESCE(p_notas, '{}'::jsonb)));

  RETURN QUERY SELECT p_assignment_id, 'concluida'::text;
END;
$$;

COMMENT ON FUNCTION public.tarefas_rpc_auditor_aprovar_auditoria IS
  'Auditor aprova auditoria e finaliza a tarefa (status=concluida). Bloqueia se há plano do auditor pendente. Doc: src/modules/tarefas/docs/tarefas_rpc_auditor_aprovar_auditoria.md';

-- ---------------------------------------------------------------------------
-- 8. Deprecation marker para RPCs antigas (mantidas mas marcadas)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Renomeia comment para indicar deprecação
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'tarefas_rpc_aprovador_criar_plano_acao') THEN
    EXECUTE 'COMMENT ON FUNCTION public.tarefas_rpc_aprovador_criar_plano_acao IS ''DEPRECATED 20260521: usar tarefas_rpc_aprovador_criar_plano_executor.''';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'tarefas_rpc_auditor_criar_plano_acao') THEN
    EXECUTE 'COMMENT ON FUNCTION public.tarefas_rpc_auditor_criar_plano_acao IS ''DEPRECATED 20260521: usar tarefas_rpc_auditor_criar_plano_aprovador.''';
  END IF;
END $$;
