
-- New trigger on respostas_avaliacao: when all os_perguntas have a response, conclude the OS
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

  -- All questions answered → conclude OS and auto-finalize all avaliacoes
  IF v_total_perguntas > 0 AND v_total_respostas >= v_total_perguntas THEN
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

-- Create trigger on respostas_avaliacao
DROP TRIGGER IF EXISTS trigger_check_os_on_response ON public.respostas_avaliacao;
CREATE TRIGGER trigger_check_os_on_response
  AFTER INSERT OR UPDATE ON public.respostas_avaliacao
  FOR EACH ROW
  EXECUTE FUNCTION public.check_os_completion_on_response();

-- Simplify the old avaliacoes trigger to only handle status transitions, not block on empty evals
CREATE OR REPLACE FUNCTION public.check_os_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_os_id UUID;
  v_total_perguntas INT;
  v_total_respostas INT;
BEGIN
  v_os_id := NEW.ordem_servico_id;

  SELECT COUNT(*) INTO v_total_perguntas
  FROM public.os_perguntas WHERE os_id = v_os_id;

  SELECT COUNT(DISTINCT ra.pergunta_id) INTO v_total_respostas
  FROM public.respostas_avaliacao ra
  INNER JOIN public.os_perguntas op ON op.pergunta_id = ra.pergunta_id AND op.os_id = v_os_id
  WHERE ra.ordem_servico_id = v_os_id AND ra.resposta IS NOT NULL;

  IF v_total_perguntas > 0 AND v_total_respostas >= v_total_perguntas THEN
    UPDATE public.ordens_servico SET status = 'concluida', data_conclusao = now() WHERE id = v_os_id AND status != 'concluida';
  ELSIF v_total_respostas > 0 THEN
    UPDATE public.ordens_servico SET status = 'em_andamento' WHERE id = v_os_id AND status = 'aberta';
  END IF;

  RETURN NEW;
END;
$function$;
