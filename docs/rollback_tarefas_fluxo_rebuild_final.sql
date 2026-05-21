-- ============================================================================
-- Rollback - tarefas fluxo rebuild final
-- Data: 2026-05-21
-- Escopo SQL: desfaz apenas a mudanca da RPC tarefas_rpc_executor_enviar_respostas
-- ============================================================================
-- Uso:
-- 1. Reverter o commit de frontend/docs pelo Git.
-- 2. Executar este SQL se for necessario restaurar a regra anterior da RPC.
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
  v_count INT := 0;
  v_resposta JSONB;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado';
  END IF;

  SELECT status INTO v_status_atual
    FROM public.operational_assignments
    WHERE id = p_assignment_id;

  IF v_status_atual IS NULL THEN
    RAISE EXCEPTION 'Tarefa % nao encontrada', p_assignment_id;
  END IF;

  IF v_status_atual NOT IN ('pendente', 'em_andamento', 'devolvida') THEN
    RAISE EXCEPTION 'Tarefa em status % nao aceita envio do executor', v_status_atual;
  END IF;

  FOR v_resposta IN SELECT * FROM jsonb_array_elements(COALESCE(p_respostas, '[]'::jsonb))
  LOOP
    INSERT INTO public.operational_field_answers (
      assignment_id, field_id,
      valor_booleano, valor_texto, valor_numero, valor_json,
      evidencia_url, evidencia_anexo_id, evidencia_mime_type,
      observacao, respondido_por, respondido_em
    ) VALUES (
      p_assignment_id,
      (v_resposta->>'field_id')::uuid,
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
    )
    ON CONFLICT (assignment_id, field_id) DO UPDATE SET
      valor_booleano = EXCLUDED.valor_booleano,
      valor_texto = EXCLUDED.valor_texto,
      valor_numero = EXCLUDED.valor_numero,
      valor_json = EXCLUDED.valor_json,
      evidencia_url = COALESCE(EXCLUDED.evidencia_url, public.operational_field_answers.evidencia_url),
      evidencia_anexo_id = COALESCE(EXCLUDED.evidencia_anexo_id, public.operational_field_answers.evidencia_anexo_id),
      evidencia_mime_type = COALESCE(EXCLUDED.evidencia_mime_type, public.operational_field_answers.evidencia_mime_type),
      observacao = EXCLUDED.observacao,
      respondido_por = EXCLUDED.respondido_por,
      respondido_em = EXCLUDED.respondido_em;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.operational_assignments
    SET status = 'aguardando_aprovacao',
        updated_at = now(),
        finalizado_em = COALESCE(finalizado_em, now())
    WHERE id = p_assignment_id;

  INSERT INTO public.operational_execution_logs (assignment_id, acao, executado_por, detalhes)
    VALUES (p_assignment_id, 'executor_enviou_respostas', v_profile_id,
            jsonb_build_object('total_respostas', v_count, 'status_anterior', v_status_atual));

  RETURN QUERY SELECT p_assignment_id, 'aguardando_aprovacao'::text, v_count;
END;
$$;

COMMENT ON FUNCTION public.tarefas_rpc_executor_enviar_respostas IS
  'Rollback: restaura comportamento anterior com upsert e status devolvida permitido.';
