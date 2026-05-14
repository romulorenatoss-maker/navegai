-- ============================================================
-- FASE 1 — MIGRATION DESTRUTIVA: Limpeza fluxo Tarefas (V2)
-- ============================================================

-- ---------- 0. Drop policies dependentes de avaliador_id ----------
DROP POLICY IF EXISTS "Avaliador can view assigned audits" ON public.operational_assignments;
DROP POLICY IF EXISTS "Avaliador can update audit fields" ON public.operational_assignments;
DROP POLICY IF EXISTS "Authenticated can insert contingencies" ON public.operational_contingencies;
DROP POLICY IF EXISTS "tarefas_anexos_select" ON public.tarefas_anexos;
DROP POLICY IF EXISTS "audit_overrides_select" ON public.operational_audit_overrides;

-- ---------- 1. Drop triggers e funções legadas ----------
DROP TRIGGER IF EXISTS trg_gerar_ada_assignment ON public.operational_assignments;
DROP TRIGGER IF EXISTS trg_enforce_avaliador_distinto_avaliado ON public.operational_assignments;
DROP TRIGGER IF EXISTS trg_enforce_template_avaliador_distinto_avaliado ON public.operational_templates;

DROP FUNCTION IF EXISTS public.fn_gerar_ada_assignment() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_assignment_avaliador_distinto_avaliado() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_template_avaliador_distinto_avaliado() CASCADE;

-- ---------- 2. Drop tabela legada AdA ----------
DROP TABLE IF EXISTS public.tarefas_ada_config CASCADE;

-- ---------- 3. operational_templates: remover ada_* e renomear avaliador_* ----------
ALTER TABLE public.operational_templates
  DROP COLUMN IF EXISTS ada_enabled,
  DROP COLUMN IF EXISTS ada_gerar_em,
  DROP COLUMN IF EXISTS ada_quem_avalia_tipo,
  DROP COLUMN IF EXISTS ada_quem_avalia_profile_id,
  DROP COLUMN IF EXISTS ada_quem_avalia_setor_id,
  DROP COLUMN IF EXISTS ada_config_snapshot;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='operational_templates' AND column_name='avaliador_profile_id') THEN
    ALTER TABLE public.operational_templates RENAME COLUMN avaliador_profile_id TO auditor_profile_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='operational_templates' AND column_name='avaliador_setor_id') THEN
    ALTER TABLE public.operational_templates RENAME COLUMN avaliador_setor_id TO auditor_setor_id;
  END IF;
END $$;

-- ---------- 4. operational_assignments: drop colunas legadas (CASCADE para limpar deps remanescentes) ----------
ALTER TABLE public.operational_assignments
  DROP COLUMN IF EXISTS avaliador_id CASCADE,
  DROP COLUMN IF EXISTS score_avaliador CASCADE,
  DROP COLUMN IF EXISTS setor_avaliador_id CASCADE,
  DROP COLUMN IF EXISTS avaliador_inicio_em CASCADE,
  DROP COLUMN IF EXISTS avaliador_fim_em CASCADE,
  DROP COLUMN IF EXISTS ada_avaliador_avaliado_id CASCADE,
  DROP COLUMN IF EXISTS ada_responsavel_definido_id CASCADE;

-- ---------- 5. operational_assignments: novas colunas auditor + meta ----------
ALTER TABLE public.operational_assignments
  ADD COLUMN IF NOT EXISTS auditor_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS setor_auditor_id uuid REFERENCES public.setores(id),
  ADD COLUMN IF NOT EXISTS auditor_inicio_em timestamptz,
  ADD COLUMN IF NOT EXISTS auditor_fim_em timestamptz,
  ADD COLUMN IF NOT EXISTS score_auditor numeric,
  ADD COLUMN IF NOT EXISTS aprovado_em timestamptz,
  ADD COLUMN IF NOT EXISTS aprovado_por uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS auditado_em timestamptz,
  ADD COLUMN IF NOT EXISTS auditado_por uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS excluir_da_media boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_exclusao_media text,
  ADD COLUMN IF NOT EXISTS cancelada_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelada_por uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text,
  ADD COLUMN IF NOT EXISTS reagendamentos_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_motivo_reagendamento text;

CREATE INDEX IF NOT EXISTS idx_assignments_auditor_id ON public.operational_assignments(auditor_id);
CREATE INDEX IF NOT EXISTS idx_assignments_excluir_media ON public.operational_assignments(excluir_da_media);

-- ---------- 6. Recriar policies usando auditor_id ----------
CREATE POLICY "Auditor can view assigned audits"
  ON public.operational_assignments FOR SELECT
  USING (auditor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Auditor can update audit fields"
  ON public.operational_assignments FOR UPDATE
  USING (auditor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Authenticated can insert contingencies"
  ON public.operational_contingencies FOR INSERT
  WITH CHECK (
    is_admin(auth.uid())
    OR responsavel_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR assignment_id IN (
      SELECT id FROM public.operational_assignments
      WHERE responsavel_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
         OR auditor_id    IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "tarefas_anexos_select"
  ON public.tarefas_anexos FOR SELECT
  USING (
    deleted_at IS NULL AND (
      is_admin(auth.uid())
      OR uploaded_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      OR (
        assignment_id IS NOT NULL AND assignment_id IN (
          SELECT a.id FROM public.operational_assignments a
          WHERE a.responsavel_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
             OR a.auditor_id     IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
             OR a.avaliado_id    IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
             OR a.aprovador_id   IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
             OR a.created_by     IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
        )
      )
    )
  );

CREATE POLICY "audit_overrides_select"
  ON public.operational_audit_overrides FOR SELECT
  USING (
    is_admin(auth.uid())
    OR assignment_id IN (
      SELECT a.id FROM public.operational_assignments a
      WHERE a.responsavel_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
         OR a.auditor_id     IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
         OR a.aprovador_id   IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
         OR a.created_by     IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- ---------- 7. operational_score_logs: aceitar tipo 'auditor' ----------
DO $$ BEGIN
  ALTER TABLE public.operational_score_logs DROP CONSTRAINT IF EXISTS operational_score_logs_tipo_score_check;
EXCEPTION WHEN others THEN NULL; END $$;

ALTER TABLE public.operational_score_logs
  ADD CONSTRAINT operational_score_logs_tipo_score_check
  CHECK (tipo_score IN ('executor','avaliado','auditor'));

-- ---------- 8. tarefas_pontuacao_config: validador_pacote_padrao -> auditor_pacote_padrao ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tarefas_pontuacao_config' AND column_name='validador_pacote_padrao')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tarefas_pontuacao_config' AND column_name='auditor_pacote_padrao') THEN
    ALTER TABLE public.tarefas_pontuacao_config RENAME COLUMN validador_pacote_padrao TO auditor_pacote_padrao;
  END IF;
END $$;

-- ---------- 9. Nova tabela operational_action_plans ----------
CREATE TABLE IF NOT EXISTS public.operational_action_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  responsavel_id uuid REFERENCES public.profiles(id),
  prazo timestamptz,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em_andamento','concluido','cancelado')),
  descricao text NOT NULL,
  resultado text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz
);

CREATE INDEX IF NOT EXISTS idx_action_plans_assignment ON public.operational_action_plans(assignment_id);
CREATE INDEX IF NOT EXISTS idx_action_plans_responsavel ON public.operational_action_plans(responsavel_id);

ALTER TABLE public.operational_action_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage action plans"
  ON public.operational_action_plans FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users view own action plans"
  ON public.operational_action_plans FOR SELECT
  USING (
    responsavel_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.operational_assignments a
      JOIN public.profiles p ON p.user_id = auth.uid()
      WHERE a.id = operational_action_plans.assignment_id
        AND (a.responsavel_id = p.id OR a.aprovador_id = p.id OR a.auditor_id = p.id OR a.created_by = p.id)
    )
  );

CREATE POLICY "Responsavel updates own action plan"
  ON public.operational_action_plans FOR UPDATE
  USING (responsavel_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE TRIGGER trg_action_plans_updated_at
  BEFORE UPDATE ON public.operational_action_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 10. Reescrever calculate_operational_score_on_complete (sem avaliador, sem AdA) ----------
CREATE OR REPLACE FUNCTION public.calculate_operational_score_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pontualidade numeric;
  v_qualidade_evidencia numeric;
  v_sla_correcoes numeric;
  v_score_executor numeric;
  v_score_avaliado numeric;
  v_score_auditor numeric;
  v_horario_limite timestamptz;
  v_template record;
  v_detalhe_executor jsonb;
  v_detalhe_avaliado jsonb;
  v_detalhe_auditor jsonb;
  v_total_contingencias int;
  v_contingencias_no_prazo int;
  v_penalidade_devolucao numeric;
  v_score_bruto numeric;
  v_secoes_detail jsonb;
  v_penalidade_cont numeric;
  v_penalidade_sla_cont numeric;
  v_cont_fora_prazo int;
BEGIN
  IF NEW.status NOT IN ('concluida', 'aguardando_aprovacao') THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.excluir_da_media = true THEN RETURN NEW; END IF;

  SELECT * INTO v_template FROM operational_templates WHERE id = NEW.template_id;

  v_penalidade_cont := COALESCE(v_template.penalidade_contingencia, 10);
  v_penalidade_sla_cont := COALESCE(v_template.penalidade_sla_contingencia, 15);

  WITH field_scores AS (
    SELECT f.section_id, f.peso AS field_peso, f.nota_maxima, f.impacta_score,
      CASE
        WHEN f.tipo IN ('conforme', 'sim_nao') THEN
          CASE WHEN fr.conforme = true THEN f.nota_maxima
               WHEN fr.conforme = false THEN 0
               WHEN fa.valor_booleano = true THEN f.nota_maxima
               WHEN fa.valor_booleano = false THEN 0
               ELSE 0 END
        WHEN f.tipo = 'nota_avaliacao' THEN LEAST(COALESCE(fa.valor_numero, 0), f.nota_maxima)
        ELSE NULL END AS nota_obtida
    FROM operational_template_fields f
    LEFT JOIN LATERAL (SELECT * FROM operational_field_answers a WHERE a.assignment_id = NEW.id AND a.field_id = f.id ORDER BY a.versao DESC LIMIT 1) fa ON true
    LEFT JOIN LATERAL (SELECT * FROM operational_field_reviews r WHERE r.assignment_id = NEW.id AND r.field_id = f.id ORDER BY r.rodada DESC LIMIT 1) fr ON true
    WHERE f.template_id = NEW.template_id AND f.impacta_score = true
  ),
  section_scores AS (
    SELECT COALESCE(fs.section_id, '00000000-0000-0000-0000-000000000000'::uuid) AS sec_id,
      CASE WHEN SUM(fs.field_peso * fs.nota_maxima) > 0
        THEN SUM(fs.field_peso * COALESCE(fs.nota_obtida, 0)) / SUM(fs.field_peso * fs.nota_maxima) * 100
        ELSE 100 END AS score_secao
    FROM field_scores fs WHERE fs.nota_obtida IS NOT NULL
    GROUP BY COALESCE(fs.section_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ),
  weighted_sections AS (
    SELECT ss.sec_id, ss.score_secao, COALESCE(sec.peso, 1) AS sec_peso
    FROM section_scores ss LEFT JOIN operational_template_sections sec ON sec.id = ss.sec_id
  )
  SELECT CASE WHEN SUM(ws.sec_peso) > 0 THEN SUM(ws.sec_peso * ws.score_secao) / SUM(ws.sec_peso) ELSE 100 END,
         jsonb_agg(jsonb_build_object('section_id', ws.sec_id, 'score', round(ws.score_secao, 2), 'peso', ws.sec_peso))
    INTO v_score_bruto, v_secoes_detail FROM weighted_sections ws;

  v_score_bruto := COALESCE(v_score_bruto, 100);

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

  v_qualidade_evidencia := CASE WHEN NEW.evidencia_url IS NOT NULL THEN 100 ELSE 70 END;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE resolvida_em IS NOT NULL AND resolvida_em <= prazo_sla)
    INTO v_total_contingencias, v_contingencias_no_prazo
    FROM operational_contingencies WHERE assignment_id = NEW.id;

  SELECT COUNT(*) INTO v_cont_fora_prazo FROM operational_contingencies
    WHERE assignment_id = NEW.id AND resolvida_em IS NOT NULL AND prazo_sla IS NOT NULL AND resolvida_em > prazo_sla;

  v_sla_correcoes := CASE WHEN v_total_contingencias > 0 THEN (v_contingencias_no_prazo::numeric / v_total_contingencias) * 100 ELSE 100 END;

  v_score_executor := GREATEST(0, LEAST(100, ROUND(
    v_pontualidade * 0.4 + v_score_bruto * 0.4 + v_qualidade_evidencia * 0.1 + v_sla_correcoes * 0.1
  )));
  IF v_total_contingencias > 0 THEN v_score_executor := GREATEST(0, v_score_executor - v_penalidade_cont); END IF;
  IF v_cont_fora_prazo > 0 THEN v_score_executor := GREATEST(0, v_score_executor - (v_penalidade_sla_cont * v_cont_fora_prazo)); END IF;

  v_detalhe_executor := jsonb_build_object(
    'pontualidade', round(v_pontualidade, 2), 'score_bruto', round(v_score_bruto, 2),
    'evidencia', round(v_qualidade_evidencia, 2), 'sla_correcoes', round(v_sla_correcoes, 2),
    'formula', '(pont*0.4)+(bruto*0.4)+(evid*0.1)+(sla*0.1) - penalidades',
    'total_contingencias', v_total_contingencias, 'contingencias_fora_prazo', v_cont_fora_prazo,
    'secoes', COALESCE(v_secoes_detail, '[]'::jsonb), 'peso_recorrencia', COALESCE(v_template.peso_recorrencia, 1.0)
  );

  v_penalidade_devolucao := GREATEST(0, (COALESCE(NEW.rodada_atual, 1) - 1) * 5);
  v_score_avaliado := GREATEST(0, ROUND(v_score_bruto - v_penalidade_devolucao));
  IF v_total_contingencias > 0 THEN v_score_avaliado := GREATEST(0, v_score_avaliado - v_penalidade_cont); END IF;
  IF v_cont_fora_prazo > 0 THEN v_score_avaliado := GREATEST(0, v_score_avaliado - (v_penalidade_sla_cont * v_cont_fora_prazo)); END IF;

  v_detalhe_avaliado := jsonb_build_object(
    'score_bruto', round(v_score_bruto, 2), 'penalidade_devolucao', v_penalidade_devolucao,
    'rodada', COALESCE(NEW.rodada_atual, 1),
    'formula', 'score_bruto - (rodada-1)*5% - penalidades',
    'secoes', COALESCE(v_secoes_detail, '[]'::jsonb), 'peso_recorrencia', COALESCE(v_template.peso_recorrencia, 1.0)
  );

  IF NEW.auditor_id IS NOT NULL AND NEW.auditor_fim_em IS NOT NULL THEN
    DECLARE
      v_auditor_prazo numeric := 100;
      v_auditor_completude numeric := 100;
      v_prazo_auditoria timestamptz;
      v_total_fields int;
      v_reviewed_fields int;
    BEGIN
      v_prazo_auditoria := COALESCE(NEW.fim_em, now()) + (COALESCE(v_template.prazo_sla_correcao_horas, 24)::text || ' hours')::interval;
      IF NEW.auditor_fim_em <= v_prazo_auditoria THEN v_auditor_prazo := 100;
      ELSE v_auditor_prazo := GREATEST(0, 100 - EXTRACT(EPOCH FROM (NEW.auditor_fim_em - v_prazo_auditoria)) / 3600 * 10); END IF;

      SELECT COUNT(*) INTO v_total_fields FROM operational_template_fields WHERE template_id = v_template.id AND impacta_score = true;
      SELECT COUNT(DISTINCT field_id) INTO v_reviewed_fields FROM operational_field_reviews WHERE assignment_id = NEW.id AND conforme IS NOT NULL;

      v_auditor_completude := CASE WHEN v_total_fields > 0 THEN (v_reviewed_fields::numeric / v_total_fields) * 100 ELSE 100 END;
      v_score_auditor := GREATEST(0, LEAST(100, ROUND(v_auditor_prazo * 0.7 + v_auditor_completude * 0.3)));
      v_detalhe_auditor := jsonb_build_object(
        'prazo_auditoria', round(v_auditor_prazo, 2), 'completude', round(v_auditor_completude, 2),
        'formula', '(prazo*0.7)+(completude*0.3)', 'peso_recorrencia', COALESCE(v_template.peso_recorrencia, 1.0)
      );
    END;
  ELSE
    v_score_auditor := NULL;
    v_detalhe_auditor := NULL;
  END IF;

  NEW.score_executor := v_score_executor;
  NEW.score_avaliado := v_score_avaliado;
  NEW.score_auditor := v_score_auditor;
  NEW.pontuacao_obtida := v_score_executor;

  IF v_template.modo_pontuacao IN ('pontuar_executor', 'pontuar_ambos') AND NEW.responsavel_id IS NOT NULL THEN
    INSERT INTO operational_score_logs (assignment_id, profile_id, pontualidade, conformidade, qualidade_evidencia, sla_correcoes, score_final, tipo_score, target_profile_id, target_setor_id, detalhe_calculo)
    VALUES (NEW.id, NEW.responsavel_id, v_pontualidade, v_score_bruto, v_qualidade_evidencia, v_sla_correcoes, v_score_executor, 'executor', NEW.responsavel_id,
      COALESCE(NEW.setor_executor_id, v_template.executor_setor_id), v_detalhe_executor);
  END IF;

  IF v_template.modo_pontuacao IN ('pontuar_avaliado', 'pontuar_ambos') AND COALESCE(NEW.avaliado_id, NEW.responsavel_id) IS NOT NULL THEN
    INSERT INTO operational_score_logs (assignment_id, profile_id, pontualidade, conformidade, qualidade_evidencia, sla_correcoes, score_final, tipo_score, target_profile_id, target_setor_id, detalhe_calculo)
    VALUES (NEW.id, COALESCE(NEW.avaliado_id, NEW.responsavel_id), 0, v_score_avaliado, 0, 0, v_score_avaliado, 'avaliado', COALESCE(NEW.avaliado_id, NEW.responsavel_id),
      COALESCE(NEW.setor_avaliado_id, v_template.avaliado_setor_id), v_detalhe_avaliado);
  END IF;

  IF v_score_auditor IS NOT NULL AND NEW.auditor_id IS NOT NULL THEN
    INSERT INTO operational_score_logs (assignment_id, profile_id, pontualidade, conformidade, qualidade_evidencia, sla_correcoes, score_final, tipo_score, target_profile_id, target_setor_id, detalhe_calculo)
    VALUES (NEW.id, NEW.auditor_id, 0, 0, 0, 0, v_score_auditor, 'auditor', NEW.auditor_id,
      COALESCE(NEW.setor_auditor_id, v_template.auditor_setor_id), v_detalhe_auditor);
  END IF;

  UPDATE operational_contingencies
    SET dentro_prazo = CASE WHEN resolvida_em IS NOT NULL AND prazo_sla IS NOT NULL THEN resolvida_em <= prazo_sla ELSE NULL END
    WHERE assignment_id = NEW.id AND dentro_prazo IS NULL;

  RETURN NEW;
END;
$function$;
