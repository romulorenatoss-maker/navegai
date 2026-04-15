
-- 1. Novos campos em operational_templates
ALTER TABLE public.operational_templates
  ADD COLUMN IF NOT EXISTS executor_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS executor_setor_id uuid REFERENCES public.setores(id),
  ADD COLUMN IF NOT EXISTS avaliador_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS avaliador_setor_id uuid REFERENCES public.setores(id),
  ADD COLUMN IF NOT EXISTS avaliado_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS avaliado_setor_id uuid REFERENCES public.setores(id),
  ADD COLUMN IF NOT EXISTS modo_pontuacao text NOT NULL DEFAULT 'pontuar_avaliado',
  ADD COLUMN IF NOT EXISTS destino_score text NOT NULL DEFAULT 'individual';

-- 2. Novos campos em operational_assignments
ALTER TABLE public.operational_assignments
  ADD COLUMN IF NOT EXISTS avaliador_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS avaliado_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS avaliador_inicio_em timestamptz,
  ADD COLUMN IF NOT EXISTS avaliador_fim_em timestamptz,
  ADD COLUMN IF NOT EXISTS score_executor numeric,
  ADD COLUMN IF NOT EXISTS score_avaliado numeric,
  ADD COLUMN IF NOT EXISTS score_avaliador numeric;

-- 3. Novos campos em operational_score_logs
ALTER TABLE public.operational_score_logs
  ADD COLUMN IF NOT EXISTS tipo_score text NOT NULL DEFAULT 'executor',
  ADD COLUMN IF NOT EXISTS target_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS target_setor_id uuid REFERENCES public.setores(id);

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_op_assignments_avaliador ON public.operational_assignments(avaliador_id);
CREATE INDEX IF NOT EXISTS idx_op_assignments_avaliado ON public.operational_assignments(avaliado_id);
CREATE INDEX IF NOT EXISTS idx_op_score_logs_tipo ON public.operational_score_logs(tipo_score, target_profile_id);
CREATE INDEX IF NOT EXISTS idx_op_score_logs_setor ON public.operational_score_logs(target_setor_id) WHERE target_setor_id IS NOT NULL;

-- 5. RLS: Avaliador pode ver assignments onde é avaliador
CREATE POLICY "Avaliador can view assigned audits"
  ON public.operational_assignments FOR SELECT TO authenticated
  USING (avaliador_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- 6. RLS: Avaliado pode ver assignments onde é avaliado
CREATE POLICY "Avaliado can view own scored assignments"
  ON public.operational_assignments FOR SELECT TO authenticated
  USING (avaliado_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- 7. RLS: Avaliador pode atualizar campos de avaliação
CREATE POLICY "Avaliador can update audit fields"
  ON public.operational_assignments FOR UPDATE TO authenticated
  USING (avaliador_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- 8. Atualizar trigger de score para tripla responsabilidade
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
  v_score_executor numeric;
  v_score_avaliado numeric;
  v_score_avaliador numeric;
  v_horario_limite timestamptz;
  v_total_itens int;
  v_itens_conformes int;
  v_itens_nao_conformes int;
  v_total_contingencias int;
  v_contingencias_no_prazo int;
  v_template record;
BEGIN
  IF NEW.status NOT IN ('concluida', 'aguardando_aprovacao') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_template FROM operational_templates WHERE id = NEW.template_id;

  -- === SCORE EXECUTOR ===
  -- Pontualidade (40%)
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

  -- Conformidade executor (30%) - etapas concluídas
  IF v_template.tipo_execucao = 'etapas' THEN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'concluida')
    INTO v_total_itens, v_itens_conformes
    FROM operational_execution_step_logs WHERE assignment_id = NEW.id;
    v_conformidade := CASE WHEN v_total_itens > 0 THEN (v_itens_conformes::numeric / v_total_itens) * 100 ELSE 100 END;
  ELSE
    v_conformidade := 100;
  END IF;

  -- Evidência executor (20%)
  v_qualidade_evidencia := CASE
    WHEN NEW.evidencia_url IS NOT NULL OR NOT COALESCE(v_template.exigir_foto, false) THEN 100
    ELSE 50
  END;

  -- SLA correções (10%)
  SELECT COUNT(*), COUNT(*) FILTER (WHERE resolvida_em IS NOT NULL AND resolvida_em <= prazo_sla)
  INTO v_total_contingencias, v_contingencias_no_prazo
  FROM operational_contingencies WHERE assignment_id = NEW.id;
  v_sla_correcoes := CASE WHEN v_total_contingencias > 0 THEN (v_contingencias_no_prazo::numeric / v_total_contingencias) * 100 ELSE 100 END;

  v_score_executor := GREATEST(0, LEAST(100, ROUND(
    v_pontualidade * 0.4 + v_conformidade * 0.3 + v_qualidade_evidencia * 0.2 + v_sla_correcoes * 0.1
  )));

  -- === SCORE AVALIADO ===
  -- Baseado em conformidade do checklist (penalidade IMEDIATA e PERMANENTE por não conformidade)
  IF v_template.tipo_execucao = 'checklist_inspecao' THEN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE conforme = true), COUNT(*) FILTER (WHERE conforme = false)
    INTO v_total_itens, v_itens_conformes, v_itens_nao_conformes
    FROM operational_execution_check_answers WHERE assignment_id = NEW.id;

    IF v_total_itens > 0 THEN
      -- Score = conformes/total * 100. Não conformidades penalizam permanentemente.
      -- Resolver contingência NÃO restaura pontos.
      v_score_avaliado := ROUND((v_itens_conformes::numeric / v_total_itens) * 100);
    ELSE
      v_score_avaliado := 100;
    END IF;
  ELSE
    -- Para tarefas simples/etapas sem checklist, avaliado = executor score
    v_score_avaliado := v_score_executor;
  END IF;

  -- === SCORE AVALIADOR ===
  -- Baseado em prazo de entrega da avaliação (70%) + completude (30%)
  IF NEW.avaliador_id IS NOT NULL AND NEW.avaliador_fim_em IS NOT NULL THEN
    DECLARE
      v_avaliador_prazo numeric := 100;
      v_avaliador_completude numeric := 100;
      v_prazo_avaliacao timestamptz;
    BEGIN
      -- Prazo: avaliador deve finalizar em prazo_sla_correcao_horas após conclusão do executor
      v_prazo_avaliacao := COALESCE(NEW.fim_em, now()) + (COALESCE(v_template.prazo_sla_correcao_horas, 24)::text || ' hours')::interval;
      IF NEW.avaliador_fim_em <= v_prazo_avaliacao THEN
        v_avaliador_prazo := 100;
      ELSE
        v_avaliador_prazo := GREATEST(0, 100 - EXTRACT(EPOCH FROM (NEW.avaliador_fim_em - v_prazo_avaliacao)) / 3600 * 10);
      END IF;

      -- Completude: todos os itens respondidos?
      IF v_template.tipo_execucao = 'checklist_inspecao' THEN
        SELECT COUNT(*) INTO v_total_itens FROM operational_template_check_items WHERE template_id = v_template.id;
        SELECT COUNT(*) INTO v_itens_conformes FROM operational_execution_check_answers WHERE assignment_id = NEW.id AND conforme IS NOT NULL;
        v_avaliador_completude := CASE WHEN v_total_itens > 0 THEN (v_itens_conformes::numeric / v_total_itens) * 100 ELSE 100 END;
      END IF;

      v_score_avaliador := GREATEST(0, LEAST(100, ROUND(v_avaliador_prazo * 0.7 + v_avaliador_completude * 0.3)));
    END;
  ELSE
    v_score_avaliador := NULL;
  END IF;

  -- Gravar scores no assignment
  NEW.score_executor := v_score_executor;
  NEW.score_avaliado := v_score_avaliado;
  NEW.score_avaliador := v_score_avaliador;
  NEW.pontuacao_obtida := v_score_executor; -- backward compat

  -- Inserir score logs conforme modo_pontuacao
  IF v_template.modo_pontuacao IN ('pontuar_executor', 'pontuar_ambos') AND NEW.responsavel_id IS NOT NULL THEN
    INSERT INTO operational_score_logs (assignment_id, profile_id, pontualidade, conformidade, qualidade_evidencia, sla_correcoes, score_final, tipo_score, target_profile_id, target_setor_id)
    VALUES (NEW.id, NEW.responsavel_id, v_pontualidade, v_conformidade, v_qualidade_evidencia, v_sla_correcoes, v_score_executor, 'executor', NEW.responsavel_id,
      CASE WHEN v_template.destino_score IN ('setor', 'ambos') THEN v_template.executor_setor_id ELSE NULL END);
  END IF;

  IF v_template.modo_pontuacao IN ('pontuar_avaliado', 'pontuar_ambos') AND COALESCE(NEW.avaliado_id, NEW.responsavel_id) IS NOT NULL THEN
    INSERT INTO operational_score_logs (assignment_id, profile_id, pontualidade, conformidade, qualidade_evidencia, sla_correcoes, score_final, tipo_score, target_profile_id, target_setor_id)
    VALUES (NEW.id, COALESCE(NEW.avaliado_id, NEW.responsavel_id), 0, v_score_avaliado, 0, 0, v_score_avaliado, 'avaliado', COALESCE(NEW.avaliado_id, NEW.responsavel_id),
      CASE WHEN v_template.destino_score IN ('setor', 'ambos') THEN v_template.avaliado_setor_id ELSE NULL END);
  END IF;

  IF v_score_avaliador IS NOT NULL AND NEW.avaliador_id IS NOT NULL THEN
    INSERT INTO operational_score_logs (assignment_id, profile_id, pontualidade, conformidade, qualidade_evidencia, sla_correcoes, score_final, tipo_score, target_profile_id, target_setor_id)
    VALUES (NEW.id, NEW.avaliador_id, 0, 0, 0, 0, v_score_avaliador, 'avaliador', NEW.avaliador_id,
      CASE WHEN v_template.destino_score IN ('setor', 'ambos') THEN v_template.avaliador_setor_id ELSE NULL END);
  END IF;

  RETURN NEW;
END;
$$;
