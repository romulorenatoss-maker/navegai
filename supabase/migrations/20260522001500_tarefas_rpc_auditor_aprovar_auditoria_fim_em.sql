CREATE OR REPLACE FUNCTION public.tarefas_rpc_auditor_aprovar_auditoria(
  p_assignment_id UUID,
  p_notas JSONB DEFAULT NULL
)
RETURNS TABLE (assignment_id UUID, novo_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_status_atual TEXT;
  v_pendentes_auditor INT;
BEGIN
  SELECT p.id
    INTO v_profile_id
    FROM public.profiles AS p
    WHERE p.user_id = auth.uid()
    LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado';
  END IF;

  SELECT oa.status
    INTO v_status_atual
    FROM public.operational_assignments AS oa
    WHERE oa.id = p_assignment_id
    FOR UPDATE;

  IF v_status_atual IS NULL THEN
    RAISE EXCEPTION 'Tarefa % nao encontrada', p_assignment_id;
  END IF;

  IF v_status_atual <> 'aguardando_auditoria' THEN
    RAISE EXCEPTION 'Auditor so pode aprovar em status aguardando_auditoria (atual: %)', v_status_atual;
  END IF;

  SELECT COUNT(*)
    INTO v_pendentes_auditor
    FROM public.tarefas_planos_acao_auditor AS taa
    WHERE taa.assignment_id = p_assignment_id
      AND taa.deleted_at IS NULL
      AND taa.respondido = false;

  IF v_pendentes_auditor > 0 THEN
    RAISE EXCEPTION 'Existem % plano(s) do auditor pendentes - aprovador precisa responder primeiro', v_pendentes_auditor;
  END IF;

  UPDATE public.operational_assignments AS oa
    SET status = 'concluida',
        updated_at = now(),
        fim_em = COALESCE(oa.fim_em, now()),
        auditor_fim_em = COALESCE(oa.auditor_fim_em, now()),
        auditado_em = COALESCE(oa.auditado_em, now()),
        auditado_por = COALESCE(oa.auditado_por, v_profile_id)
    WHERE oa.id = p_assignment_id;

  INSERT INTO public.operational_audit_trail (
    assignment_id,
    tipo_evento,
    executado_por,
    dados_anteriores,
    dados_novos
  ) VALUES (
    p_assignment_id,
    'auditor_aprovou_auditoria',
    v_profile_id,
    jsonb_build_object('status', v_status_atual),
    jsonb_build_object('status', 'concluida', 'notas', COALESCE(p_notas, '{}'::jsonb))
  );

  RETURN QUERY
    SELECT p_assignment_id, 'concluida'::text;
END;
$$;

COMMENT ON FUNCTION public.tarefas_rpc_auditor_aprovar_auditoria IS
  'Auditor aprova auditoria e finaliza a tarefa (status=concluida). Usa fim_em/auditor_fim_em.';

NOTIFY pgrst, 'reload schema';
