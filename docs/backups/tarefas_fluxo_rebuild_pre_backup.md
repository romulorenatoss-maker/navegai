# Backup logico - tarefas fluxo rebuild

Data: 2026-05-21
HEAD: 08274eaf57563019f3318d6af400f01502f7d7c0

## Escopo mapeado

Somente arquivos/objetos autorizados no comando de rebuild foram mapeados.

## Status antes

``text
?? docs/backups/
``

## Arquivos mapeados

``text
src/modules/tarefas/components/painels/tarefas_drawerActionRouter.tsx	3807	2026-05-20 23:08:37
src/modules/tarefas/components/painels/tarefas_panelRegistry.ts	3334	2026-05-20 23:08:37
src/modules/tarefas/components/tarefas_embeddedActionPanels.tsx	147057	2026-05-20 23:41:06
src/modules/tarefas/fluxo/components/tarefas_fluxoAprovadorPanel.tsx	14622	2026-05-20 23:25:48
src/modules/tarefas/fluxo/components/tarefas_fluxoAuditorPanel.tsx	9676	2026-05-20 23:25:48
src/modules/tarefas/fluxo/components/tarefas_fluxoBannerPendenciaAuditor.tsx	1306	2026-05-20 23:25:48
src/modules/tarefas/fluxo/components/tarefas_fluxoBotaoConformeNaoConforme.tsx	1899	2026-05-20 23:25:48
src/modules/tarefas/fluxo/components/tarefas_fluxoExecutorPanel.tsx	7484	2026-05-20 23:25:48
src/modules/tarefas/fluxo/components/tarefas_fluxoPerguntaHistoricoCard.tsx	5264	2026-05-20 23:25:48
src/modules/tarefas/fluxo/components/tarefas_fluxoPlanoAprovadorCard.tsx	6145	2026-05-20 23:25:48
src/modules/tarefas/fluxo/components/tarefas_fluxoPlanoAuditorCard.tsx	5851	2026-05-20 23:25:48
src/modules/tarefas/fluxo/hooks/tarefas_useAprovadorActions.ts	2569	2026-05-20 23:25:48
src/modules/tarefas/fluxo/hooks/tarefas_useAuditorActions.ts	1865	2026-05-20 23:25:48
src/modules/tarefas/fluxo/hooks/tarefas_useExecutorActions.ts	2161	2026-05-20 23:25:48
src/modules/tarefas/fluxo/hooks/tarefas_useFluxoPermissoes.ts	4528	2026-05-20 23:25:48
src/modules/tarefas/fluxo/hooks/tarefas_useFluxoTarefa.ts	4856	2026-05-20 23:25:48
src/modules/tarefas/fluxo/services/tarefas_fluxoHistoricoMapper.ts	7293	2026-05-20 23:25:48
src/modules/tarefas/fluxo/services/tarefas_fluxoRpcService.ts	5425	2026-05-20 23:25:48
src/modules/tarefas/fluxo/services/tarefas_fluxoStatusMachine.ts	5445	2026-05-20 23:25:48
src/modules/tarefas/fluxo/types/tarefas_fluxoTypes.ts	6534	2026-05-20 23:25:48
src/modules/tarefas/hooks/tarefas_useApprovalFlow.ts	25910	2026-05-20 23:41:06
src/modules/tarefas/hooks/tarefas_useAssignmentExecution.ts	29686	2026-05-20 23:41:06
src/modules/tarefas/hooks/tarefas_useFlowPermissions.ts	17191	2026-05-20 23:41:06
src/modules/tarefas/hooks/tarefas_usePlanosAcao.ts	9167	2026-05-20 23:41:06
src/modules/tarefas/pages/tarefas_minhasTarefasPage.tsx	83864	2026-05-20 23:41:06
supabase/migrations/20260520180000_tarefas_planos_acao_separados_por_setor.sql	19020	2026-05-20 23:08:37
supabase/migrations/20260521000000_rebuild_tarefas_fluxo_executor_aprovador_auditor.sql	26741	2026-05-20 23:25:48
``

## Observacao

Este backup e logico: registra arvore, tamanhos, timestamps e HEAD antes da alteracao. Rollback tecnico primario deve ser feito via git revert do commit gerado.
