
-- Update trigger function to skip avaliacoes with 0 responses (empty evaluations shouldn't block OS completion)
CREATE OR REPLACE FUNCTION public.check_os_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_os_id UUID;
  v_total_avals INT;
  v_completed_avals INT;
  v_total_perguntas INT;
  v_total_respostas INT;
BEGIN
  SELECT ordem_servico_id INTO v_os_id FROM public.avaliacoes WHERE id = NEW.id;
  
  -- Count only avaliacoes that have at least 1 response (evaluators who actually participated)
  -- Empty avaliacoes (created but no questions for that sector) should NOT block completion
  SELECT 
    COUNT(*) FILTER (WHERE has_responses OR concluida = true),
    COUNT(*) FILTER (WHERE (has_responses OR concluida = true) AND concluida = true)
  INTO v_total_avals, v_completed_avals
  FROM (
    SELECT 
      a.id,
      a.concluida,
      EXISTS (
        SELECT 1 FROM public.respostas_avaliacao ra 
        WHERE ra.avaliacao_id = a.id AND ra.resposta IS NOT NULL
      ) as has_responses
    FROM public.avaliacoes a
    WHERE a.ordem_servico_id = v_os_id
  ) sub;
  
  -- Check all os_perguntas have responses
  SELECT COUNT(*) INTO v_total_perguntas
  FROM public.os_perguntas WHERE os_id = v_os_id;
  
  SELECT COUNT(DISTINCT ra.pergunta_id) INTO v_total_respostas
  FROM public.respostas_avaliacao ra
  INNER JOIN public.os_perguntas op ON op.pergunta_id = ra.pergunta_id AND op.os_id = v_os_id
  WHERE ra.ordem_servico_id = v_os_id AND ra.resposta IS NOT NULL;
  
  -- Only conclude if ALL participating avaliacoes are done AND ALL questions have responses
  IF v_total_avals > 0 AND v_total_avals = v_completed_avals 
     AND v_total_perguntas > 0 AND v_total_respostas >= v_total_perguntas THEN
    UPDATE public.ordens_servico SET status = 'concluida', data_conclusao = now() WHERE id = v_os_id;
  ELSIF v_completed_avals > 0 THEN
    UPDATE public.ordens_servico SET status = 'em_andamento' WHERE id = v_os_id AND status = 'aberta';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Also auto-finalize the empty avaliacao for OS 001 to trigger the check
UPDATE public.avaliacoes 
SET concluida = true, concluida_em = now()
WHERE id = 'd7077e0a-1313-49e9-b1e2-4e86de86812b' 
AND concluida = false;
