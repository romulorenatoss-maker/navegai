# ULTIMA ALTERACAO CODEX

Data: 2026-05-21

## Objetivo

Executar o comando `comando_codex_rebuild_fluxo_tarefas_executor_aprovador_auditor.md` para corrigir bugs do fluxo de tarefas sem criar tela paralela, mantendo `/tarefas/minhas` como ponto oficial.

## Arquivos alterados

- `src/modules/tarefas/pages/tarefas_minhasTarefasPage.tsx`
- `src/modules/tarefas/fluxo/services/tarefas_fluxoStatusMachine.ts`
- `src/modules/tarefas/fluxo/hooks/tarefas_useFluxoTarefa.ts`

## Arquivos criados

- `supabase/migrations/20260521003000_tarefas_bloquear_reenvio_r0_fluxo.sql`
- `docs/backups/tarefas_fluxo_rebuild_pre_backup.md`
- `docs/backups/tarefas_fluxo_rebuild_pre_tree.txt`
- `docs/diff_tarefas_fluxo_rebuild_final.md`
- `docs/manifest_tarefas_fluxo_rebuild_final.json`
- `docs/rollback_tarefas_fluxo_rebuild_final.sql`
- `docs/tarefas_fluxo_validacao_final.md`

## Banco/RPC/Trigger impactados

- RPC alterada por migration nova: `tarefas_rpc_executor_enviar_respostas`.
- Tabelas lidas/escritas pela RPC: `operational_assignments`, `operational_field_answers`, `operational_execution_logs`, `colaborador_setores`.
- Triggers: nenhuma trigger criada ou alterada.

## Diff real

- `tarefas_minhasTarefasPage.tsx`: removeu roteamento legado direto e passou a renderizar `FluxoExecutorPanel`, `FluxoAprovadorPanel` e `FluxoAuditorPanel` conforme papel/status.
- `tarefas_fluxoStatusMachine.ts`: bloqueou envio R0 em `devolvida`; executor em devolucao deve responder plano pela RPC propria.
- `tarefas_useFluxoTarefa.ts`: removeu mencao literal a tabela legada no comentario do fluxo oficial.
- Migration nova: impede overwrite de R0, valida permissao do executor/setor/admin e trava a linha da tarefa com `FOR UPDATE`.

## Validacao feita

- `npm.cmd run build`: sucesso.
- `git diff --check`: sucesso.
- Busca por `operational_field_reviews` em `src/modules/tarefas/fluxo` e `tarefas_minhasTarefasPage.tsx`: sem resultados.
- Busca por `useAssignmentExecution`, `usePlanosAcao`, `DrawerActionRouter`, `EmbeddedReviewPanel`, `DynamicFieldRenderer`, `ExecutorPlanoAprovadorCard` na pagina oficial: sem resultados.
- Busca por RPCs antigas `_criar_plano_acao` no fluxo e pagina: sem resultados.

## Rollback sugerido

- Reverter o commit da alteracao.
- Para banco, executar `docs/rollback_tarefas_fluxo_rebuild_final.sql` se a migration `20260521003000_tarefas_bloquear_reenvio_r0_fluxo.sql` ja tiver sido aplicada.

## Pendencias

- Aplicar a migration no Supabase/Lovable.
- Rodar o checklist manual `docs/tarefas_fluxo_validacao_final.md` no preview Lovable com usuarios de executor, aprovador e auditor.
