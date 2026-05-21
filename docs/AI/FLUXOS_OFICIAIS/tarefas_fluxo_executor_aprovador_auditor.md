# Fluxo oficial - tarefas executor/aprovador/auditor

## Tela oficial

- Rota: `/tarefas/minhas`
- Page: `src/modules/tarefas/pages/tarefas_minhasTarefasPage.tsx`
- Fonte funcional: `src/modules/tarefas/fluxo/`

## Paineis oficiais

- Executor: `src/modules/tarefas/fluxo/components/tarefas_fluxoExecutorPanel.tsx`
- Aprovador: `src/modules/tarefas/fluxo/components/tarefas_fluxoAprovadorPanel.tsx`
- Auditor: `src/modules/tarefas/fluxo/components/tarefas_fluxoAuditorPanel.tsx`

## Hooks e services oficiais

- `src/modules/tarefas/fluxo/hooks/tarefas_useFluxoTarefa.ts`
- `src/modules/tarefas/fluxo/hooks/tarefas_useExecutorActions.ts`
- `src/modules/tarefas/fluxo/hooks/tarefas_useAprovadorActions.ts`
- `src/modules/tarefas/fluxo/hooks/tarefas_useAuditorActions.ts`
- `src/modules/tarefas/fluxo/hooks/tarefas_useFluxoPermissoes.ts`
- `src/modules/tarefas/fluxo/services/tarefas_fluxoRpcService.ts`
- `src/modules/tarefas/fluxo/services/tarefas_fluxoStatusMachine.ts`
- `src/modules/tarefas/fluxo/services/tarefas_fluxoHistoricoMapper.ts`

## RPCs oficiais

- `tarefas_rpc_executor_enviar_respostas`
- `tarefas_rpc_executor_responder_plano_aprovador`
- `tarefas_rpc_aprovador_criar_plano_executor`
- `tarefas_rpc_aprovador_aprovar_para_auditoria`
- `tarefas_rpc_aprovador_responder_plano_auditor`
- `tarefas_rpc_auditor_criar_plano_aprovador`
- `tarefas_rpc_auditor_aprovar_auditoria`

## Regras

- R0 do executor e salva em `operational_field_answers`.
- R0 nao pode ser sobrescrita depois do envio inicial.
- Em `devolvida`, executor responde plano do aprovador; nao reenvia R0.
- Aprovador nao aprova se houver plano pendente.
- Auditor age em `aguardando_auditoria`.
- Fluxo principal nao deve consultar tabela legada de revisoes por campo.

## Proibido voltar para o drawer principal

- `useAssignmentExecution`
- `usePlanosAcao`
- `DrawerActionRouter`
- `EmbeddedReviewPanel`
- `DynamicFieldRenderer` solto na page
- `ExecutorPlanoAprovadorCard` solto na page
