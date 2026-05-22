# Mapa de calculo por pergunta - Resumo de Notas

## Fonte do calculo reutilizado

O modal continua consumindo `useResumoNotas`, que monta perguntas automaticas e manuais a partir do fluxo ja carregado.

As perguntas automaticas continuam usando:

- `src/modules/tarefas/fluxo/services/tarefas_resumoNotasCalculoService.ts`
- funcao `calcularRespostaAutomatica`

As perguntas manuais continuam sendo preenchidas no modal e enviadas no payload existente do fluxo visual.

## Regra visual por pergunta

### Pergunta automatica calculavel sem desconto

- `descontoAplicado = 0`
- status: verde
- pontos ganhos: `peso`
- pontos perdidos: `0`
- resultado final: `peso/peso`

### Pergunta automatica calculavel com desconto

- `descontoAplicado > 0`
- status: vermelho
- pontos ganhos: `peso - descontoAplicado`
- pontos perdidos: `descontoAplicado`
- resultado final: `(peso - descontoAplicado)/peso`

### Pergunta automatica sem dado suficiente

- `descontoAplicado = null` ou `metricaPendente = true`
- status: cinza
- pontos ganhos: `0`
- pontos perdidos: `0`
- resultado final: `0/peso`
- exibe a fonte/dado faltante informado pela pergunta.

### Pergunta manual OK

- usuario marca OK.
- status: verde.
- pontos ganhos: `peso`.
- pontos perdidos: `0`.
- resultado final: `peso/peso`.

### Pergunta manual Nao OK

- usuario marca Nao OK.
- status: vermelho.
- pontos ganhos: `0`.
- pontos perdidos: `peso`.
- resultado final: `0/peso`.

### Pergunta manual N/A

- usuario marca N/A.
- justificativa obrigatoria.
- status: amarelo.
- pontos ganhos: `pontoDevolvidoNa`.
- pontos devolvidos por N/A: `pontoDevolvidoNa`.
- pontos perdidos: `0`.
- resultado final: `pontoDevolvidoNa/peso`.

## Rodape do modal

O rodape soma:

- pontos possiveis;
- pontos ganhos;
- descontos;
- pontos devolvidos por N/A;
- perguntas automaticas sem dados suficientes.

O texto `pendente backend` e `previa manual incompleta` nao e usado no modal.

## Campos legados proibidos

Nao foram usados:

- `avaliador_fim_em`
- `avaliador_inicio_em`
- `finalizado_em`
- `aprovador_inicio_em`
- `aprovador_fim_em`

