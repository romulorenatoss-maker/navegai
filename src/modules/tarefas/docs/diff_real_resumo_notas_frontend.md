# Diff real - Resumo de Notas frontend

Escopo executado somente no módulo Tarefas.

Arquivos alterados:
- `src/modules/tarefas/fluxo/components/tarefas_fluxoAprovadorPanel.tsx`
- `src/modules/tarefas/fluxo/components/tarefas_fluxoAuditorPanel.tsx`

Arquivos criados:
- `src/modules/tarefas/fluxo/hooks/tarefas_useResumoNotas.ts`
- `src/modules/tarefas/fluxo/components/tarefas_resumoNotasModal.tsx`
- `src/modules/tarefas/fluxo/components/tarefas_resumoNotasPerguntaCard.tsx`

Mudanças:
- Botão do aprovador passou de envio direto para `Aprovar e ver resumo`.
- Botão do auditor passou de conclusão direta para `Concluir e ver resumo`.
- O envio/conclusão final agora ocorre somente dentro do modal.
- O modal monta perguntas automáticas e manuais usando configuração/snapshot já existentes.
- N/A em pergunta manual exige justificativa antes do botão final.
- Payload visual `notas` é enviado para as RPCs já existentes, sem alterar SQL/RPC.

Não alterado:
- Banco.
- Migration.
- RPC.
- Trigger.
- RLS.
- Regras críticas de score.
- Fluxo R1/R2.
