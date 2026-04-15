
-- 1. Add new columns to operational_templates
ALTER TABLE public.operational_templates
  ADD COLUMN IF NOT EXISTS requer_aprovacao_gestor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bloquear_fechamento_com_contingencia boolean NOT NULL DEFAULT false;

-- 2. Create immutable audit trail table
CREATE TABLE public.operational_audit_trail (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  tipo_evento text NOT NULL,
  executado_por uuid REFERENCES public.profiles(id),
  motivo text,
  dados_anteriores jsonb,
  dados_novos jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_audit_trail ENABLE ROW LEVEL SECURITY;

-- Admins/avaliadores can view all audit trail
CREATE POLICY "Admins can view audit trail"
  ON public.operational_audit_trail FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'avaliador'::app_role));

-- Authenticated can insert audit trail entries
CREATE POLICY "Authenticated can insert audit trail"
  ON public.operational_audit_trail FOR INSERT TO authenticated
  WITH CHECK (true);

-- No UPDATE or DELETE policies = immutable

-- 3. Performance indexes
CREATE INDEX IF NOT EXISTS idx_op_assignments_resp_data ON public.operational_assignments(responsavel_id, data_prevista, status);
CREATE INDEX IF NOT EXISTS idx_op_assignments_template ON public.operational_assignments(template_id, data_prevista);
CREATE INDEX IF NOT EXISTS idx_op_contingencies_status ON public.operational_contingencies(status, prazo_sla);
CREATE INDEX IF NOT EXISTS idx_op_contingencies_assignment ON public.operational_contingencies(assignment_id, status);
CREATE INDEX IF NOT EXISTS idx_op_score_logs_profile ON public.operational_score_logs(profile_id, created_at);
CREATE INDEX IF NOT EXISTS idx_op_rankings_periodo ON public.operational_rankings(periodo_tipo, periodo_inicio);
CREATE INDEX IF NOT EXISTS idx_op_audit_assignment ON public.operational_audit_trail(assignment_id, created_at);

-- 4. Uniqueness constraint to prevent duplicate assignments
CREATE UNIQUE INDEX IF NOT EXISTS idx_op_assignments_unique ON public.operational_assignments(template_id, data_prevista, responsavel_id);

-- 5. Trigger: block closing when contingencies are pending
CREATE OR REPLACE FUNCTION public.check_contingency_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bloquear boolean;
  v_abertas int;
BEGIN
  IF NEW.status IN ('concluida', 'aguardando_aprovacao') AND OLD.status NOT IN ('concluida', 'aguardando_aprovacao') THEN
    SELECT COALESCE(t.bloquear_fechamento_com_contingencia, false) INTO v_bloquear
    FROM operational_templates t WHERE t.id = NEW.template_id;

    IF v_bloquear THEN
      SELECT COUNT(*) INTO v_abertas
      FROM operational_contingencies
      WHERE assignment_id = NEW.id AND status NOT IN ('validada', 'descartada');

      IF v_abertas > 0 THEN
        RAISE EXCEPTION 'Não é possível concluir: existem % contingência(s) pendente(s)', v_abertas;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_contingency_block
  BEFORE UPDATE ON public.operational_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_contingency_block();

-- 6. Trigger: auto-calculate score on completion
CREATE OR REPLACE FUNCTION public.calculate_operational_score_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pontualidade numeric;
  v_conformidade numeric;
  v_qualidade_evidencia numeric;
  v_sla_correcoes numeric;
  v_score_final numeric;
  v_horario_limite timestamptz;
  v_total_itens int;
  v_itens_conformes int;
  v_total_contingencias int;
  v_contingencias_no_prazo int;
  v_template record;
BEGIN
  -- Only calculate when status changes to concluida or aguardando_aprovacao
  IF NEW.status NOT IN ('concluida', 'aguardando_aprovacao') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_template FROM operational_templates WHERE id = NEW.template_id;

  -- PONTUALIDADE (40%)
  IF NEW.fim_em IS NOT NULL AND v_template.horario_limite_execucao IS NOT NULL THEN
    v_horario_limite := (NEW.data_prevista::text || ' ' || v_template.horario_limite_execucao::text)::timestamptz;
    IF NEW.fim_em <= v_horario_limite + (COALESCE(v_template.tolerancia_minutos, 0)::text || ' minutes')::interval THEN
      v_pontualidade := 100;
    ELSE
      v_pontualidade := GREATEST(0, 100 - EXTRACT(EPOCH FROM (NEW.fim_em - v_horario_limite)) / 60);
    END IF;
  ELSE
    v_pontualidade := CASE WHEN NEW.fim_em IS NOT NULL THEN 100 ELSE 0 END;
  END IF;

  -- CONFORMIDADE (30%)
  IF v_template.tipo_execucao = 'checklist_inspecao' THEN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE conforme = true)
    INTO v_total_itens, v_itens_conformes
    FROM operational_execution_check_answers WHERE assignment_id = NEW.id;
    v_conformidade := CASE WHEN v_total_itens > 0 THEN (v_itens_conformes::numeric / v_total_itens) * 100 ELSE 100 END;
  ELSIF v_template.tipo_execucao = 'etapas' THEN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'concluida')
    INTO v_total_itens, v_itens_conformes
    FROM operational_execution_step_logs WHERE assignment_id = NEW.id;
    v_conformidade := CASE WHEN v_total_itens > 0 THEN (v_itens_conformes::numeric / v_total_itens) * 100 ELSE 100 END;
  ELSE
    v_conformidade := 100;
  END IF;

  -- QUALIDADE EVIDÊNCIA (20%)
  v_qualidade_evidencia := CASE
    WHEN NEW.evidencia_url IS NOT NULL OR NOT COALESCE(v_template.exigir_foto, false) THEN 100
    ELSE 50
  END;

  -- SLA CORREÇÕES (10%)
  SELECT COUNT(*), COUNT(*) FILTER (WHERE resolvida_em IS NOT NULL AND resolvida_em <= prazo_sla)
  INTO v_total_contingencias, v_contingencias_no_prazo
  FROM operational_contingencies WHERE assignment_id = NEW.id;
  v_sla_correcoes := CASE WHEN v_total_contingencias > 0 THEN (v_contingencias_no_prazo::numeric / v_total_contingencias) * 100 ELSE 100 END;

  -- SCORE FINAL
  v_score_final := GREATEST(0, LEAST(100, ROUND(
    v_pontualidade * 0.4 + v_conformidade * 0.3 + v_qualidade_evidencia * 0.2 + v_sla_correcoes * 0.1
  )));

  -- Write score to assignment
  NEW.pontuacao_obtida := v_score_final;

  -- Insert detailed score log
  INSERT INTO operational_score_logs (assignment_id, profile_id, pontualidade, conformidade, qualidade_evidencia, sla_correcoes, score_final)
  VALUES (NEW.id, NEW.responsavel_id, v_pontualidade, v_conformidade, v_qualidade_evidencia, v_sla_correcoes, v_score_final);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_calc_score_on_complete
  BEFORE UPDATE ON public.operational_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_operational_score_on_complete();
