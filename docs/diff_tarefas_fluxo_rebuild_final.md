# Diff final - rebuild fluxo tarefas

Data: 2026-05-21
Modulo: `tarefas`
Rota impactada: `/tarefas/minhas`

## Objetivo

Corrigir o drawer de `Minhas Tarefas` para usar somente a estrutura oficial do fluxo:

- executor: `FluxoExecutorPanel`
- aprovador: `FluxoAprovadorPanel`
- auditor: `FluxoAuditorPanel`

Tambem bloquear reenvio/overwrite da resposta original R0 depois que a tarefa sai da execucao inicial.

## Arquivos alterados

- `src/modules/tarefas/pages/tarefas_minhasTarefasPage.tsx`
  - Removeu uso direto de hooks, renderer e roteador legado no fluxo principal.
  - Drawer passou a decidir apenas o papel e renderizar os paineis oficiais.
  - Contingencia e validacao de recebimento foram preservadas como fluxos auxiliares.

- `src/modules/tarefas/fluxo/services/tarefas_fluxoStatusMachine.ts`
  - `canExecutorEnviarRespostas` deixou de permitir envio R0 em `devolvida`.

- `src/modules/tarefas/fluxo/hooks/tarefas_useFluxoTarefa.ts`
  - Comentario ajustado para remover mencao literal a tabela legada.

- `supabase/migrations/20260521003000_tarefas_bloquear_reenvio_r0_fluxo.sql`
  - Recria `tarefas_rpc_executor_enviar_respostas` com bloqueio de overwrite R0.
  - Valida executor individual, setor executor ou admin.
  - Usa `FOR UPDATE` na tarefa para evitar corrida de envio.
  - Rejeita status fora de `pendente` e `em_andamento`.

## Arquivos criados

- `docs/backups/tarefas_fluxo_rebuild_pre_backup.md`
- `docs/backups/tarefas_fluxo_rebuild_pre_tree.txt`
- `docs/diff_tarefas_fluxo_rebuild_final.md`
- `docs/manifest_tarefas_fluxo_rebuild_final.json`
- `docs/rollback_tarefas_fluxo_rebuild_final.sql`
- `docs/tarefas_fluxo_validacao_final.md`

## Remocoes logicas

Removidos da pagina `tarefas_minhasTarefasPage.tsx`:

- `useAssignmentExecution`
- `usePlanosAcao`
- `DrawerActionRouter`
- `EmbeddedReviewPanel`
- `DynamicFieldRenderer`
- `ExecutorPlanoAprovadorCard`
- consultas diretas a `operational_field_reviews`

## Validacao executada

- `npm.cmd run build`: passou.
- `rg` proibidos na pagina: sem resultados.
- `rg operational_field_reviews` em `src/modules/tarefas/fluxo` e pagina: sem resultados.
- `rg` RPCs antigas `_criar_plano_acao` no fluxo e pagina: sem resultados.
- `git diff --check`: sem erro.
