# Checklist de validacao final - tarefas fluxo

Data: 2026-05-21
Modulo: `tarefas`

## Validacao automatica executada

- [x] `npm.cmd run build`
- [x] `git diff --check`
- [x] Busca por `operational_field_reviews` em `src/modules/tarefas/fluxo` e `tarefas_minhasTarefasPage.tsx`: sem resultados.
- [x] Busca por hooks/componentes legados no drawer oficial: sem resultados na pagina.
- [x] Busca por RPCs antigas `_criar_plano_acao` no fluxo e pagina: sem resultados.

## Checklist funcional para Lovable

- [ ] Abrir `/tarefas/minhas`.
- [ ] Como executor, abrir tarefa `pendente` ou `em_andamento` e confirmar render de `FluxoExecutorPanel`.
- [ ] Enviar R0 e confirmar status `aguardando_aprovacao`.
- [ ] Tentar reenviar R0 apos status sair de execucao inicial e confirmar bloqueio da RPC.
- [ ] Como aprovador, abrir tarefa `aguardando_aprovacao` e confirmar render de `FluxoAprovadorPanel`.
- [ ] Criar plano para executor e confirmar status/pendencia.
- [ ] Como executor, responder plano devolvido sem editar R0 original.
- [ ] Como aprovador, aprovar para auditoria somente sem plano pendente.
- [ ] Como auditor, abrir tarefa `aguardando_auditoria` e confirmar render de `FluxoAuditorPanel`.
- [ ] Auditor aprovar auditoria e confirmar fechamento.
- [ ] Auditor criar plano para aprovador e confirmar retorno ao aprovador.
- [ ] Abrir tarefa contingenciada e confirmar que `EmbeddedContingencyPanel` continua disponivel como fluxo auxiliar.
- [ ] Abrir tarefa `aguardando_validacao` criada pelo usuario e confirmar botoes `Devolver` e `Aprovar Recebimento`.

## Evidencias tecnicas

- A pagina `tarefas_minhasTarefasPage.tsx` nao usa mais `DrawerActionRouter` para executor/aprovador/auditor.
- A pagina nao usa mais `useAssignmentExecution` nem `usePlanosAcao`.
- O fluxo oficial nao consulta a tabela legada de revisoes por campo.
- A RPC `tarefas_rpc_executor_enviar_respostas` passou a bloquear overwrite da R0.
