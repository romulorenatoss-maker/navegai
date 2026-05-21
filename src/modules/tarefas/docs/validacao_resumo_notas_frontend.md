# Validação - Resumo de Notas frontend

Checklist lógico aplicado:

- [x] Botão direto do aprovador não chama mais envio imediato.
- [x] Aprovador abre modal por `Aprovar e ver resumo`.
- [x] Botão final `Enviar para auditoria` fica dentro do modal.
- [x] Auditor não chama conclusão imediata.
- [x] Auditor abre modal por `Concluir e ver resumo`.
- [x] Botão final `Concluir auditoria` fica dentro do modal.
- [x] N/A em pergunta manual exige justificativa.
- [x] Perguntas automáticas são exibidas sem cálculo crítico no frontend.
- [x] Perguntas manuais são exibidas com preenchimento local.
- [x] Destino da nota é exibido quando mapeável.
- [x] Fluxo R1/R2 não foi alterado.
- [x] Nenhuma migration criada.
- [x] Nenhum SQL/RPC/trigger/RLS alterado.

Validação local:

- `git diff --check`: OK.
- `npm run build`: não executado nesta máquina porque `npm` não está instalado/reconhecido.

Validação visual pendente:

- Abrir como aprovador e testar o modal.
- Abrir como auditor e testar o modal.
- Confirmar no Lovable se `p_notas` está sendo persistido/interpretrado pelo backend.
