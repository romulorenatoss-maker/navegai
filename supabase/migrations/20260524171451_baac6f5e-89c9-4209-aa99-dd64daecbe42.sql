-- Reaplica/garante operational_assignment_stage_runs + RPCs do executor + reload PostgREST
CREATE TABLE IF NOT EXISTS public.operational_assignment_stage_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  stage_id text NOT NULL,
  stage_label text NOT NULL,
  stage_order integer NOT NULL DEFAULT 0,
  horario_inicio_previsto time,
  horario_fim_previsto time,
  status text NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento', 'concluida')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_seconds integer,
  inicio_atrasado boolean NOT NULL DEFAULT false,
  inicio_atraso_minutos integer NOT NULL DEFAULT 0,
  fim_atrasado boolean NOT NULL DEFAULT false,
  fim_atraso_minutos integer NOT NULL DEFAULT 0,
  finalizado_no_prazo boolean,
  started_by uuid REFERENCES public.profiles(id),
  finished_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, stage_id)
);

ALTER TABLE public.operational_assignment_stage_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view assignment stage runs" ON public.operational_assignment_stage_runs;
DROP POLICY IF EXISTS "Admins can manage assignment stage runs" ON public.operational_assignment_stage_runs;

CREATE POLICY "Authenticated can view assignment stage runs"
  ON public.operational_assignment_stage_runs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage assignment stage runs"
  ON public.operational_assignment_stage_runs
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_op_stage_runs_assignment
  ON public.operational_assignment_stage_runs(assignment_id, stage_order);
CREATE INDEX IF NOT EXISTS idx_op_stage_runs_status
  ON public.operational_assignment_stage_runs(status, started_at);

CREATE OR REPLACE FUNCTION public.tarefas_fn_expected_stage_at(
  p_data date,
  p_horario time
) RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_data IS NULL OR p_horario IS NULL THEN NULL
    ELSE (p_data::text || ' ' || p_horario::text || ' America/Sao_Paulo')::timestamptz
  END;
$$;

CREATE OR REPLACE FUNCTION public.tarefas_rpc_executor_iniciar_etapa(
  p_assignment_id uuid,
  p_stage_id text,
  p_stage_label text,
  p_stage_order integer DEFAULT 0,
  p_horario_inicio_previsto time DEFAULT NULL,
  p_horario_fim_previsto time DEFAULT NULL
) RETURNS public.operational_assignment_stage_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_profile_id uuid;
  v_assignment public.operational_assignments%ROWTYPE;
  v_run public.operational_assignment_stage_runs%ROWTYPE;
  v_expected_start timestamptz;
  v_delay_minutes integer := 0;
  v_is_admin boolean := false;
  v_has_setor boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuario nao autenticado'; END IF;
  SELECT p.id INTO v_profile_id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1;
  v_is_admin := public.is_admin(auth.uid());
  IF v_profile_id IS NULL AND NOT v_is_admin THEN RAISE EXCEPTION 'Perfil nao encontrado'; END IF;

  SELECT * INTO v_assignment FROM public.operational_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;

  IF v_assignment.setor_executor_id IS NOT NULL AND v_profile_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.colaborador_setores cs
      WHERE cs.profile_id = v_profile_id AND cs.setor_id = v_assignment.setor_executor_id
    ) INTO v_has_setor;
  END IF;

  IF NOT v_is_admin
     AND v_assignment.responsavel_id IS DISTINCT FROM v_profile_id
     AND NOT (v_assignment.responsavel_id IS NULL AND v_has_setor) THEN
    RAISE EXCEPTION 'Sem permissao para iniciar etapa desta tarefa';
  END IF;

  SELECT * INTO v_run FROM public.operational_assignment_stage_runs
    WHERE assignment_id = p_assignment_id AND stage_id = p_stage_id FOR UPDATE;
  IF FOUND THEN RETURN v_run; END IF;

  v_expected_start := public.tarefas_fn_expected_stage_at(v_assignment.data_prevista, p_horario_inicio_previsto);
  IF v_expected_start IS NOT NULL AND now() > v_expected_start THEN
    v_delay_minutes := FLOOR(EXTRACT(EPOCH FROM (now() - v_expected_start)) / 60)::integer;
  END IF;

  INSERT INTO public.operational_assignment_stage_runs (
    assignment_id, stage_id, stage_label, stage_order,
    horario_inicio_previsto, horario_fim_previsto, status, started_at,
    inicio_atrasado, inicio_atraso_minutos, started_by
  ) VALUES (
    p_assignment_id, p_stage_id, COALESCE(NULLIF(p_stage_label, ''), 'Etapa'),
    COALESCE(p_stage_order, 0), p_horario_inicio_previsto, p_horario_fim_previsto,
    'em_andamento', now(), v_delay_minutes > 0, GREATEST(v_delay_minutes, 0), v_profile_id
  ) RETURNING * INTO v_run;

  UPDATE public.operational_assignments
  SET status = CASE WHEN status IN ('aberta','pendente','reaberta','devolvida') THEN 'em_andamento' ELSE status END,
      inicio_em = COALESCE(inicio_em, v_run.started_at),
      flag_sla_etapa_estourado = COALESCE(flag_sla_etapa_estourado, false) OR v_run.inicio_atrasado,
      justificativa_sla_etapa = CASE WHEN v_run.inicio_atrasado
        THEN COALESCE(justificativa_sla_etapa, 'Inicio de etapa fora do horario previsto')
        ELSE justificativa_sla_etapa END,
      updated_at = now()
  WHERE id = p_assignment_id;

  INSERT INTO public.operational_assignment_history (assignment_id, tipo_evento, usuario_id, etapa, detalhes_json)
  VALUES (p_assignment_id, 'executor_iniciou_etapa', v_profile_id, v_run.stage_label,
    jsonb_build_object('stage_id', v_run.stage_id, 'started_at', v_run.started_at,
      'horario_inicio_previsto', v_run.horario_inicio_previsto,
      'inicio_atrasado', v_run.inicio_atrasado, 'inicio_atraso_minutos', v_run.inicio_atraso_minutos));

  INSERT INTO public.operational_audit_trail (assignment_id, tipo_evento, executado_por, dados_anteriores, dados_novos)
  VALUES (p_assignment_id, 'executor_iniciou_etapa', v_profile_id, NULL,
    jsonb_build_object('stage_id', v_run.stage_id, 'stage_label', v_run.stage_label,
      'started_at', v_run.started_at, 'inicio_atrasado', v_run.inicio_atrasado,
      'inicio_atraso_minutos', v_run.inicio_atraso_minutos));

  RETURN v_run;
END;
$$;

CREATE OR REPLACE FUNCTION public.tarefas_rpc_executor_finalizar_etapa(
  p_assignment_id uuid,
  p_stage_id text
) RETURNS public.operational_assignment_stage_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_profile_id uuid;
  v_assignment public.operational_assignments%ROWTYPE;
  v_run public.operational_assignment_stage_runs%ROWTYPE;
  v_expected_finish timestamptz;
  v_finish_delay_minutes integer := 0;
  v_duration_seconds integer := 0;
  v_is_admin boolean := false;
  v_has_setor boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuario nao autenticado'; END IF;
  SELECT p.id INTO v_profile_id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1;
  v_is_admin := public.is_admin(auth.uid());
  IF v_profile_id IS NULL AND NOT v_is_admin THEN RAISE EXCEPTION 'Perfil nao encontrado'; END IF;

  SELECT * INTO v_assignment FROM public.operational_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa nao encontrada'; END IF;

  IF v_assignment.setor_executor_id IS NOT NULL AND v_profile_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.colaborador_setores cs
      WHERE cs.profile_id = v_profile_id AND cs.setor_id = v_assignment.setor_executor_id) INTO v_has_setor;
  END IF;

  IF NOT v_is_admin
     AND v_assignment.responsavel_id IS DISTINCT FROM v_profile_id
     AND NOT (v_assignment.responsavel_id IS NULL AND v_has_setor) THEN
    RAISE EXCEPTION 'Sem permissao para finalizar etapa desta tarefa';
  END IF;

  SELECT * INTO v_run FROM public.operational_assignment_stage_runs
    WHERE assignment_id = p_assignment_id AND stage_id = p_stage_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etapa ainda nao iniciada'; END IF;
  IF v_run.status = 'concluida' THEN RETURN v_run; END IF;

  v_expected_finish := public.tarefas_fn_expected_stage_at(v_assignment.data_prevista, v_run.horario_fim_previsto);
  IF v_expected_finish IS NOT NULL AND now() > v_expected_finish THEN
    v_finish_delay_minutes := FLOOR(EXTRACT(EPOCH FROM (now() - v_expected_finish)) / 60)::integer;
  END IF;
  v_duration_seconds := GREATEST(FLOOR(EXTRACT(EPOCH FROM (now() - v_run.started_at)))::integer, 0);

  UPDATE public.operational_assignment_stage_runs
  SET status = 'concluida', finished_at = now(), duration_seconds = v_duration_seconds,
      fim_atrasado = v_finish_delay_minutes > 0,
      fim_atraso_minutos = GREATEST(v_finish_delay_minutes, 0),
      finalizado_no_prazo = COALESCE(v_finish_delay_minutes <= 0, true),
      finished_by = v_profile_id, updated_at = now()
  WHERE id = v_run.id RETURNING * INTO v_run;

  UPDATE public.operational_assignments
  SET flag_sla_etapa_estourado = COALESCE(flag_sla_etapa_estourado, false) OR v_run.inicio_atrasado OR v_run.fim_atrasado,
      justificativa_sla_etapa = CASE WHEN v_run.fim_atrasado
        THEN COALESCE(justificativa_sla_etapa, 'Finalizacao de etapa fora do horario previsto')
        ELSE justificativa_sla_etapa END,
      updated_at = now()
  WHERE id = p_assignment_id;

  INSERT INTO public.operational_assignment_history (assignment_id, tipo_evento, usuario_id, etapa, detalhes_json)
  VALUES (p_assignment_id, 'executor_finalizou_etapa', v_profile_id, v_run.stage_label,
    jsonb_build_object('stage_id', v_run.stage_id, 'started_at', v_run.started_at,
      'finished_at', v_run.finished_at, 'duration_seconds', v_run.duration_seconds,
      'fim_atrasado', v_run.fim_atrasado, 'fim_atraso_minutos', v_run.fim_atraso_minutos,
      'finalizado_no_prazo', v_run.finalizado_no_prazo));

  INSERT INTO public.operational_audit_trail (assignment_id, tipo_evento, executado_por, dados_anteriores, dados_novos)
  VALUES (p_assignment_id, 'executor_finalizou_etapa', v_profile_id, NULL,
    jsonb_build_object('stage_id', v_run.stage_id, 'stage_label', v_run.stage_label,
      'started_at', v_run.started_at, 'finished_at', v_run.finished_at,
      'duration_seconds', v_run.duration_seconds, 'fim_atrasado', v_run.fim_atrasado,
      'fim_atraso_minutos', v_run.fim_atraso_minutos, 'finalizado_no_prazo', v_run.finalizado_no_prazo));

  RETURN v_run;
END;
$$;

CREATE OR REPLACE FUNCTION public.tarefas_rpc_executor_autosalvar_respostas(
  p_assignment_id uuid,
  p_respostas jsonb
) RETURNS TABLE (assignment_id uuid, respostas_salvas integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_profile_id uuid;
  v_status_atual text;
  v_responsavel_id uuid;
  v_setor_executor_id uuid;
  v_is_setor_member boolean := false;
  v_is_admin boolean := false;
  v_count integer := 0;
  v_resposta jsonb;
  v_field_id uuid;
BEGIN
  SELECT p.id INTO v_profile_id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  v_is_admin := COALESCE(public.is_admin(auth.uid()), false);

  SELECT oa.status, oa.responsavel_id, oa.setor_executor_id
  INTO v_status_atual, v_responsavel_id, v_setor_executor_id
  FROM public.operational_assignments oa WHERE oa.id = p_assignment_id FOR UPDATE;

  IF v_status_atual IS NULL THEN RAISE EXCEPTION 'Tarefa % nao encontrada', p_assignment_id; END IF;
  IF v_status_atual NOT IN ('aberta','pendente','em_andamento','reaberta','devolvida') THEN
    RAISE EXCEPTION 'Tarefa em status % nao permite autosave do executor', v_status_atual;
  END IF;

  IF NOT v_is_admin THEN
    IF v_responsavel_id IS NOT NULL AND v_responsavel_id <> v_profile_id THEN
      RAISE EXCEPTION 'Usuario sem permissao para autosalvar respostas desta tarefa';
    END IF;
    IF v_responsavel_id IS NULL AND v_setor_executor_id IS NOT NULL THEN
      SELECT EXISTS (SELECT 1 FROM public.colaborador_setores cs
        WHERE cs.profile_id = v_profile_id AND cs.setor_id = v_setor_executor_id) INTO v_is_setor_member;
      IF NOT v_is_setor_member THEN RAISE EXCEPTION 'Usuario fora do setor executor da tarefa'; END IF;
    END IF;
  END IF;

  IF jsonb_typeof(COALESCE(p_respostas, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Payload de respostas deve ser um array JSON';
  END IF;

  FOR v_resposta IN
    SELECT resposta_elem.value FROM jsonb_array_elements(COALESCE(p_respostas, '[]'::jsonb)) AS resposta_elem(value)
  LOOP
    v_field_id := NULLIF(v_resposta->>'field_id', '')::uuid;
    IF v_field_id IS NULL THEN RAISE EXCEPTION 'Resposta sem field_id'; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.operational_assignments oa
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE((oa.template_snapshot::jsonb)->'fields', '[]'::jsonb)) AS field_snapshot(value)
      WHERE oa.id = p_assignment_id AND (field_snapshot.value->>'id')::uuid = v_field_id
    ) THEN
      RAISE EXCEPTION 'Pergunta % nao pertence ao snapshot da tarefa %', v_field_id, p_assignment_id;
    END IF;

    INSERT INTO public.operational_field_answers (
      assignment_id, field_id, valor_booleano, valor_texto, valor_numero, valor_json,
      evidencia_url, evidencia_anexo_id, evidencia_mime_type, observacao, respondido_por, respondido_em
    ) VALUES (
      p_assignment_id, v_field_id,
      NULLIF(v_resposta->>'valor_booleano','')::boolean,
      v_resposta->>'valor_texto',
      NULLIF(v_resposta->>'valor_numero','')::numeric,
      v_resposta->'valor_json',
      v_resposta->>'evidencia_url',
      NULLIF(v_resposta->>'evidencia_anexo_id','')::uuid,
      v_resposta->>'evidencia_mime_type',
      v_resposta->>'observacao',
      v_profile_id, now()
    )
    ON CONFLICT (assignment_id, field_id, versao) DO UPDATE SET
      valor_booleano = EXCLUDED.valor_booleano,
      valor_texto = EXCLUDED.valor_texto,
      valor_numero = EXCLUDED.valor_numero,
      valor_json = EXCLUDED.valor_json,
      evidencia_url = EXCLUDED.evidencia_url,
      evidencia_anexo_id = EXCLUDED.evidencia_anexo_id,
      evidencia_mime_type = EXCLUDED.evidencia_mime_type,
      observacao = EXCLUDED.observacao,
      respondido_por = EXCLUDED.respondido_por,
      respondido_em = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT p_assignment_id, v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tarefas_rpc_executor_iniciar_etapa(uuid, text, text, integer, time, time) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tarefas_rpc_executor_finalizar_etapa(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tarefas_rpc_executor_autosalvar_respostas(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';