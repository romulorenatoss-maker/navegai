# RESUMO EXECUTIVO

Limpeza cirurgica do fluxo de tarefas para remover hooks e paineis legados sem uso real no source.

Fonte oficial mantida: `src/modules/tarefas/fluxo/`.

Foram deletados quatro hooks legados e dois componentes legados orfaos. `tarefas_gestaoPage.tsx` deixou de usar `useApprovalFlow` e passou a usar `useAprovadorActions` para aprovacao.

`useTransition` nao foi deletado porque ainda possui consumidores reais em fluxos auxiliares e cards.
