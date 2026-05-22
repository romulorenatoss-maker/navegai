# Mapa de calculo por pergunta - Resumo de Notas

## Fonte reutilizada

O modal continua usando:

- `useResumoNotas`;
- `calcularRespostaAutomatica`;
- dados ja carregados no fluxo de tarefas.

Nao foi criado calculo definitivo em backend novo e nao foi alterada nenhuma RPC.

## Pergunta automatica OK

Condicao:

- `descontoAplicado = 0`;
- `metricaPendente = false`.

Visual:

- bloco verde;
- label `OK`;
- nota = `peso` pontos;
- desconto = `0`.

## Pergunta automatica com perda

Condicao:

- `descontoAplicado > 0`;
- `metricaPendente = false`.

Visual:

- bloco vermelho;
- label `Perdeu ponto`;
- nota = `peso - descontoAplicado`;
- desconto exibido em pontos.

## Pergunta automatica sem dado

Condicao:

- `descontoAplicado = null`; ou
- `metricaPendente = true`.

Visual:

- bloco cinza;
- label `Sem dados`;
- nota = `0`;
- exibe fonte/dado faltante.

## Pergunta manual OK

Condicao:

- usuario marca OK.

Visual:

- bloco verde;
- nota = `peso` pontos.

## Pergunta manual Nao OK

Condicao:

- usuario marca Nao OK.

Visual:

- bloco vermelho;
- nota = `0`;
- desconto = `peso`.

## Pergunta N/A

Condicao:

- usuario marca N/A;
- justificativa preenchida.

Visual:

- bloco amarelo;
- nota = `pontoDevolvidoNa`;
- ponto devolvido por N/A exibido no bloco;
- justificativa exibida.

## Nota final

O card final soma:

- pontos possiveis;
- pontos ganhos;
- pontos perdidos;
- pontos devolvidos por N/A.

Se existir nota gravada no fluxo (`score_aprovacao`, `score_aprovador` ou `score_auditor`), ela continua sendo exibida como nota final. Caso contrario, o modal mostra a soma visual calculada a partir das perguntas carregadas.

## Campos legados proibidos

Nao foram usados:

- `avaliador_fim_em`;
- `avaliador_inicio_em`;
- `finalizado_em`;
- `aprovador_inicio_em`;
- `aprovador_fim_em`.

