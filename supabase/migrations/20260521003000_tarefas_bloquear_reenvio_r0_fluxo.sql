-- ============================================================================
-- TAREFAS - BLOQUEIO DE REENVIO R0 NO FLUXO OFICIAL
-- Data: 2026-05-21
-- Escopo: tarefas_rpc_executor_enviar_respostas
-- ============================================================================
-- Objetivo:
--  - manter operational_field_answers como registro original imutavel da R0;
--  - impedir reenvio/overwrite depois que a tarefa saiu da execucao inicial;
--  - validar executor individual, setor executor ou admin antes de salvar.
-- ============================================================================

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
  SELECT id INTO v_profile_id
    FROM public.profiles
    WHERE user_id = auth.uid()
    LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado';
  END IF;

  SELECT COALESCE(public.is_admin(auth.uid()), FALSE) INTO v_is_admin;

  SELECT status, responsavel_id, setor_executor_id
    INTO v_status_atual, v_responsavel_id, v_setor_executor_id
    FROM public.operational_assignments
    WHERE id = p_assignment_id
    FOR UPDATE;

  IF v_status_atual IS NULL THEN
    RAISE EXCEPTION 'Tarefa % nao encontrada', p_assignment_id;
  END IF;

  IF v_status_atual NOT IN ('pendente', 'em_andamento') THEN
    RAISE EXCEPTION 'R0 ja foi enviada ou a tarefa esta em status %, use a RPC de plano quando aplicavel', v_status_atual;
  END IF;

  IF NOT v_is_admin THEN
    IF v_responsavel_id IS NOT NULL AND v_responsavel_id <> v_profile_id THEN
      RAISE EXCEPTION 'Usuario sem permissao para enviar R0 desta tarefa';
    END IF;

    IF v_responsavel_id IS NULL AND v_setor_executor_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
          FROM public.colaborador_setores cs
          WHERE cs.profile_id = v_profile_id
            AND cs.setor_id = v_setor_executor_id
      ) INTO v_is_setor_member;

      IF NOT v_is_setor_member THEN
        RAISE EXCEPTION 'Usuario fora do setor executor da tarefa';
      END IF;
    END IF;
  END IF;

  IF jsonb_typeof(COALESCE(p_respostas, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Payload de respostas deve ser um array JSON';
  END IF;

  SELECT COUNT(*)
    INTO v_respostas_existentes
    FROM public.operational_field_answers
    WHERE assignment_id = p_assignment_id;

  IF v_respostas_existentes > 0 THEN
    RAISE EXCEPTION 'R0 ja existe para esta tarefa; overwrite de resposta original e bloqueado';
  END IF;

  FOR v_resposta IN SELECT * FROM jsonb_array_elements(COALESCE(p_respostas, '[]'::jsonb))
  LOOP
    v_field_id := NULLIF(v_resposta->>'field_id', '')::uuid;

    IF v_field_id IS NULL THEN
      RAISE EXCEPTION 'Resposta sem field_id';
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM public.operational_assignments oa
        CROSS JOIN LATERAL jsonb_array_elements(
          COALESCE((oa.template_snapshot::jsonb)->'fields', '[]'::jsonb)
        ) field_snapshot
        WHERE oa.id = p_assignment_id
          AND (field_snapshot->>'id')::uuid = v_field_id
    ) THEN
      RAISE EXCEPTION 'Pergunta % nao pertence ao snapshot da tarefa %', v_field_id, p_assignment_id;
    END IF;

    INSERT INTO public.operational_field_answers (
      assignment_id, field_id,
      valor_booleano, valor_texto, valor_numero, valor_json,
      evidencia_url, evidencia_anexo_id, evidencia_mime_type,
      observacao, respondido_por, respondido_em
    ) VALUES (
      p_assignment_id,
      v_field_id,
      NULLIF(v_resposta->>'valor_booleano', '')::boolean,
      v_resposta->>'valor_texto',
      NULLIF(v_resposta->>'valor_numero', '')::numeric,
      v_resposta->'valor_json',
      v_resposta->>'evidencia_url',
      NULLIF(v_resposta->>'evidencia_anexo_id', '')::uuid,
      v_resposta->>'evidencia_mime_type',
      v_resposta->>'observacao',
      v_profile_id,
      now()
    );

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.operational_assignments
    SET status = 'aguardando_aprovacao',
        updated_at = now(),
        finalizado_em = COALESCE(finalizado_em, now())
    WHERE id = p_assignment_id;

  INSERT INTO public.operational_execution_logs (assignment_id, acao, executado_por, detalhes)
    VALUES (
      p_assignment_id,
      'executor_enviou_respostas',
      v_profile_id,
      jsonb_build_object(
        'total_respostas', v_count,
        'status_anterior', v_status_atual,
        'bloqueio_overwrite_r0', true
      )
    );

  RETURN QUERY SELECT p_assignment_id, 'aguardando_aprovacao'::text, v_count;
END;
$$;

COMMENT ON FUNCTION public.tarefas_rpc_executor_enviar_respostas IS
  'Salva R0 uma unica vez e muda status para aguardando_aprovacao. Overwrite bloqueado; planos usam RPC propria.';
