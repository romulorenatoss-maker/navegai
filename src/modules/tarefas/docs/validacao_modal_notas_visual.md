# Validacao - modal de notas visual

## Validacoes de codigo

- `rg "Pendente backend|pendente backend|preveia manual|previa manual|incompleta|avaliador_fim_em|finalizado_em|aprovador_inicio_em|aprovador_fim_em|avaliador_inicio_em" src/modules/tarefas/fluxo/components src/modules/tarefas/fluxo/hooks src/modules/tarefas/fluxo/services src/modules/tarefas/services/tarefas_pontuacao_config_service.ts`
  - Resultado esperado: zero ocorrencias funcionais no modal/hook/service do resumo.

- `git diff --check`
  - Resultado esperado: sem erro de whitespace.

## Validacao visual esperada

### Por pergunta

- Pergunta OK aparece verde.
- Pergunta com desconto aparece vermelha.
- Pergunta N/A aparece amarela e exige justificativa.
- Pergunta sem dado suficiente aparece cinza e mostra fonte/dado faltante.
- Cada pergunta mostra peso, pontos ganhos, desconto, devolucao N/A e resultado final.

### Rodape

- Exibe nota final no formato `pontos/total`.
- Exibe total possivel.
- Exibe pontos ganhos.
- Exibe pontos perdidos.
- Exibe pontos devolvidos por N/A.
- Exibe quantidade de perguntas sem dados.
- Exibe para quem a nota sera lancada.

## Validacao de restricoes

- Nao foi criado SQL.
- Nao foi criada migration.
- Nao foi alterada RPC.
- Nao foi alterado trigger.
- Nao foi alterado RLS.
- Nao foi alterado banco.
- Nao foi alterado modulo fora de Tarefas.

