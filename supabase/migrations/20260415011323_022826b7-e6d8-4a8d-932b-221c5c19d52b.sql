
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
  v_total_itens int;
  v_itens_conformes int;
  v_total_contingencias int;
  v_contingencias_no_prazo int;
  v_template record;
  v_detalhe_executor jsonb;
  v_detalhe_avaliado jsonb;
  v_detalhe_avaliador jsonb;
  v_soma_ponderada numeric;
  v_soma_maxima numeric;
  v_itens_detail jsonb;
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

  -- Conformidade executor (30%) - etapas com peso
  IF v_template.tipo_execucao = 'etapas' THEN
    SELECT
      COALESCE(SUM(ts.peso), 0),
      COALESCE(SUM(CASE WHEN sl.status = 'concluida' THEN ts.peso ELSE 0 END), 0)
    INTO v_soma_maxima, v_soma_ponderada
    FROM operational_execution_step_logs sl
    JOIN operational_template_steps ts ON ts.id = sl.step_id
    WHERE sl.assignment_id = NEW.id;
    v_conformidade := CASE WHEN v_soma_maxima > 0 THEN (v_soma_ponderada / v_soma_maxima) * 100 ELSE 100 END;
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

  v_detalhe_executor := jsonb_build_object(
    'pontualidade', round(v_pontualidade, 2),
    'conformidade', round(v_conformidade, 2),
    'evidencia', round(v_qualidade_evidencia, 2),
    'sla_correcoes', round(v_sla_correcoes, 2),
    'formula', '(pont*0.4)+(conf*0.3)+(evid*0.2)+(sla*0.1)'
  );

  -- === SCORE AVALIADO (redesenhado com pesos individuais) ===
  IF v_template.tipo_execucao = 'checklist_inspecao' THEN
    SELECT
      COALESCE(SUM(
        CASE
          WHEN ca.conforme = true THEN ci.peso * ci.nota_maxima
          WHEN ca.conforme = false THEN ci.peso * ci.nota_maxima * (1 - ci.penalidade_reprovacao / 100.0)
          ELSE 0
        END
      ), 0),
      COALESCE(SUM(ci.peso * ci.nota_maxima), 0),
      jsonb_agg(jsonb_build_object(
        'pergunta', ci.pergunta,
        'peso', ci.peso,
        'nota_maxima', ci.nota_maxima,
        'penalidade', ci.penalidade_reprovacao,
        'conforme', ca.conforme,
        'nota_obtida', CASE
          WHEN ca.conforme = true THEN ci.peso * ci.nota_maxima
          WHEN ca.conforme = false THEN ci.peso * ci.nota_maxima * (1 - ci.penalidade_reprovacao / 100.0)
          ELSE 0
        END
      ) ORDER BY ci.ordem)
    INTO v_soma_ponderada, v_soma_maxima, v_itens_detail
    FROM operational_execution_check_answers ca
    JOIN operational_template_check_items ci ON ci.id = ca.check_item_id
    WHERE ca.assignment_id = NEW.id;

    IF v_soma_maxima > 0 THEN
      v_score_avaliado := ROUND((v_soma_ponderada / v_soma_maxima) * 100);
    ELSE
      v_score_avaliado := 100;
    END IF;

    v_detalhe_avaliado := jsonb_build_object(
      'soma_ponderada', round(v_soma_ponderada, 2),
      'soma_maxima', round(v_soma_maxima, 2),
      'formula', 'sum(peso*nota_obtida)/sum(peso*nota_maxima)*100',
      'itens', COALESCE(v_itens_detail, '[]'::jsonb)
    );
  ELSE
    v_score_avaliado := v_score_executor;
    v_detalhe_avaliado := jsonb_build_object('herda_executor', true);
  END IF;

  -- === SCORE AVALIADOR ===
  IF NEW.avaliador_id IS NOT NULL AND NEW.avaliador_fim_em IS NOT NULL THEN
    DECLARE
      v_avaliador_prazo numeric := 100;
      v_avaliador_completude numeric := 100;
      v_prazo_avaliacao timestamptz;
    BEGIN
      v_prazo_avaliacao := COALESCE(NEW.fim_em, now()) + (COALESCE(v_template.prazo_sla_correcao_horas, 24)::text || ' hours')::interval;
      IF NEW.avaliador_fim_em <= v_prazo_avaliacao THEN
        v_avaliador_prazo := 100;
      ELSE
        v_avaliador_prazo := GREATEST(0, 100 - EXTRACT(EPOCH FROM (NEW.avaliador_fim_em - v_prazo_avaliacao)) / 3600 * 10);
      END IF;

      IF v_template.tipo_execucao = 'checklist_inspecao' THEN
        SELECT COUNT(*) INTO v_total_itens FROM operational_template_check_items WHERE template_id = v_template.id;
        SELECT COUNT(*) INTO v_itens_conformes FROM operational_execution_check_answers WHERE assignment_id = NEW.id AND conforme IS NOT NULL;
        v_avaliador_completude := CASE WHEN v_total_itens > 0 THEN (v_itens_conformes::numeric / v_total_itens) * 100 ELSE 100 END;
      END IF;

      v_score_avaliador := GREATEST(0, LEAST(100, ROUND(v_avaliador_prazo * 0.7 + v_avaliador_completude * 0.3)));
      v_detalhe_avaliador := jsonb_build_object(
        'prazo_auditoria', round(v_avaliador_prazo, 2),
        'completude', round(v_avaliador_completude, 2),
        'formula', '(prazo*0.7)+(completude*0.3)'
      );
    END;
  ELSE
    v_score_avaliador := NULL;
    v_detalhe_avaliador := NULL;
  END IF;

  -- Gravar scores no assignment
  NEW.score_executor := v_score_executor;
  NEW.score_avaliado := v_score_avaliado;
  NEW.score_avaliador := v_score_avaliador;
  NEW.pontuacao_obtida := v_score_executor;

  -- Inserir score logs com breakdown
  IF v_template.modo_pontuacao IN ('pontuar_executor', 'pontuar_ambos') AND NEW.responsavel_id IS NOT NULL THEN
    INSERT INTO operational_score_logs (assignment_id, profile_id, pontualidade, conformidade, qualidade_evidencia, sla_correcoes, score_final, tipo_score, target_profile_id, target_setor_id, detalhe_calculo)
    VALUES (NEW.id, NEW.responsavel_id, v_pontualidade, v_conformidade, v_qualidade_evidencia, v_sla_correcoes, v_score_executor, 'executor', NEW.responsavel_id,
      COALESCE(NEW.setor_executor_id, CASE WHEN v_template.destino_score IN ('setor', 'ambos') THEN v_template.executor_setor_id ELSE NULL END),
      v_detalhe_executor);
  END IF;

  IF v_template.modo_pontuacao IN ('pontuar_avaliado', 'pontuar_ambos') AND COALESCE(NEW.avaliado_id, NEW.responsavel_id) IS NOT NULL THEN
    INSERT INTO operational_score_logs (assignment_id, profile_id, pontualidade, conformidade, qualidade_evidencia, sla_correcoes, score_final, tipo_score, target_profile_id, target_setor_id, detalhe_calculo)
    VALUES (NEW.id, COALESCE(NEW.avaliado_id, NEW.responsavel_id), 0, v_score_avaliado, 0, 0, v_score_avaliado, 'avaliado', COALESCE(NEW.avaliado_id, NEW.responsavel_id),
      COALESCE(NEW.setor_avaliado_id, CASE WHEN v_template.destino_score IN ('setor', 'ambos') THEN v_template.avaliado_setor_id ELSE NULL END),
      v_detalhe_avaliado);
  END IF;

  IF v_score_avaliador IS NOT NULL AND NEW.avaliador_id IS NOT NULL THEN
    INSERT INTO operational_score_logs (assignment_id, profile_id, pontualidade, conformidade, qualidade_evidencia, sla_correcoes, score_final, tipo_score, target_profile_id, target_setor_id, detalhe_calculo)
    VALUES (NEW.id, NEW.avaliador_id, 0, 0, 0, 0, v_score_avaliador, 'avaliador', NEW.avaliador_id,
      COALESCE(NEW.setor_avaliador_id, CASE WHEN v_template.destino_score IN ('setor', 'ambos') THEN v_template.avaliador_setor_id ELSE NULL END),
      v_detalhe_avaliador);
  END IF;

  RETURN NEW;
END;
$function$;
