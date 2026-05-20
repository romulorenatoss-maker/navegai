-- Patched version of 20260520180000 (removed tenant_id dependency — coluna não existe em profiles)

CREATE TABLE IF NOT EXISTS public.tarefas_planos_acao_aprovador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  field_id UUID NOT NULL,
  rodada INT NOT NULL CHECK (rodada >= 1),
  instrucao TEXT,
  itens_plano JSONB NOT NULL DEFAULT '[]'::jsonb,
  prazo_resolucao TIMESTAMPTZ,
  criticidade TEXT CHECK (criticidade IN ('baixa', 'media', 'alta')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por UUID REFERENCES public.profiles(id),
  respondido BOOLEAN NOT NULL DEFAULT false,
  respondido_em TIMESTAMPTZ,
  respondido_por UUID REFERENCES public.profiles(id),
  resposta_valor_json JSONB,
  deleted_at TIMESTAMPTZ,
  UNIQUE (assignment_id, field_id, rodada)
);

CREATE INDEX IF NOT EXISTS idx_tarefas_planos_aprov_assignment ON public.tarefas_planos_acao_aprovador (assignment_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_planos_aprov_field ON public.tarefas_planos_acao_aprovador (assignment_id, field_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_planos_aprov_pendentes ON public.tarefas_planos_acao_aprovador (assignment_id) WHERE respondido = false;

CREATE TABLE IF NOT EXISTS public.tarefas_planos_acao_auditor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  field_id UUID NOT NULL,
  rodada INT NOT NULL CHECK (rodada >= 1),
  instrucao TEXT,
  itens_plano JSONB NOT NULL DEFAULT '[]'::jsonb,
  prazo_resolucao TIMESTAMPTZ,
  criticidade TEXT CHECK (criticidade IN ('baixa', 'media', 'alta')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por UUID REFERENCES public.profiles(id),
  respondido BOOLEAN NOT NULL DEFAULT false,
  respondido_em TIMESTAMPTZ,
  respondido_por UUID REFERENCES public.profiles(id),
  resposta_valor_json JSONB,
  deleted_at TIMESTAMPTZ,
  UNIQUE (assignment_id, field_id, rodada)
);

CREATE INDEX IF NOT EXISTS idx_tarefas_planos_audit_assignment ON public.tarefas_planos_acao_auditor (assignment_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_planos_audit_field ON public.tarefas_planos_acao_auditor (assignment_id, field_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_planos_audit_pendentes ON public.tarefas_planos_acao_auditor (assignment_id) WHERE respondido = false;

-- RPCs
CREATE OR REPLACE FUNCTION public.tarefas_rpc_aprovador_criar_plano_acao(
  p_assignment_id UUID, p_field_id UUID, p_instrucao TEXT,
  p_itens_plano JSONB, p_prazo_resolucao TIMESTAMPTZ, p_criticidade TEXT DEFAULT 'media'
) RETURNS public.tarefas_planos_acao_aprovador
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile_id UUID;
  v_rodada INT;
  v_row public.tarefas_planos_acao_aprovador;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT COALESCE(MAX(rodada), 0) + 1 INTO v_rodada
    FROM public.tarefas_planos_acao_aprovador
    WHERE assignment_id = p_assignment_id AND field_id = p_field_id AND deleted_at IS NULL;
  INSERT INTO public.tarefas_planos_acao_aprovador (
    assignment_id, field_id, rodada, instrucao, itens_plano, prazo_resolucao, criticidade, criado_por
  ) VALUES (
    p_assignment_id, p_field_id, v_rodada, p_instrucao,
    COALESCE(p_itens_plano, '[]'::jsonb), p_prazo_resolucao, p_criticidade, v_profile_id
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.tarefas_rpc_executor_responder_plano_aprovador(
  p_plano_id UUID, p_resposta_valor_json JSONB
) RETURNS public.tarefas_planos_acao_aprovador
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile_id UUID;
  v_row public.tarefas_planos_acao_aprovador;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  UPDATE public.tarefas_planos_acao_aprovador
    SET respondido = true, respondido_em = now(), respondido_por = v_profile_id,
        resposta_valor_json = p_resposta_valor_json
    WHERE id = p_plano_id AND deleted_at IS NULL
    RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Plano não encontrado ou já excluído: %', p_plano_id; END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.tarefas_rpc_auditor_criar_plano_acao(
  p_assignment_id UUID, p_field_id UUID, p_instrucao TEXT,
  p_itens_plano JSONB, p_prazo_resolucao TIMESTAMPTZ, p_criticidade TEXT DEFAULT 'media'
) RETURNS public.tarefas_planos_acao_auditor
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile_id UUID;
  v_rodada INT;
  v_row public.tarefas_planos_acao_auditor;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT COALESCE(MAX(rodada), 0) + 1 INTO v_rodada
    FROM public.tarefas_planos_acao_auditor
    WHERE assignment_id = p_assignment_id AND field_id = p_field_id AND deleted_at IS NULL;
  INSERT INTO public.tarefas_planos_acao_auditor (
    assignment_id, field_id, rodada, instrucao, itens_plano, prazo_resolucao, criticidade, criado_por
  ) VALUES (
    p_assignment_id, p_field_id, v_rodada, p_instrucao,
    COALESCE(p_itens_plano, '[]'::jsonb), p_prazo_resolucao, p_criticidade, v_profile_id
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.tarefas_rpc_aprovador_responder_plano_auditor(
  p_plano_id UUID, p_resposta_valor_json JSONB
) RETURNS public.tarefas_planos_acao_auditor
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile_id UUID;
  v_row public.tarefas_planos_acao_auditor;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  UPDATE public.tarefas_planos_acao_auditor
    SET respondido = true, respondido_em = now(), respondido_por = v_profile_id,
        resposta_valor_json = p_resposta_valor_json
    WHERE id = p_plano_id AND deleted_at IS NULL
    RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Plano não encontrado ou já excluído: %', p_plano_id; END IF;
  RETURN v_row;
END;
$$;

-- TRIGGERS
CREATE OR REPLACE FUNCTION public.tarefas_fn_trigger_apos_aprovador_criar_plano()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.operational_assignments
    SET status = 'devolvida', updated_at = now()
    WHERE id = NEW.assignment_id
      AND status IN ('aguardando_aprovacao', 'em_andamento', 'aguardando_auditoria');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tarefas_trigger_status_apos_aprovador_criar_plano ON public.tarefas_planos_acao_aprovador;
CREATE TRIGGER tarefas_trigger_status_apos_aprovador_criar_plano
  AFTER INSERT ON public.tarefas_planos_acao_aprovador
  FOR EACH ROW EXECUTE FUNCTION public.tarefas_fn_trigger_apos_aprovador_criar_plano();

CREATE OR REPLACE FUNCTION public.tarefas_fn_trigger_apos_executor_responder_plano()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.respondido = true AND (OLD.respondido IS DISTINCT FROM true) THEN
    UPDATE public.operational_assignments
      SET status = 'aguardando_aprovacao', updated_at = now()
      WHERE id = NEW.assignment_id AND status IN ('devolvida', 'em_andamento');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tarefas_trigger_status_apos_executor_responder_plano ON public.tarefas_planos_acao_aprovador;
CREATE TRIGGER tarefas_trigger_status_apos_executor_responder_plano
  AFTER UPDATE OF respondido ON public.tarefas_planos_acao_aprovador
  FOR EACH ROW EXECUTE FUNCTION public.tarefas_fn_trigger_apos_executor_responder_plano();

CREATE OR REPLACE FUNCTION public.tarefas_fn_trigger_apos_auditor_criar_plano()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.operational_assignments
    SET status = 'aguardando_aprovacao', updated_at = now()
    WHERE id = NEW.assignment_id
      AND status IN ('aguardando_auditoria', 'em_andamento');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tarefas_trigger_status_apos_auditor_criar_plano ON public.tarefas_planos_acao_auditor;
CREATE TRIGGER tarefas_trigger_status_apos_auditor_criar_plano
  AFTER INSERT ON public.tarefas_planos_acao_auditor
  FOR EACH ROW EXECUTE FUNCTION public.tarefas_fn_trigger_apos_auditor_criar_plano();

CREATE OR REPLACE FUNCTION public.tarefas_fn_trigger_apos_aprovador_responder_plano_auditor()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.respondido = true AND (OLD.respondido IS DISTINCT FROM true) THEN
    UPDATE public.operational_assignments
      SET status = 'aguardando_auditoria', updated_at = now()
      WHERE id = NEW.assignment_id AND status IN ('aguardando_aprovacao');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tarefas_trigger_status_apos_aprovador_responder_plano_auditor ON public.tarefas_planos_acao_auditor;
CREATE TRIGGER tarefas_trigger_status_apos_aprovador_responder_plano_auditor
  AFTER UPDATE OF respondido ON public.tarefas_planos_acao_auditor
  FOR EACH ROW EXECUTE FUNCTION public.tarefas_fn_trigger_apos_aprovador_responder_plano_auditor();

-- RLS
ALTER TABLE public.tarefas_planos_acao_aprovador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_planos_acao_auditor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tarefas_planos_aprov_admin_all"
  ON public.tarefas_planos_acao_aprovador FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "tarefas_planos_audit_admin_all"
  ON public.tarefas_planos_acao_auditor FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "tarefas_planos_aprov_select_tenant"
  ON public.tarefas_planos_acao_aprovador FOR SELECT TO authenticated USING (true);
CREATE POLICY "tarefas_planos_audit_select_tenant"
  ON public.tarefas_planos_acao_auditor FOR SELECT TO authenticated USING (true);

CREATE POLICY "tarefas_planos_aprov_no_direct_write"
  ON public.tarefas_planos_acao_aprovador FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "tarefas_planos_aprov_no_direct_update"
  ON public.tarefas_planos_acao_aprovador FOR UPDATE TO authenticated USING (false);
CREATE POLICY "tarefas_planos_audit_no_direct_write"
  ON public.tarefas_planos_acao_auditor FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "tarefas_planos_audit_no_direct_update"
  ON public.tarefas_planos_acao_auditor FOR UPDATE TO authenticated USING (false);

NOTIFY pgrst, 'reload schema';