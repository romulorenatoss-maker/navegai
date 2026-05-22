# Diff real - modal de notas visual

## Escopo

Correcao cirurgica apenas no frontend do modulo Tarefas.

## Arquivos alterados

- `src/modules/tarefas/fluxo/components/tarefas_resumoNotasModal.tsx`
- `src/modules/tarefas/fluxo/components/tarefas_resumoNotasPerguntaCard.tsx`

## Alteracoes aplicadas

### `tarefas_resumoNotasPerguntaCard.tsx`

- Substituido o card resumido por um card visual por pergunta.
- Cada pergunta agora exibe:
  - titulo da pergunta;
  - status colorido;
  - peso;
  - pontos ganhos;
  - pontos perdidos;
  - pontos devolvidos por N/A;
  - justificativa de N/A quando existir;
  - resultado final da pergunta.
- Status visual:
  - verde: OK / ganhou ponto;
  - vermelho: perdeu ponto / desconto aplicado;
  - amarelo: N/A / ponto devolvido;
  - cinza: sem dados suficientes.

### `tarefas_resumoNotasModal.tsx`

- Removida a exibicao de texto de previa incompleta.
- Rodape passa a exibir:
  - nota final;
  - total possivel;
  - pontos ganhos;
  - pontos perdidos;
  - pontos devolvidos por N/A;
  - quantidade de perguntas sem dados;
  - destino da nota.
- Payload visual passa a incluir `resumo_totais`, sem alterar RPC ou backend.

## Nao alterado

- SQL.
- RPC.
- Migration.
- Trigger.
- RLS.
- Banco de dados.
- Fluxo R1/R2.
- Rotas.
- Permissoes.

