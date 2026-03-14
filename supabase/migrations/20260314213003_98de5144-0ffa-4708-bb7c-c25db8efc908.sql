CREATE TRIGGER on_avaliacao_update_check_os_completion
  AFTER UPDATE ON public.avaliacoes
  FOR EACH ROW
  WHEN (NEW.concluida = true AND OLD.concluida = false)
  EXECUTE FUNCTION public.check_os_completion();