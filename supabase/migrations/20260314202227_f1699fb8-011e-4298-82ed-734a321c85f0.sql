
-- Create trigger to auto-conclude OS when all avaliacoes are finalized
CREATE TRIGGER trigger_check_os_completion
  AFTER UPDATE OF concluida ON public.avaliacoes
  FOR EACH ROW
  WHEN (NEW.concluida = true)
  EXECUTE FUNCTION public.check_os_completion();
