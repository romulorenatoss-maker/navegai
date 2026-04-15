
-- =====================================================
-- MÓDULO OPERACIONAL v5.1 — MIGRATION COMPLETA
-- =====================================================

-- 1. ALTERAR operational_templates
-- =====================================================
ALTER TABLE public.operational_templates
  ADD COLUMN IF NOT EXISTS permite_devolucao_parcial BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS versao INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sla_horas INTEGER DEFAULT 24;

-- Remover colunas legadas (tipo_execucao será mantido temporariamente para não quebrar código existente)
-- DROP será feito na Fase 7 (deprecação)
-- ALTER TABLE public.operational_templates DROP COLUMN IF EXISTS tipo_execucao;
-- ALTER TABLE public.operational_templates DROP COLUMN IF EXISTS exigir_foto;
-- ALTER TABLE public.operational_templates DROP COLUMN IF EXISTS exigir_video;
-- ALTER TABLE public.operational_templates DROP COLUMN IF EXISTS exigir_observacao;

-- 2. CRIAR operational_template_sections
-- =====================================================
CREATE TABLE IF NOT EXISTS public.operational_template_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.operational_templates(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  peso NUMERIC NOT NULL DEFAULT 1,
  cor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_template_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage operational_template_sections"
  ON public.operational_template_sections FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated can view operational_template_sections"
  ON public.operational_template_sections FOR SELECT TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_template_sections_template
  ON public.operational_template_sections(template_id);

-- 3. CRIAR operational_template_fields
-- =====================================================
CREATE TABLE IF NOT EXISTS public.operational_template_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.operational_templates(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.operational_template_sections(id) ON DELETE SET NULL,

  label TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,

  obrigatorio BOOLEAN NOT NULL DEFAULT true,

  peso NUMERIC NOT NULL DEFAULT 1,
  nota_maxima NUMERIC NOT NULL DEFAULT 100,
  penalidade_reprovacao NUMERIC NOT NULL DEFAULT 100,
  impacta_score BOOLEAN NOT NULL DEFAULT true,

  criticidade TEXT NOT NULL DEFAULT 'media',

  gera_contingencia BOOLEAN DEFAULT false,
  exige_evidencia BOOLEAN DEFAULT false,
  tipo_evidencia TEXT DEFAULT 'foto',

  opcoes JSONB DEFAULT '[]'::jsonb,
  condicao_visibilidade JSONB,
  validacao JSONB,
  formula JSONB,

  visivel_para TEXT[] NOT NULL DEFAULT '{executor,avaliador,aprovador}',
  editavel_por TEXT[] NOT NULL DEFAULT '{executor}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_template_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage operational_template_fields"
  ON public.operational_template_fields FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated can view operational_template_fields"
  ON public.operational_template_fields FOR SELECT TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_template_fields_template
  ON public.operational_template_fields(template_id);
CREATE INDEX IF NOT EXISTS idx_template_fields_section
  ON public.operational_template_fields(section_id);

-- 4. ALTERAR operational_assignments
-- =====================================================
ALTER TABLE public.operational_assignments
  ADD COLUMN IF NOT EXISTS template_versao INTEGER,
  ADD COLUMN IF NOT EXISTS template_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS rodada_atual INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS score_final_ajustado NUMERIC;

-- 5. CRIAR operational_field_answers
-- =====================================================
CREATE TABLE IF NOT EXISTS public.operational_field_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.operational_template_fields(id),

  valor_texto TEXT,
  valor_numero NUMERIC,
  valor_booleano BOOLEAN,
  valor_data TIMESTAMPTZ,
  valor_json JSONB,
  evidencia_url TEXT,

  versao INTEGER NOT NULL DEFAULT 1,

  respondido_por UUID NOT NULL REFERENCES public.profiles(id),
  respondido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(assignment_id, field_id, versao)
);

ALTER TABLE public.operational_field_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage operational_field_answers"
  ON public.operational_field_answers FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated can view operational_field_answers"
  ON public.operational_field_answers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can insert own field answers"
  ON public.operational_field_answers FOR INSERT TO authenticated
  WITH CHECK (
    respondido_por IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR is_admin(auth.uid())
  );

CREATE POLICY "Users can update own field answers"
  ON public.operational_field_answers FOR UPDATE TO authenticated
  USING (
    respondido_por IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR is_admin(auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_field_answers_assignment
  ON public.operational_field_answers(assignment_id);

-- 6. CRIAR operational_field_reviews
-- =====================================================
CREATE TABLE IF NOT EXISTS public.operational_field_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.operational_template_fields(id),
  answer_id UUID REFERENCES public.operational_field_answers(id),

  conforme BOOLEAN,
  observacao TEXT,

  devolvido BOOLEAN NOT NULL DEFAULT false,
  motivo_devolucao TEXT,

  reincidencia_ref UUID REFERENCES public.operational_field_reviews(id),

  rodada INTEGER NOT NULL DEFAULT 1,
  avaliador_id UUID NOT NULL REFERENCES public.profiles(id),
  avaliado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(assignment_id, field_id, rodada)
);

ALTER TABLE public.operational_field_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage operational_field_reviews"
  ON public.operational_field_reviews FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated can view operational_field_reviews"
  ON public.operational_field_reviews FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Avaliador can insert field reviews"
  ON public.operational_field_reviews FOR INSERT TO authenticated
  WITH CHECK (
    avaliador_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR is_admin(auth.uid())
  );

CREATE POLICY "Avaliador can update own field reviews"
  ON public.operational_field_reviews FOR UPDATE TO authenticated
  USING (
    avaliador_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR is_admin(auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_field_reviews_assignment
  ON public.operational_field_reviews(assignment_id);
CREATE INDEX IF NOT EXISTS idx_field_reviews_reincidencia
  ON public.operational_field_reviews(field_id, avaliador_id, conforme)
  WHERE conforme = false;

-- 7. CRIAR operational_score_overrides
-- =====================================================
CREATE TABLE IF NOT EXISTS public.operational_score_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.operational_assignments(id) ON DELETE CASCADE,

  tipo TEXT NOT NULL,
  score_original NUMERIC NOT NULL,
  score_ajustado NUMERIC NOT NULL,
  diferenca NUMERIC GENERATED ALWAYS AS (score_ajustado - score_original) STORED,

  justificativa TEXT NOT NULL,

  aprovador_id UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_score_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage operational_score_overrides"
  ON public.operational_score_overrides FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated can view operational_score_overrides"
  ON public.operational_score_overrides FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Aprovador can insert score overrides"
  ON public.operational_score_overrides FOR INSERT TO authenticated
  WITH CHECK (
    aprovador_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR is_admin(auth.uid())
  );

-- 8. ALTERAR operational_contingencies
-- =====================================================
ALTER TABLE public.operational_contingencies
  ADD COLUMN IF NOT EXISTS origin_field_id UUID REFERENCES public.operational_template_fields(id),
  ADD COLUMN IF NOT EXISTS origin_review_id UUID REFERENCES public.operational_field_reviews(id);

-- 9. REESCREVER TRIGGER DE SCORE para v5.1
-- =====================================================
CREATE OR REPLACE FUNCTION public.calculate_operational_score_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pontualidade numeric;
  v_conformidade numeric;
  v_qualidade_evidencia numeric;
  v_sla_correcoes numeric;
  v_score_executor numeric;
  v_score_avaliado numeric;
  v_score_avaliador numeric;
  v_horario_limite timestamptz;
  v_template record;
  v_snapshot jsonb;
  v_detalhe_executor jsonb;
  v_detalhe_avaliado jsonb;
  v_detalhe_avaliador jsonb;
  v_total_contingencias int;
  v_contingencias_no_prazo int;
  v_penalidade_devolucao numeric;
  v_score_bruto numeric;
  v_secoes_detail jsonb;
BEGIN
  IF NEW.status NOT IN ('concluida', 'aguardando_aprovacao') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_template FROM operational_templates WHERE id = NEW.template_id;
  v_snapshot := COALESCE(NEW.template_snapshot, '{}'::jsonb);

  -- === SCORE POR SEÇÃO (v5.1) ===
  -- Calcula score_bruto a partir de field_answers + field_reviews agrupados por seção
  WITH field_scores AS (
    SELECT
      f.section_id,
      f.peso AS field_peso,
      f.nota_maxima,
      f.impacta_score,
      CASE
        WHEN f.tipo IN ('conforme', 'sim_nao') THEN
          CASE
            WHEN fr.conforme = true THEN f.nota_maxima
            WHEN fr.conforme = false THEN f.nota_maxima * (1 - f.penalidade_reprovacao / 100.0)
            WHEN fa.valor_booleano = true THEN f.nota_maxima
            WHEN fa.valor_booleano = false THEN 0
            ELSE 0
          END
        WHEN f.tipo = 'nota_avaliacao' THEN LEAST(COALESCE(fa.valor_numero, 0), f.nota_maxima)
        ELSE NULL
      END AS nota_obtida
    FROM operational_template_fields f
    LEFT JOIN LATERAL (
      SELECT * FROM operational_field_answers a
      WHERE a.assignment_id = NEW.id AND a.field_id = f.id
      ORDER BY a.versao DESC LIMIT 1
    ) fa ON true
    LEFT JOIN LATERAL (
      SELECT * FROM operational_field_reviews r
      WHERE r.assignment_id = NEW.id AND r.field_id = f.id
      ORDER BY r.rodada DESC LIMIT 1
    ) fr ON true
    WHERE f.template_id = NEW.template_id AND f.impacta_score = true
  ),
  section_scores AS (
    SELECT
      COALESCE(fs.section_id, '00000000-0000-0000-0000-000000000000'::uuid) AS sec_id,
      CASE
        WHEN SUM(fs.field_peso * fs.nota_maxima) > 0
        THEN SUM(fs.field_peso * COALESCE(fs.nota_obtida, 0)) / SUM(fs.field_peso * fs.nota_maxima) * 100
        ELSE 100
      END AS score_secao
    FROM field_scores fs
    WHERE fs.nota_obtida IS NOT NULL
    GROUP BY COALESCE(fs.section_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ),
  weighted_sections AS (
    SELECT
      ss.sec_id,
      ss.score_secao,
      COALESCE(sec.peso, 1) AS sec_peso
    FROM section_scores ss
    LEFT JOIN operational_template_sections sec ON sec.id = ss.sec_id
  )
  SELECT
    CASE WHEN SUM(ws.sec_peso) > 0
      THEN SUM(ws.sec_peso * ws.score_secao) / SUM(ws.sec_peso)
      ELSE 100
    END,
    jsonb_agg(jsonb_build_object('section_id', ws.sec_id, 'score', round(ws.score_secao, 2), 'peso', ws.sec_peso))
  INTO v_score_bruto, v_secoes_detail
  FROM weighted_sections ws;

  v_score_bruto := COALESCE(v_score_bruto, 100);

  -- === PONTUALIDADE ===
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

  -- === EVIDÊNCIA ===
  v_qualidade_evidencia := CASE
    WHEN NEW.evidencia_url IS NOT NULL THEN 100
    ELSE 70
  END;

  -- === SLA CORREÇÕES ===
  SELECT COUNT(*), COUNT(*) FILTER (WHERE resolvida_em IS NOT NULL AND resolvida_em <= prazo_sla)
  INTO v_total_contingencias, v_contingencias_no_prazo
  FROM operational_contingencies WHERE assignment_id = NEW.id;
  v_sla_correcoes := CASE WHEN v_total_contingencias > 0 THEN (v_contingencias_no_prazo::numeric / v_total_contingencias) * 100 ELSE 100 END;

  -- === SCORE EXECUTOR ===
  v_score_executor := GREATEST(0, LEAST(100, ROUND(
    v_pontualidade * 0.4 + v_score_bruto * 0.4 + v_qualidade_evidencia * 0.1 + v_sla_correcoes * 0.1
  )));

  v_detalhe_executor := jsonb_build_object(
    'pontualidade', round(v_pontualidade, 2),
    'score_bruto', round(v_score_bruto, 2),
    'evidencia', round(v_qualidade_evidencia, 2),
    'sla_correcoes', round(v_sla_correcoes, 2),
    'formula', '(pont*0.4)+(bruto*0.4)+(evid*0.1)+(sla*0.1)',
    'secoes', COALESCE(v_secoes_detail, '[]'::jsonb),
    'peso_recorrencia', COALESCE(v_template.peso_recorrencia, 1.0)
  );

  -- === SCORE AVALIADO ===
  v_penalidade_devolucao := GREATEST(0, (COALESCE(NEW.rodada_atual, 1) - 1) * 5);
  v_score_avaliado := GREATEST(0, ROUND(v_score_bruto - v_penalidade_devolucao));

  v_detalhe_avaliado := jsonb_build_object(
    'score_bruto', round(v_score_bruto, 2),
    'penalidade_devolucao', v_penalidade_devolucao,
    'rodada', COALESCE(NEW.rodada_atual, 1),
    'formula', 'score_bruto - (rodada-1)*5%',
    'secoes', COALESCE(v_secoes_detail, '[]'::jsonb),
    'peso_recorrencia', COALESCE(v_template.peso_recorrencia, 1.0)
  );

  -- === SCORE AVALIADOR ===
  IF NEW.avaliador_id IS NOT NULL AND NEW.avaliador_fim_em IS NOT NULL THEN
    DECLARE
      v_avaliador_prazo numeric := 100;
      v_avaliador_completude numeric := 100;
      v_prazo_avaliacao timestamptz;
      v_total_fields int;
      v_reviewed_fields int;
    BEGIN
      v_prazo_avaliacao := COALESCE(NEW.fim_em, now()) + (COALESCE(v_template.prazo_sla_correcao_horas, 24)::text || ' hours')::interval;
      IF NEW.avaliador_fim_em <= v_prazo_avaliacao THEN
        v_avaliador_prazo := 100;
      ELSE
        v_avaliador_prazo := GREATEST(0, 100 - EXTRACT(EPOCH FROM (NEW.avaliador_fim_em - v_prazo_avaliacao)) / 3600 * 10);
      END IF;

      SELECT COUNT(*) INTO v_total_fields
      FROM operational_template_fields WHERE template_id = v_template.id AND impacta_score = true;

      SELECT COUNT(DISTINCT field_id) INTO v_reviewed_fields
      FROM operational_field_reviews WHERE assignment_id = NEW.id AND conforme IS NOT NULL;

      v_avaliador_completude := CASE WHEN v_total_fields > 0 THEN (v_reviewed_fields::numeric / v_total_fields) * 100 ELSE 100 END;

      v_score_avaliador := GREATEST(0, LEAST(100, ROUND(v_avaliador_prazo * 0.7 + v_avaliador_completude * 0.3)));
      v_detalhe_avaliador := jsonb_build_object(
        'prazo_auditoria', round(v_avaliador_prazo, 2),
        'completude', round(v_avaliador_completude, 2),
        'formula', '(prazo*0.7)+(completude*0.3)',
        'peso_recorrencia', COALESCE(v_template.peso_recorrencia, 1.0)
      );
    END;
  ELSE
    v_score_avaliador := NULL;
    v_detalhe_avaliador := NULL;
  END IF;

  -- === PERSISTIR SCORES ===
  NEW.score_executor := v_score_executor;
  NEW.score_avaliado := v_score_avaliado;
  NEW.score_avaliador := v_score_avaliador;
  NEW.pontuacao_obtida := v_score_executor;

  -- Score logs
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

  IF v_score_avaliador IS NOT NULL AND NEW.avaliador_id IS NOT NULL THEN
    INSERT INTO operational_score_logs (assignment_id, profile_id, pontualidade, conformidade, qualidade_evidencia, sla_correcoes, score_final, tipo_score, target_profile_id, target_setor_id, detalhe_calculo)
    VALUES (NEW.id, NEW.avaliador_id, 0, 0, 0, 0, v_score_avaliador, 'avaliador', NEW.avaliador_id,
      COALESCE(NEW.setor_avaliador_id, v_template.avaliador_setor_id), v_detalhe_avaliador);
  END IF;

  RETURN NEW;
END;
$function$;

-- Recriar trigger (caso não exista)
DROP TRIGGER IF EXISTS trg_calculate_score_on_complete ON public.operational_assignments;
CREATE TRIGGER trg_calculate_score_on_complete
  BEFORE UPDATE ON public.operational_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_operational_score_on_complete();
