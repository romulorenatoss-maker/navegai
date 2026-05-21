-- =============================================================================
-- ROLLBACK — Rebuild do Fluxo de Tarefas (2026-05-21)
-- =============================================================================
-- Use APENAS se precisar reverter completamente o rebuild. Restaura triggers
-- de status removidos e devolve o COMMENT das RPCs antigas para neutro.
--
-- Não dropa as RPCs novas — elas convivem se você quiser rolar parcialmente.
-- Para drop completo das RPCs novas, descomente a seção opcional no final.
--
-- Antes de rodar: confirme que NÃO há dados em tarefas_planos_acao_*  cujo
-- workflow dependa dos triggers/RPCs novas.
-- =============================================================================

-- 1. Restaurar triggers de status removidos (apontavam para as funções
--    *_fn_trigger_apos_* que ainda existem no banco, marcadas como deprecated)

CREATE TRIGGER tarefas_trigger_status_apos_aprovador_criar_plano
  AFTER INSERT ON public.tarefas_planos_acao_aprovador
  FOR EACH ROW
  EXECUTE FUNCTION public.tarefas_fn_trigger_apos_aprovador_criar_plano();

CREATE TRIGGER tarefas_trigger_status_apos_executor_responder_plano
  AFTER UPDATE OF respondido ON public.tarefas_planos_acao_aprovador
  FOR EACH ROW
  EXECUTE FUNCTION public.tarefas_fn_trigger_apos_executor_responder_plano();

CREATE TRIGGER tarefas_trigger_status_apos_auditor_criar_plano
  AFTER INSERT ON public.tarefas_planos_acao_auditor
  FOR EACH ROW
  EXECUTE FUNCTION public.tarefas_fn_trigger_apos_auditor_criar_plano();

CREATE TRIGGER tarefas_trigger_status_apos_aprovador_responder_plano_auditor
  AFTER UPDATE OF respondido ON public.tarefas_planos_acao_auditor
  FOR EACH ROW
  EXECUTE FUNCTION public.tarefas_fn_trigger_apos_aprovador_responder_plano_auditor();

-- 2. Remover deprecation markers das RPCs antigas
COMMENT ON FUNCTION public.tarefas_rpc_aprovador_criar_plano_acao IS NULL;
COMMENT ON FUNCTION public.tarefas_rpc_auditor_criar_plano_acao IS NULL;

-- =============================================================================
-- 3. (OPCIONAL) Dropar as 7 RPCs novas — só faça se for rollback TOTAL
-- =============================================================================
-- DROP FUNCTION IF EXISTS public.tarefas_rpc_executor_enviar_respostas(uuid, jsonb);
-- DROP FUNCTION IF EXISTS public.tarefas_rpc_executor_responder_plano_aprovador(uuid, jsonb);
-- DROP FUNCTION IF EXISTS public.tarefas_rpc_aprovador_criar_plano_executor(uuid, uuid, text, jsonb, timestamptz, text);
-- DROP FUNCTION IF EXISTS public.tarefas_rpc_aprovador_aprovar_para_auditoria(uuid, jsonb);
-- DROP FUNCTION IF EXISTS public.tarefas_rpc_aprovador_responder_plano_auditor(uuid, jsonb);
-- DROP FUNCTION IF EXISTS public.tarefas_rpc_auditor_criar_plano_aprovador(uuid, uuid, text, jsonb, timestamptz, text);
-- DROP FUNCTION IF EXISTS public.tarefas_rpc_auditor_aprovar_auditoria(uuid, jsonb);

-- =============================================================================
-- 4. Recarregar schema cache
-- =============================================================================
NOTIFY pgrst, 'reload schema';
