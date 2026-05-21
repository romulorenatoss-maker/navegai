-- ============================================================================
-- TAREFAS - RPCs do fluxo com aliases completos
-- ============================================================================

ALTER TABLE public.operational_field_answers
  ADD COLUMN IF NOT EXISTS observacao TEXT;

-- 1. Executor envia respostas R0
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
  v_responsavel_id UUID;
  v_setor_executor_id UUID;
  v_is_setor_member BOOLEAN := FALSE;
  v_is_admin BOOLEAN := FALSE;
  v_count INT := 0;
  v_respostas_existentes INT := 0;
  v_resposta JSONB;
  v_field_id UUID;
BEGIN
  SELECT p.id INTO v_profile_id FROM public.profiles AS p WHERE p.user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  SELECT COALESCE(public.is_admin(auth.uid()), FALSE) INTO v_is_admin;

  SELECT oa.status, oa.responsavel_id, oa.setor_executor_id
    INTO v_status_atual, v_responsavel_id, v_setor_executor_id
    FROM public.operational_assignments AS oa
    WHERE oa.id = p_assignment_id FOR UPDATE;

  IF v_status_atual IS NULL THEN RAISE EXCEPTION 'Tarefa % nao encontrada', p_assignment_id; END IF;
  IF v_status_atual NOT IN ('pendente', 'em_andamento') THEN
    RAISE EXCEPTION 'R0 ja foi enviada ou a tarefa esta em status %, use a RPC de plano quando aplicavel', v_status_atual;
  END IF;

  IF NOT v_is_admin THEN
    IF v_responsavel_id IS NOT NULL AND v_responsavel_id <> v_profile_id THEN
      RAISE EXCEPTION 'Usuario sem permissao para enviar R0 desta tarefa';
    END IF;
    IF v_responsavel_id IS NULL AND v_setor_executor_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.colaborador_setores AS cs
        WHERE cs.profile_id = v_profile_id AND cs.setor_id = v_setor_executor_id
      ) INTO v_is_setor_member;
      IF NOT v_is_setor_member THEN
        RAISE EXCEPTION 'Usuario fora do setor executor da tarefa';
      END IF;
    END IF;
  END IF;

  IF jsonb_typeof(COALESCE(p_respostas, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Payload de respostas deve ser um array JSON';
  END IF;

  SELECT COUNT(*) INTO v_respostas_existentes
    FROM public.operational_field_answers AS ofa
    WHERE ofa.assignment_id = p_assignment_id;

  IF v_respostas_existentes > 0 THEN
    RAISE EXCEPTION 'R0 ja existe para esta tarefa; overwrite de resposta original e bloqueado';
  END IF;

  FOR v_resposta IN
    SELECT resposta_elem.value
      FROM jsonb_array_elements(COALESCE(p_respostas, '[]'::jsonb)) AS resposta_elem(value)
  LOOP
    v_field_id := NULLIF(v_resposta->>'field_id', '')::uuid;
    IF v_field_id IS NULL THEN RAISE EXCEPTION 'Resposta sem field_id'; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.operational_assignments AS oa
        CROSS JOIN LATERAL jsonb_array_elements(
          COALESCE((oa.template_snapshot::jsonb)->'fields', '[]'::jsonb)
        ) AS field_snapshot(value)
        WHERE oa.id = p_assignment_id
          AND (field_snapshot.value->>'id')::uuid = v_field_id
    ) THEN
      RAISE EXCEPTION 'Pergunta % nao pertence ao snapshot da tarefa %', v_field_id, p_assignment_id;
    END IF;

    INSERT INTO public.operational_field_answers (
      assignment_id, field_id, valor_booleano, valor_texto, valor_numero, valor_json,
      evidencia_url, evidencia_anexo_id, evidencia_mime_type, observacao, respondido_por, respondido_em
    ) VALUES (
      p_assignment_id, v_field_id,
      NULLIF(v_resposta->>'valor_booleano', '')::boolean,
      v_resposta->>'valor_texto',
      NULLIF(v_resposta->>'valor_numero', '')::numeric,
      v_resposta->'valor_json',
      v_resposta->>'evidencia_url',
      NULLIF(v_resposta->>'evidencia_anexo_id', '')::uuid,
      v_resposta->>'evidencia_mime_type',
      v_resposta->>'observacao',
      v_profile_id, now()
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.operational_assignments AS oa
    SET status = 'aguardando_aprovacao', updated_at = now(),
        finalizado_em = COALESCE(oa.finalizado_em, now())
    WHERE oa.id = p_assignment_id;

  INSERT INTO public.operational_execution_logs (assignment_id, acao, executado_por, detalhes)
  VALUES (p_assignment_id, 'executor_enviou_respostas', v_profile_id,
    jsonb_build_object('total_respostas', v_count, 'status_anterior', v_status_atual, 'bloqueio_overwrite_r0', true));

  RETURN QUERY SELECT p_assignment_id, 'aguardando_aprovacao'::text, v_count;
END;
$$;

COMMENT ON FUNCTION public.tarefas_rpc_executor_enviar_respostas IS
  'Salva R0 uma unica vez e muda status para aguardando_aprovacao. Aliases qualificados para evitar ambiguidade.';

-- 2. Executor responde plano do aprovador
CREATE OR REPLACE FUNCTION public.tarefas_rpc_executor_responder_plano_aprovador(
  p_plano_id UUID, p_resposta_valor_json JSONB
)
RETURNS public.tarefas_planos_acao_aprovador
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID; v_assignment_id UUID;
  v_row public.tarefas_planos_acao_aprovador; v_pendentes INT;
BEGIN
  SELECT p.id INTO v_profile_id FROM public.profiles AS p WHERE p.user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  SELECT tpa.* INTO v_row FROM public.tarefas_planos_acao_aprovador AS tpa
    WHERE tpa.id = p_plano_id AND tpa.deleted_at IS NULL FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Plano nao encontrado ou excluido: %', p_plano_id; END IF;
  IF v_row.respondido = true THEN
    RAISE EXCEPTION 'Plano % ja foi respondido em %', p_plano_id, v_row.respondido_em;
  END IF;

  v_assignment_id := v_row.assignment_id;

  UPDATE public.tarefas_planos_acao_aprovador AS tpa
    SET respondido = true, respondido_em = now(),
        respondido_por = v_profile_id, resposta_valor_json = p_resposta_valor_json
    WHERE tpa.id = p_plano_id RETURNING tpa.* INTO v_row;

  UPDATE public.operational_contingencies AS oc
    SET status = 'resolvida', resolvida_em = now(),
        dentro_prazo = CASE
          WHEN oc.prazo_resolucao IS NULL THEN true
          WHEN now() <= oc.prazo_resolucao THEN true ELSE false END
    WHERE oc.assignment_id = v_assignment_id
      AND oc.status NOT IN ('validada', 'descartada', 'resolvida');

  SELECT COUNT(*) INTO v_pendentes FROM public.tarefas_planos_acao_aprovador AS tpa
    WHERE tpa.assignment_id = v_assignment_id AND tpa.deleted_at IS NULL AND tpa.respondido = false;

  IF v_pendentes = 0 THEN
    UPDATE public.operational_assignments AS oa
      SET status = 'aguardando_aprovacao', updated_at = now()
      WHERE oa.id = v_assignment_id AND oa.status IN ('devolvida', 'em_andamento');
  END IF;

  INSERT INTO public.operational_execution_logs (assignment_id, acao, executado_por, detalhes)
  VALUES (v_assignment_id, 'executor_respondeu_plano_aprovador', v_profile_id,
    jsonb_build_object('plano_id', p_plano_id, 'rodada', v_row.rodada, 'planos_restantes', v_pendentes));

  RETURN v_row;
END;
$$;

-- 3. aprovador cria plano de acao (legacy alias)
CREATE OR REPLACE FUNCTION public.tarefas_rpc_aprovador_criar_plano_acao(
  p_assignment_id UUID, p_field_id UUID, p_instrucao TEXT, p_itens_plano JSONB,
  p_prazo_resolucao TIMESTAMPTZ, p_criticidade TEXT DEFAULT 'media'
)
RETURNS public.tarefas_planos_acao_aprovador
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_profile_id UUID; v_rodada INT; v_row public.tarefas_planos_acao_aprovador;
BEGIN
  SELECT p.id INTO v_profile_id FROM public.profiles AS p WHERE p.user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  SELECT COALESCE(MAX(tpa.rodada), 0) + 1 INTO v_rodada
    FROM public.tarefas_planos_acao_aprovador AS tpa
    WHERE tpa.assignment_id = p_assignment_id AND tpa.field_id = p_field_id AND tpa.deleted_at IS NULL;

  INSERT INTO public.tarefas_planos_acao_aprovador AS tpa (
    assignment_id, field_id, rodada, instrucao, itens_plano, prazo_resolucao, criticidade, criado_por
  ) VALUES (
    p_assignment_id, p_field_id, v_rodada, p_instrucao,
    COALESCE(p_itens_plano, '[]'::jsonb), p_prazo_resolucao, p_criticidade, v_profile_id
  ) RETURNING tpa.* INTO v_row;
  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.tarefas_rpc_aprovador_criar_plano_acao IS
  'DEPRECATED 20260521: usar tarefas_rpc_aprovador_criar_plano_executor.';

-- 4. Aprovador cria plano para executor
CREATE OR REPLACE FUNCTION public.tarefas_rpc_aprovador_criar_plano_executor(
  p_assignment_id UUID, p_field_id UUID, p_instrucao TEXT, p_itens_plano JSONB,
  p_prazo_resolucao TIMESTAMPTZ, p_criticidade TEXT DEFAULT 'media'
)
RETURNS public.tarefas_planos_acao_aprovador
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID; v_status_atual TEXT; v_rodada INT;
  v_row public.tarefas_planos_acao_aprovador;
  v_tem_plano_auditor_pendente BOOLEAN; v_field_liberada BOOLEAN;
BEGIN
  SELECT p.id INTO v_profile_id FROM public.profiles AS p WHERE p.user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  SELECT oa.status INTO v_status_atual FROM public.operational_assignments AS oa WHERE oa.id = p_assignment_id;
  IF v_status_atual IS NULL THEN RAISE EXCEPTION 'Tarefa % nao encontrada', p_assignment_id; END IF;
  IF v_status_atual NOT IN ('aguardando_aprovacao', 'em_andamento') THEN
    RAISE EXCEPTION 'Aprovador nao pode criar plano de executor em status %', v_status_atual;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.tarefas_planos_acao_auditor AS taa
    WHERE taa.assignment_id = p_assignment_id AND taa.deleted_at IS NULL AND taa.respondido = false
  ) INTO v_tem_plano_auditor_pendente;

  IF v_tem_plano_auditor_pendente THEN
    SELECT EXISTS (SELECT 1 FROM public.tarefas_planos_acao_auditor AS taa
      WHERE taa.assignment_id = p_assignment_id AND taa.deleted_at IS NULL
        AND taa.respondido = false AND taa.field_id = p_field_id
    ) INTO v_field_liberada;
    IF NOT v_field_liberada THEN
      RAISE EXCEPTION 'Ha planos pendentes do auditor - aprovador so pode criar plano para executor em perguntas liberadas pelo auditor';
    END IF;
  END IF;

  SELECT COALESCE(MAX(tpa.rodada), 0) + 1 INTO v_rodada
    FROM public.tarefas_planos_acao_aprovador AS tpa
    WHERE tpa.assignment_id = p_assignment_id AND tpa.field_id = p_field_id AND tpa.deleted_at IS NULL;

  INSERT INTO public.tarefas_planos_acao_aprovador AS tpa (
    assignment_id, field_id, rodada, instrucao, itens_plano, prazo_resolucao, criticidade, criado_por
  ) VALUES (
    p_assignment_id, p_field_id, v_rodada, p_instrucao,
    COALESCE(p_itens_plano, '[]'::jsonb), p_prazo_resolucao, p_criticidade, v_profile_id
  ) RETURNING tpa.* INTO v_row;

  UPDATE public.operational_assignments AS oa
    SET status = 'devolvida', updated_at = now()
    WHERE oa.id = p_assignment_id
      AND oa.status IN ('aguardando_aprovacao', 'em_andamento', 'aguardando_auditoria');

  INSERT INTO public.operational_execution_logs (assignment_id, acao, executado_por, detalhes)
  VALUES (p_assignment_id, 'aprovador_criou_plano_executor', v_profile_id,
    jsonb_build_object('field_id', p_field_id, 'rodada', v_rodada, 'plano_id', v_row.id));

  RETURN v_row;
END;
$$;

-- 5. Aprovador aprova e envia para auditoria
CREATE OR REPLACE FUNCTION public.tarefas_rpc_aprovador_aprovar_para_auditoria(
  p_assignment_id UUID, p_notas JSONB DEFAULT NULL
)
RETURNS TABLE (assignment_id UUID, novo_status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID; v_status_atual TEXT;
  v_pendentes_aprovador INT; v_pendentes_auditor INT;
BEGIN
  SELECT p.id INTO v_profile_id FROM public.profiles AS p WHERE p.user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  SELECT oa.status INTO v_status_atual FROM public.operational_assignments AS oa WHERE oa.id = p_assignment_id;
  IF v_status_atual IS NULL THEN RAISE EXCEPTION 'Tarefa % nao encontrada', p_assignment_id; END IF;
  IF v_status_atual <> 'aguardando_aprovacao' THEN
    RAISE EXCEPTION 'Aprovador so pode aprovar quando status = aguardando_aprovacao (atual: %)', v_status_atual;
  END IF;

  SELECT COUNT(*) INTO v_pendentes_aprovador FROM public.tarefas_planos_acao_aprovador AS tpa
    WHERE tpa.assignment_id = p_assignment_id AND tpa.deleted_at IS NULL AND tpa.respondido = false;
  IF v_pendentes_aprovador > 0 THEN
    RAISE EXCEPTION 'Existem % plano(s) do aprovador pendentes - executor ainda nao respondeu', v_pendentes_aprovador;
  END IF;

  SELECT COUNT(*) INTO v_pendentes_auditor FROM public.tarefas_planos_acao_auditor AS taa
    WHERE taa.assignment_id = p_assignment_id AND taa.deleted_at IS NULL AND taa.respondido = false;
  IF v_pendentes_auditor > 0 THEN
    RAISE EXCEPTION 'Existem % plano(s) do auditor pendentes - aprovador deve responder primeiro', v_pendentes_auditor;
  END IF;

  UPDATE public.operational_assignments AS oa
    SET status = 'aguardando_auditoria', updated_at = now() WHERE oa.id = p_assignment_id;

  INSERT INTO public.operational_audit_trail (assignment_id, tipo_evento, executado_por, dados_anteriores, dados_novos)
  VALUES (p_assignment_id, 'aprovador_aprovou_para_auditoria', v_profile_id,
    jsonb_build_object('status', v_status_atual),
    jsonb_build_object('status', 'aguardando_auditoria', 'notas', COALESCE(p_notas, '{}'::jsonb)));

  RETURN QUERY SELECT p_assignment_id, 'aguardando_auditoria'::text;
END;
$$;

-- 6. Aprovador responde plano do auditor
CREATE OR REPLACE FUNCTION public.tarefas_rpc_aprovador_responder_plano_auditor(
  p_plano_id UUID, p_resposta_valor_json JSONB
)
RETURNS public.tarefas_planos_acao_auditor
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID; v_assignment_id UUID;
  v_row public.tarefas_planos_acao_auditor; v_pendentes INT;
BEGIN
  SELECT p.id INTO v_profile_id FROM public.profiles AS p WHERE p.user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  SELECT taa.* INTO v_row FROM public.tarefas_planos_acao_auditor AS taa
    WHERE taa.id = p_plano_id AND taa.deleted_at IS NULL FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Plano nao encontrado ou excluido: %', p_plano_id; END IF;
  IF v_row.respondido = true THEN
    RAISE EXCEPTION 'Plano % ja foi respondido em %', p_plano_id, v_row.respondido_em;
  END IF;

  v_assignment_id := v_row.assignment_id;

  UPDATE public.tarefas_planos_acao_auditor AS taa
    SET respondido = true, respondido_em = now(),
        respondido_por = v_profile_id, resposta_valor_json = p_resposta_valor_json
    WHERE taa.id = p_plano_id RETURNING taa.* INTO v_row;

  UPDATE public.operational_contingencies AS oc
    SET status = 'resolvida', resolvida_em = now(),
        dentro_prazo = CASE
          WHEN oc.prazo_resolucao IS NULL THEN true
          WHEN now() <= oc.prazo_resolucao THEN true ELSE false END
    WHERE oc.assignment_id = v_assignment_id
      AND oc.status NOT IN ('validada', 'descartada', 'resolvida');

  SELECT COUNT(*) INTO v_pendentes FROM public.tarefas_planos_acao_auditor AS taa
    WHERE taa.assignment_id = v_assignment_id AND taa.deleted_at IS NULL AND taa.respondido = false;

  IF v_pendentes = 0 THEN
    UPDATE public.operational_assignments AS oa
      SET status = 'aguardando_auditoria', updated_at = now()
      WHERE oa.id = v_assignment_id AND oa.status = 'aguardando_aprovacao';
  END IF;

  INSERT INTO public.operational_execution_logs (assignment_id, acao, executado_por, detalhes)
  VALUES (v_assignment_id, 'aprovador_respondeu_plano_auditor', v_profile_id,
    jsonb_build_object('plano_id', p_plano_id, 'rodada', v_row.rodada, 'planos_restantes', v_pendentes));

  RETURN v_row;
END;
$$;

-- 7. auditor cria plano de acao (legacy alias)
CREATE OR REPLACE FUNCTION public.tarefas_rpc_auditor_criar_plano_acao(
  p_assignment_id UUID, p_field_id UUID, p_instrucao TEXT, p_itens_plano JSONB,
  p_prazo_resolucao TIMESTAMPTZ, p_criticidade TEXT DEFAULT 'media'
)
RETURNS public.tarefas_planos_acao_auditor
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_profile_id UUID; v_rodada INT; v_row public.tarefas_planos_acao_auditor;
BEGIN
  SELECT p.id INTO v_profile_id FROM public.profiles AS p WHERE p.user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  SELECT COALESCE(MAX(taa.rodada), 0) + 1 INTO v_rodada
    FROM public.tarefas_planos_acao_auditor AS taa
    WHERE taa.assignment_id = p_assignment_id AND taa.field_id = p_field_id AND taa.deleted_at IS NULL;

  INSERT INTO public.tarefas_planos_acao_auditor AS taa (
    assignment_id, field_id, rodada, instrucao, itens_plano, prazo_resolucao, criticidade, criado_por
  ) VALUES (
    p_assignment_id, p_field_id, v_rodada, p_instrucao,
    COALESCE(p_itens_plano, '[]'::jsonb), p_prazo_resolucao, p_criticidade, v_profile_id
  ) RETURNING taa.* INTO v_row;
  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.tarefas_rpc_auditor_criar_plano_acao IS
  'DEPRECATED 20260521: usar tarefas_rpc_auditor_criar_plano_aprovador.';

-- 8. Auditor cria plano para aprovador
CREATE OR REPLACE FUNCTION public.tarefas_rpc_auditor_criar_plano_aprovador(
  p_assignment_id UUID, p_field_id UUID, p_instrucao TEXT, p_itens_plano JSONB,
  p_prazo_resolucao TIMESTAMPTZ, p_criticidade TEXT DEFAULT 'media'
)
RETURNS public.tarefas_planos_acao_auditor
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID; v_status_atual TEXT; v_rodada INT;
  v_row public.tarefas_planos_acao_auditor;
BEGIN
  SELECT p.id INTO v_profile_id FROM public.profiles AS p WHERE p.user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  SELECT oa.status INTO v_status_atual FROM public.operational_assignments AS oa WHERE oa.id = p_assignment_id;
  IF v_status_atual IS NULL THEN RAISE EXCEPTION 'Tarefa % nao encontrada', p_assignment_id; END IF;
  IF v_status_atual NOT IN ('aguardando_auditoria') THEN
    RAISE EXCEPTION 'Auditor so pode criar plano em status aguardando_auditoria (atual: %)', v_status_atual;
  END IF;

  SELECT COALESCE(MAX(taa.rodada), 0) + 1 INTO v_rodada
    FROM public.tarefas_planos_acao_auditor AS taa
    WHERE taa.assignment_id = p_assignment_id AND taa.field_id = p_field_id AND taa.deleted_at IS NULL;

  INSERT INTO public.tarefas_planos_acao_auditor AS taa (
    assignment_id, field_id, rodada, instrucao, itens_plano, prazo_resolucao, criticidade, criado_por
  ) VALUES (
    p_assignment_id, p_field_id, v_rodada, p_instrucao,
    COALESCE(p_itens_plano, '[]'::jsonb), p_prazo_resolucao, p_criticidade, v_profile_id
  ) RETURNING taa.* INTO v_row;

  UPDATE public.operational_assignments AS oa
    SET status = 'aguardando_aprovacao', updated_at = now()
    WHERE oa.id = p_assignment_id AND oa.status = 'aguardando_auditoria';

  INSERT INTO public.operational_execution_logs (assignment_id, acao, executado_por, detalhes)
  VALUES (p_assignment_id, 'auditor_criou_plano_aprovador', v_profile_id,
    jsonb_build_object('field_id', p_field_id, 'rodada', v_rodada, 'plano_id', v_row.id));

  RETURN v_row;
END;
$$;

-- 9. Auditor aprova auditoria
CREATE OR REPLACE FUNCTION public.tarefas_rpc_auditor_aprovar_auditoria(
  p_assignment_id UUID, p_notas JSONB DEFAULT NULL
)
RETURNS TABLE (assignment_id UUID, novo_status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile_id UUID; v_status_atual TEXT; v_pendentes_auditor INT;
BEGIN
  SELECT p.id INTO v_profile_id FROM public.profiles AS p WHERE p.user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  SELECT oa.status INTO v_status_atual FROM public.operational_assignments AS oa WHERE oa.id = p_assignment_id;
  IF v_status_atual IS NULL THEN RAISE EXCEPTION 'Tarefa % nao encontrada', p_assignment_id; END IF;
  IF v_status_atual <> 'aguardando_auditoria' THEN
    RAISE EXCEPTION 'Auditor so pode aprovar em status aguardando_auditoria (atual: %)', v_status_atual;
  END IF;

  SELECT COUNT(*) INTO v_pendentes_auditor FROM public.tarefas_planos_acao_auditor AS taa
    WHERE taa.assignment_id = p_assignment_id AND taa.deleted_at IS NULL AND taa.respondido = false;
  IF v_pendentes_auditor > 0 THEN
    RAISE EXCEPTION 'Existem % plano(s) do auditor pendentes - aprovador precisa responder primeiro', v_pendentes_auditor;
  END IF;

  UPDATE public.operational_assignments AS oa
    SET status = 'concluida', updated_at = now(), concluida_em = now()
    WHERE oa.id = p_assignment_id;

  INSERT INTO public.operational_audit_trail (assignment_id, tipo_evento, executado_por, dados_anteriores, dados_novos)
  VALUES (p_assignment_id, 'auditor_aprovou_auditoria', v_profile_id,
    jsonb_build_object('status', v_status_atual),
    jsonb_build_object('status', 'concluida', 'notas', COALESCE(p_notas, '{}'::jsonb)));

  RETURN QUERY SELECT p_assignment_id, 'concluida'::text;
END;
$$;

NOTIFY pgrst, 'reload schema';