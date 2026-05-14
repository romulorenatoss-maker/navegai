-- Remove penalidade_reprovacao (legado): substituído por regras por opção (gera_plano_acao, exige_observacao, etc)

-- 1) Reescreve o trigger de score: NC agora vale 0 (não usa mais penalidade percentual)
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
  v_penalidade_cont numeric;
  v_penalidade_sla_cont numeric;
  v_cont_fora_prazo int;
BEGIN
  IF NEW.status NOT IN ('concluida', 'aguardando_aprovacao') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_template FROM operational_templates WHERE id = NEW.template_id;
  v_snapshot := COALESCE(NEW.template_snapshot, '{}'::jsonb);

  v_penalidade_cont := COALESCE(v_template.penalidade_contingencia, 10);
  v_penalidade_sla_cont := COALESCE(v_template.penalidade_sla_contingencia, 15);

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
            WHEN fr.conforme = false THEN 0
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
    SELECT ss.sec_id, ss.score_secao, COALESCE(sec.peso, 1) AS sec_peso
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

  SELECT COUNT(*) INTO v_cont_fora_prazo
  FROM operational_contingencies
  WHERE assignment_id = NEW.id
    AND resolvida_em IS NOT NULL
    AND prazo_sla IS NOT NULL
    AND resolvida_em > prazo_sla;

  v_sla_correcoes := CASE WHEN v_total_contingencias > 0 THEN (v_contingencias_no_prazo::numeric / v_total_contingencias) * 100 ELSE 100 END;

  v_score_executor := GREATEST(0, LEAST(100, ROUND(
    v_pontualidade * 0.4 + v_score_bruto * 0.4 + v_qualidade_evidencia * 0.1 + v_sla_correcoes * 0.1
  )));
  IF v_total_contingencias > 0 THEN
    v_score_executor := GREATEST(0, v_score_executor - v_penalidade_cont);
  END IF;
  IF v_cont_fora_prazo > 0 THEN
    v_score_executor := GREATEST(0, v_score_executor - (v_penalidade_sla_cont * v_cont_fora_prazo));
  END IF;

  v_detalhe_executor := jsonb_build_object(
    'pontualidade', round(v_pontualidade, 2),
    'score_bruto', round(v_score_bruto, 2),
    'evidencia', round(v_qualidade_evidencia, 2),
    'sla_correcoes', round(v_sla_correcoes, 2),
    'formula', '(pont*0.4)+(bruto*0.4)+(evid*0.1)+(sla*0.1) - penalidades',
    'penalidade_contingencia', v_penalidade_cont,
    'penalidade_sla_contingencia', v_penalidade_sla_cont,
    'total_contingencias', v_total_contingencias,
    'contingencias_fora_prazo', v_cont_fora_prazo,
    'secoes', COALESCE(v_secoes_detail, '[]'::jsonb),
    'peso_recorrencia', COALESCE(v_template.peso_recorrencia, 1.0)
  );

  v_penalidade_devolucao := GREATEST(0, (COALESCE(NEW.rodada_atual, 1) - 1) * 5);
  v_score_avaliado := GREATEST(0, ROUND(v_score_bruto - v_penalidade_devolucao));
  IF v_total_contingencias > 0 THEN
    v_score_avaliado := GREATEST(0, v_score_avaliado - v_penalidade_cont);
  END IF;
  IF v_cont_fora_prazo > 0 THEN
    v_score_avaliado := GREATEST(0, v_score_avaliado - (v_penalidade_sla_cont * v_cont_fora_prazo));
  END IF;

  v_detalhe_avaliado := jsonb_build_object(
    'score_bruto', round(v_score_bruto, 2),
    'penalidade_devolucao', v_penalidade_devolucao,
    'penalidade_contingencia', v_penalidade_cont,
    'penalidade_sla_contingencia', v_penalidade_sla_cont,
    'total_contingencias', v_total_contingencias,
    'contingencias_fora_prazo', v_cont_fora_prazo,
    'rodada', COALESCE(NEW.rodada_atual, 1),
    'formula', 'score_bruto - (rodada-1)*5% - penalidades',
    'secoes', COALESCE(v_secoes_detail, '[]'::jsonb),
    'peso_recorrencia', COALESCE(v_template.peso_recorrencia, 1.0)
  );

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

  NEW.score_executor := v_score_executor;
  NEW.score_avaliado := v_score_avaliado;
  NEW.score_avaliador := v_score_avaliador;
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

  IF v_score_avaliador IS NOT NULL AND NEW.avaliador_id IS NOT NULL THEN
    INSERT INTO operational_score_logs (assignment_id, profile_id, pontualidade, conformidade, qualidade_evidencia, sla_correcoes, score_final, tipo_score, target_profile_id, target_setor_id, detalhe_calculo)
    VALUES (NEW.id, NEW.avaliador_id, 0, 0, 0, 0, v_score_avaliador, 'avaliador', NEW.avaliador_id,
      COALESCE(NEW.setor_avaliador_id, v_template.avaliador_setor_id), v_detalhe_avaliador);
  END IF;

  UPDATE operational_contingencies
  SET dentro_prazo = CASE
    WHEN resolvida_em IS NOT NULL AND prazo_sla IS NOT NULL THEN resolvida_em <= prazo_sla
    ELSE NULL
  END
  WHERE assignment_id = NEW.id AND dentro_prazo IS NULL;

  RETURN NEW;
END;
$function$;

-- 2) Drop coluna nas três tabelas
ALTER TABLE public.operational_template_fields DROP COLUMN IF EXISTS penalidade_reprovacao;
ALTER TABLE public.operational_template_check_items DROP COLUMN IF EXISTS penalidade_reprovacao;
ALTER TABLE public.tarefas_pontuacao_config DROP COLUMN IF EXISTS penalidade_reprovacao;