
CREATE OR REPLACE FUNCTION public.check_os_completion_on_response()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_os_id UUID;
  v_total_perguntas INT;
  v_total_respostas INT;
  v_atendente_id UUID;
  v_tecnico_id UUID;
BEGIN
  v_os_id := COALESCE(NEW.ordem_servico_id, OLD.ordem_servico_id);
  IF v_os_id IS NULL THEN RETURN NEW; END IF;

  -- Count total questions in the OS snapshot
  SELECT COUNT(*) INTO v_total_perguntas
  FROM public.os_perguntas WHERE os_id = v_os_id;

  -- Count distinct questions with valid responses (sim, nao, na)
  SELECT COUNT(DISTINCT ra.pergunta_id) INTO v_total_respostas
  FROM public.respostas_avaliacao ra
  INNER JOIN public.os_perguntas op ON op.pergunta_id = ra.pergunta_id AND op.os_id = v_os_id
  WHERE ra.ordem_servico_id = v_os_id AND ra.resposta IS NOT NULL;

  -- All questions answered → check if avaliados are set before concluding
  IF v_total_perguntas > 0 AND v_total_respostas >= v_total_perguntas THEN
    -- Verify atendente and tecnico are filled before auto-concluding
    SELECT atendente_id, tecnico_id INTO v_atendente_id, v_tecnico_id
    FROM public.ordens_servico WHERE id = v_os_id;

    IF v_atendente_id IS NULL OR v_tecnico_id IS NULL THEN
      -- Do NOT conclude: avaliados not yet selected. Keep as em_andamento.
      UPDATE public.ordens_servico 
      SET status = 'em_andamento' 
      WHERE id = v_os_id AND status = 'aberta';
      RETURN NEW;
    END IF;

    -- Auto-finalize all pending avaliacoes for this OS
    UPDATE public.avaliacoes 
    SET concluida = true, concluida_em = COALESCE(concluida_em, now())
    WHERE ordem_servico_id = v_os_id AND concluida = false;

    -- Conclude the OS
    UPDATE public.ordens_servico 
    SET status = 'concluida', data_conclusao = now() 
    WHERE id = v_os_id AND status != 'concluida';
  ELSIF v_total_respostas > 0 THEN
    -- At least one response → move to em_andamento
    UPDATE public.ordens_servico 
    SET status = 'em_andamento' 
    WHERE id = v_os_id AND status = 'aberta';
  END IF;

  RETURN NEW;
END;
$function$;
