
-- Drop all duplicate triggers, keep only one clean one
DROP TRIGGER IF EXISTS on_avaliacao_insert ON public.avaliacoes;
DROP TRIGGER IF EXISTS on_avaliacao_update ON public.avaliacoes;
DROP TRIGGER IF EXISTS on_avaliacao_update_check_os_completion ON public.avaliacoes;
DROP TRIGGER IF EXISTS trg_check_os_completion ON public.avaliacoes;
DROP TRIGGER IF EXISTS trigger_check_os_completion ON public.avaliacoes;

-- Update the function to also verify ALL os_perguntas have responses
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
  
  -- Check all avaliacoes are concluded
  SELECT COUNT(*), COUNT(*) FILTER (WHERE concluida = true)
  INTO v_total_avals, v_completed_avals
  FROM public.avaliacoes WHERE ordem_servico_id = v_os_id;
  
  -- Check all os_perguntas have responses
  SELECT COUNT(*) INTO v_total_perguntas
  FROM public.os_perguntas WHERE os_id = v_os_id;
  
  SELECT COUNT(DISTINCT ra.pergunta_id) INTO v_total_respostas
  FROM public.respostas_avaliacao ra
  INNER JOIN public.os_perguntas op ON op.pergunta_id = ra.pergunta_id AND op.os_id = v_os_id
  WHERE ra.ordem_servico_id = v_os_id AND ra.resposta IS NOT NULL;
  
  -- Only conclude if ALL avaliacoes are done AND ALL questions have responses
  IF v_total_avals > 0 AND v_total_avals = v_completed_avals 
     AND v_total_perguntas > 0 AND v_total_respostas >= v_total_perguntas THEN
    UPDATE public.ordens_servico SET status = 'concluida', data_conclusao = now() WHERE id = v_os_id;
  ELSIF v_completed_avals > 0 THEN
    UPDATE public.ordens_servico SET status = 'em_andamento' WHERE id = v_os_id AND status = 'aberta';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create single clean trigger (only on conclusion change)
CREATE TRIGGER trigger_check_os_completion
  AFTER UPDATE OF concluida ON public.avaliacoes
  FOR EACH ROW
  WHEN (NEW.concluida = true)
  EXECUTE FUNCTION check_os_completion();
