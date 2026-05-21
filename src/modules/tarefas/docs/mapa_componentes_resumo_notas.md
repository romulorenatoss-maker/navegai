# Mapa de componentes - Resumo de Notas

## Entrada do aprovador

Arquivo: `src/modules/tarefas/fluxo/components/tarefas_fluxoAprovadorPanel.tsx`

- Botão principal: `Aprovar e ver resumo`.
- Abre `ResumoNotasModal` em modo `aprovador`.
- Botão final dentro do modal: `Enviar para auditoria`.
- Ação chamada no final: `actions.aprovarParaAuditoria.mutateAsync({ assignmentId, notas })`.

## Entrada do auditor

Arquivo: `src/modules/tarefas/fluxo/components/tarefas_fluxoAuditorPanel.tsx`

- Botão principal: `Concluir e ver resumo`.
- Abre `ResumoNotasModal` em modo `auditor`.
- Botão final dentro do modal: `Concluir auditoria`.
- Ação chamada no final: `actions.aprovarAuditoria.mutateAsync({ assignmentId, notas })`.

## Modal compartilhado

Arquivo: `src/modules/tarefas/fluxo/components/tarefas_resumoNotasModal.tsx`

- Lista perguntas automáticas.
- Lista perguntas manuais.
- Controla respostas manuais locais do modal.
- Valida justificativa obrigatória para N/A.
- Mostra destino da nota quando disponível.
- Mostra score existente ou pendência de backend.

## Card de pergunta

Arquivo: `src/modules/tarefas/fluxo/components/tarefas_resumoNotasPerguntaCard.tsx`

- Renderiza pergunta automática em modo leitura.
- Renderiza pergunta manual com campo de resposta.
- Renderiza N/A e justificativa.
- Exibe peso, desconto, ponto devolvido por N/A e fonte/pendência.

## Hook de orquestração

Arquivo: `src/modules/tarefas/fluxo/hooks/tarefas_useResumoNotas.ts`

- Lê configuração existente por `getPontuacaoConfig`.
- Usa pacotes `aprovador_pacote_padrao` e `validador_pacote_padrao`.
- Usa `template_snapshot` / `ada_config_snapshot` já carregados no fluxo.
- Não calcula nota final definitiva.
