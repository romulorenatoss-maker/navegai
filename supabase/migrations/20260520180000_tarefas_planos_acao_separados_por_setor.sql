-- =============================================================================
-- ARQUITETURA: Planos de ação SEPARADOS POR SETOR (tarefas)
-- =============================================================================
-- Antes deste refactor, todos os planos de ação ficavam em
-- operational_field_reviews com criado_por_papel='aprovador' ou 'auditor'.
-- Isso causava COLISÃO DE RODADA quando aprovador e auditor criavam plano
-- no mesmo field — ambos usavam a mesma sequência inteira (R1, R2...).
--
-- Solução: 2 tabelas dedicadas, cada uma com sua sequência R1/R2/R3...
-- independente. Auditor e aprovador podem ter R1 simultâneo sem conflito.
--
--   tarefas_planos_acao_aprovador → aprovador CRIA, executor RESPONDE
--   tarefas_planos_acao_auditor   → auditor   CRIA, aprovador RESPONDE
--
-- Cada plano carrega:
--   - identificação (assignment + field + rodada)
--   - conteúdo (instrução, itens, prazo, criticidade)
--   - criação (criado_em, criado_por)
--   - resposta (respondido, respondido_em, respondido_por, resposta_valor_json)
--
-- Triggers automatizam transições de status:
--   APÓS aprovador criar     → status = devolvida
--   APÓS executor responder  → status = aguardando_aprovacao
--   APÓS auditor criar       → status = aguardando_aprovacao
--   APÓS aprovador responder → status = aguardando_auditoria
--
-- 1 ação = 1 RPC (Regra 4). 1 responsabilidade = 1 trigger.
-- Docs por regra em src/modules/tarefas/docs/.
-- =============================================================================

-- =============================================================================
-- 1. TABELA: tarefas_planos_acao_aprovador
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.tarefas_planos_acao_aprovador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  field_id UUID NOT NULL,
  rodada INT NOT NULL CHECK (rodada >= 1),

  -- Conteúdo do plano
  instrucao TEXT,
  itens_plano JSONB NOT NULL DEFAULT '[]'::jsonb,
  prazo_resolucao TIMESTAMPTZ,
  criticidade TEXT CHECK (criticidade IN ('baixa', 'media', 'alta')),

  -- Auditoria de criação
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por UUID REFERENCES public.profiles(id),

  -- Resposta do executor
  respondido BOOLEAN NOT NULL DEFAULT false,
  respondido_em TIMESTAMPTZ,
  respondido_por UUID REFERENCES public.profiles(id),
  resposta_valor_json JSONB,

  -- Multi-tenant
  tenant_id UUID,

  -- Soft delete (Regra 4)
  deleted_at TIMESTAMPTZ,

  -- Garantia: 1 rodada única por (assignment, field) DENTRO desta tabela
  UNIQUE (assignment_id, field_id, rodada)
);

COMMENT ON TABLE public.tarefas_planos_acao_aprovador IS
  'Planos de ação criados pelo APROVADOR para o EXECUTOR responder. Sequência de rodada INDEPENDENTE da tabela do auditor. Doc: src/modules/tarefas/docs/tarefas_tabela_planos_acao_aprovador.md';

CREATE INDEX IF NOT EXISTS idx_tarefas_planos_aprov_assignment
  ON public.tarefas_planos_acao_aprovador (assignment_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_planos_aprov_field
  ON public.tarefas_planos_acao_aprovador (assignment_id, field_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_planos_aprov_pendentes
  ON public.tarefas_planos_acao_aprovador (assignment_id) WHERE respondido = false;

-- =============================================================================
-- 2. TABELA: tarefas_planos_acao_auditor
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.tarefas_planos_acao_auditor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  field_id UUID NOT NULL,
  rodada INT NOT NULL CHECK (rodada >= 1),

  -- Conteúdo
  instrucao TEXT,
  itens_plano JSONB NOT NULL DEFAULT '[]'::jsonb,
  prazo_resolucao TIMESTAMPTZ,
  criticidade TEXT CHECK (criticidade IN ('baixa', 'media', 'alta')),

  -- Auditoria
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por UUID REFERENCES public.profiles(id),

  -- Resposta do aprovador
  respondido BOOLEAN NOT NULL DEFAULT false,
  respondido_em TIMESTAMPTZ,
  respondido_por UUID REFERENCES public.profiles(id),
  resposta_valor_json JSONB,

  -- Tenant
  tenant_id UUID,

  -- Soft delete
  deleted_at TIMESTAMPTZ,

  UNIQUE (assignment_id, field_id, rodada)
);

COMMENT ON TABLE public.tarefas_planos_acao_auditor IS
  'Planos de ação criados pelo AUDITOR para o APROVADOR responder. Sequência de rodada INDEPENDENTE da tabela do aprovador. Doc: src/modules/tarefas/docs/tarefas_tabela_planos_acao_auditor.md';

CREATE INDEX IF NOT EXISTS idx_tarefas_planos_audit_assignment
  ON public.tarefas_planos_acao_auditor (assignment_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_planos_audit_field
  ON public.tarefas_planos_acao_auditor (assignment_id, field_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_planos_audit_pendentes
  ON public.tarefas_planos_acao_auditor (assignment_id) WHERE respondido = false;

-- =============================================================================
-- 3. RPCs (1 ação = 1 função, Regra 4)
-- =============================================================================

-- 3.1 — Aprovador cria plano para executor
-- Doc: src/modules/tarefas/docs/tarefas_rpc_aprovador_criar_plano_acao.md
CREATE OR REPLACE FUNCTION public.tarefas_rpc_aprovador_criar_plano_acao(
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
  v_tenant_id UUID;
  v_rodada INT;
  v_row public.tarefas_planos_acao_aprovador;
BEGIN
  SELECT id, tenant_id INTO v_profile_id, v_tenant_id
    FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Próxima rodada DENTRO da tabela do aprovador (independente do auditor)
  SELECT COALESCE(MAX(rodada), 0) + 1 INTO v_rodada
    FROM public.tarefas_planos_acao_aprovador
    WHERE assignment_id = p_assignment_id
      AND field_id = p_field_id
      AND deleted_at IS NULL;

  INSERT INTO public.tarefas_planos_acao_aprovador (
    assignment_id, field_id, rodada,
    instrucao, itens_plano, prazo_resolucao, criticidade,
    criado_por, tenant_id
  ) VALUES (
    p_assignment_id, p_field_id, v_rodada,
    p_instrucao, COALESCE(p_itens_plano, '[]'::jsonb), p_prazo_resolucao, p_criticidade,
    v_profile_id, v_tenant_id
  ) RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.tarefas_rpc_aprovador_criar_plano_acao IS
  'RPC: aprovador cria plano de ação para executor responder. Trigger associado muda status para devolvida. Doc: src/modules/tarefas/docs/tarefas_rpc_aprovador_criar_plano_acao.md';

-- 3.2 — Executor responde plano do aprovador
-- Doc: src/modules/tarefas/docs/tarefas_rpc_executor_responder_plano_aprovador.md
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
  v_row public.tarefas_planos_acao_aprovador;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  UPDATE public.tarefas_planos_acao_aprovador
    SET respondido = true,
        respondido_em = now(),
        respondido_por = v_profile_id,
        resposta_valor_json = p_resposta_valor_json
    WHERE id = p_plano_id
      AND deleted_at IS NULL
    RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Plano não encontrado ou já excluído: %', p_plano_id;
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.tarefas_rpc_executor_responder_plano_aprovador IS
  'RPC: executor responde a plano de ação do aprovador. Trigger muda status para aguardando_aprovacao. Doc: src/modules/tarefas/docs/tarefas_rpc_executor_responder_plano_aprovador.md';

-- 3.3 — Auditor cria plano para aprovador
-- Doc: src/modules/tarefas/docs/tarefas_rpc_auditor_criar_plano_acao.md
CREATE OR REPLACE FUNCTION public.tarefas_rpc_auditor_criar_plano_acao(
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
  v_tenant_id UUID;
  v_rodada INT;
  v_row public.tarefas_planos_acao_auditor;
BEGIN
  SELECT id, tenant_id INTO v_profile_id, v_tenant_id
    FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT COALESCE(MAX(rodada), 0) + 1 INTO v_rodada
    FROM public.tarefas_planos_acao_auditor
    WHERE assignment_id = p_assignment_id
      AND field_id = p_field_id
      AND deleted_at IS NULL;

  INSERT INTO public.tarefas_planos_acao_auditor (
    assignment_id, field_id, rodada,
    instrucao, itens_plano, prazo_resolucao, criticidade,
    criado_por, tenant_id
  ) VALUES (
    p_assignment_id, p_field_id, v_rodada,
    p_instrucao, COALESCE(p_itens_plano, '[]'::jsonb), p_prazo_resolucao, p_criticidade,
    v_profile_id, v_tenant_id
  ) RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.tarefas_rpc_auditor_criar_plano_acao IS
  'RPC: auditor cria plano de ação para aprovador responder. Trigger muda status para aguardando_aprovacao. Doc: src/modules/tarefas/docs/tarefas_rpc_auditor_criar_plano_acao.md';

-- 3.4 — Aprovador responde plano do auditor
-- Doc: src/modules/tarefas/docs/tarefas_rpc_aprovador_responder_plano_auditor.md
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
  v_row public.tarefas_planos_acao_auditor;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  UPDATE public.tarefas_planos_acao_auditor
    SET respondido = true,
        respondido_em = now(),
        respondido_por = v_profile_id,
        resposta_valor_json = p_resposta_valor_json
    WHERE id = p_plano_id
      AND deleted_at IS NULL
    RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Plano não encontrado ou já excluído: %', p_plano_id;
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.tarefas_rpc_aprovador_responder_plano_auditor IS
  'RPC: aprovador responde a plano de ação do auditor. Trigger muda status para aguardando_auditoria. Doc: src/modules/tarefas/docs/tarefas_rpc_aprovador_responder_plano_auditor.md';

-- =============================================================================
-- 4. TRIGGERS (1 responsabilidade = 1 trigger, Regra 4)
-- =============================================================================

-- 4.1 — APÓS aprovador criar plano: status → devolvida
-- Doc: src/modules/tarefas/docs/tarefas_trigger_status_apos_aprovador_criar_plano.md
CREATE OR REPLACE FUNCTION public.tarefas_fn_trigger_apos_aprovador_criar_plano()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.operational_assignments
    SET status = 'devolvida',
        updated_at = now()
    WHERE id = NEW.assignment_id
      AND status IN ('aguardando_aprovacao', 'em_andamento', 'aguardando_auditoria');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tarefas_trigger_status_apos_aprovador_criar_plano
  ON public.tarefas_planos_acao_aprovador;
CREATE TRIGGER tarefas_trigger_status_apos_aprovador_criar_plano
  AFTER INSERT ON public.tarefas_planos_acao_aprovador
  FOR EACH ROW
  EXECUTE FUNCTION public.tarefas_fn_trigger_apos_aprovador_criar_plano();

COMMENT ON TRIGGER tarefas_trigger_status_apos_aprovador_criar_plano
  ON public.tarefas_planos_acao_aprovador IS
  'Move assignment para status=devolvida quando aprovador cria plano. Doc: src/modules/tarefas/docs/tarefas_trigger_status_apos_aprovador_criar_plano.md';

-- 4.2 — APÓS executor responder plano aprovador: status → aguardando_aprovacao
-- Doc: src/modules/tarefas/docs/tarefas_trigger_status_apos_executor_responder_plano.md
CREATE OR REPLACE FUNCTION public.tarefas_fn_trigger_apos_executor_responder_plano()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.respondido = true AND (OLD.respondido IS DISTINCT FROM true) THEN
    UPDATE public.operational_assignments
      SET status = 'aguardando_aprovacao',
          updated_at = now()
      WHERE id = NEW.assignment_id
        AND status IN ('devolvida', 'em_andamento');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tarefas_trigger_status_apos_executor_responder_plano
  ON public.tarefas_planos_acao_aprovador;
CREATE TRIGGER tarefas_trigger_status_apos_executor_responder_plano
  AFTER UPDATE OF respondido ON public.tarefas_planos_acao_aprovador
  FOR EACH ROW
  EXECUTE FUNCTION public.tarefas_fn_trigger_apos_executor_responder_plano();

COMMENT ON TRIGGER tarefas_trigger_status_apos_executor_responder_plano
  ON public.tarefas_planos_acao_aprovador IS
  'Move assignment para status=aguardando_aprovacao quando executor responde o plano do aprovador. Doc: src/modules/tarefas/docs/tarefas_trigger_status_apos_executor_responder_plano.md';

-- 4.3 — APÓS auditor criar plano: status → aguardando_aprovacao
-- Doc: src/modules/tarefas/docs/tarefas_trigger_status_apos_auditor_criar_plano.md
CREATE OR REPLACE FUNCTION public.tarefas_fn_trigger_apos_auditor_criar_plano()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.operational_assignments
    SET status = 'aguardando_aprovacao',
        updated_at = now()
    WHERE id = NEW.assignment_id
      AND status IN ('aguardando_auditoria', 'em_andamento');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tarefas_trigger_status_apos_auditor_criar_plano
  ON public.tarefas_planos_acao_auditor;
CREATE TRIGGER tarefas_trigger_status_apos_auditor_criar_plano
  AFTER INSERT ON public.tarefas_planos_acao_auditor
  FOR EACH ROW
  EXECUTE FUNCTION public.tarefas_fn_trigger_apos_auditor_criar_plano();

COMMENT ON TRIGGER tarefas_trigger_status_apos_auditor_criar_plano
  ON public.tarefas_planos_acao_auditor IS
  'Move assignment para status=aguardando_aprovacao quando auditor cria plano. Doc: src/modules/tarefas/docs/tarefas_trigger_status_apos_auditor_criar_plano.md';

-- 4.4 — APÓS aprovador responder plano auditor: status → aguardando_auditoria
-- Doc: src/modules/tarefas/docs/tarefas_trigger_status_apos_aprovador_responder_plano_auditor.md
CREATE OR REPLACE FUNCTION public.tarefas_fn_trigger_apos_aprovador_responder_plano_auditor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.respondido = true AND (OLD.respondido IS DISTINCT FROM true) THEN
    UPDATE public.operational_assignments
      SET status = 'aguardando_auditoria',
          updated_at = now()
      WHERE id = NEW.assignment_id
        AND status IN ('aguardando_aprovacao');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tarefas_trigger_status_apos_aprovador_responder_plano_auditor
  ON public.tarefas_planos_acao_auditor;
CREATE TRIGGER tarefas_trigger_status_apos_aprovador_responder_plano_auditor
  AFTER UPDATE OF respondido ON public.tarefas_planos_acao_auditor
  FOR EACH ROW
  EXECUTE FUNCTION public.tarefas_fn_trigger_apos_aprovador_responder_plano_auditor();

COMMENT ON TRIGGER tarefas_trigger_status_apos_aprovador_responder_plano_auditor
  ON public.tarefas_planos_acao_auditor IS
  'Move assignment para status=aguardando_auditoria quando aprovador responde plano do auditor. Doc: src/modules/tarefas/docs/tarefas_trigger_status_apos_aprovador_responder_plano_auditor.md';

-- =============================================================================
-- 5. RLS (multi-tenant SaaS, Regra 4)
-- =============================================================================

ALTER TABLE public.tarefas_planos_acao_aprovador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_planos_acao_auditor ENABLE ROW LEVEL SECURITY;

-- Admin: tudo
CREATE POLICY "tarefas_planos_aprov_admin_all"
  ON public.tarefas_planos_acao_aprovador FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "tarefas_planos_audit_admin_all"
  ON public.tarefas_planos_acao_auditor FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- SELECT: qualquer autenticado da mesma tenant pode ler
-- (frontend filtra por assignment; RLS impede vazamento cross-tenant)
CREATE POLICY "tarefas_planos_aprov_select_tenant"
  ON public.tarefas_planos_acao_aprovador FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "tarefas_planos_audit_select_tenant"
  ON public.tarefas_planos_acao_auditor FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
  );

-- INSERT e UPDATE: via RPC apenas (SECURITY DEFINER bypassa RLS).
-- Bloqueia INSERT/UPDATE direto do frontend (force usar a RPC).
CREATE POLICY "tarefas_planos_aprov_no_direct_write"
  ON public.tarefas_planos_acao_aprovador FOR INSERT TO authenticated
  WITH CHECK (false);
CREATE POLICY "tarefas_planos_aprov_no_direct_update"
  ON public.tarefas_planos_acao_aprovador FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "tarefas_planos_audit_no_direct_write"
  ON public.tarefas_planos_acao_auditor FOR INSERT TO authenticated
  WITH CHECK (false);
CREATE POLICY "tarefas_planos_audit_no_direct_update"
  ON public.tarefas_planos_acao_auditor FOR UPDATE TO authenticated
  USING (false);
