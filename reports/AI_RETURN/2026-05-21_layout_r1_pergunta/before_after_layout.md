# Before / After - layout R1

## Antes

```text
[ Planos de acao aguardando sua resposta ]
  [ Plano R1 - pergunta Limpar vidros ]

[ Pergunta original - Limpar vidros ]
  resposta original / evidencia
```

Problema:
- O plano R1 aparecia separado no topo.
- A pergunta original ficava abaixo.
- O usuario via o plano como se fosse uma pergunta independente.
- O card read-only simplificado nao preservava todo o layout original da pergunta.

## Depois

```text
[ Pergunta original - Limpar vidros ]
  resposta original marcada
  evidencia/anexo original
  data/hora original
  badges/regras do renderer original
  read-only

  [ Plano de acao R1 ]
    instrucao do aprovador
    campos obrigatorios
    novo anexo
    botao responder plano
```

## Responsividade

O agrupamento usa:

```tsx
<div className="space-y-2 max-w-full">
  <DynamicFieldRenderer ... />
  <div className="space-y-2 pl-2 sm:pl-3 border-l-2 border-amber-300 max-w-full">
    <ExecutorPlanoAprovadorCard ... />
  </div>
</div>
```

Impacto esperado:
- Mobile continua empilhado verticalmente.
- O R1 fica visualmente subordinado a pergunta.
- Nao altera drawer/modal.
- Nao altera layout desktop fora do agrupamento.

## Validacao esperada no app

- Abrir `/tarefas/execucao` ou fluxo equivalente que usa `TarefasExecucaoPage`.
- Abrir tarefa com plano R1 pendente.
- Confirmar que a pergunta original aparece antes do plano.
- Confirmar que a resposta original esta marcada e read-only.
- Confirmar que evidencia/anexo original segue visivel.
- Confirmar que o card R1 aparece abaixo da pergunta correspondente.
- Confirmar que multiplos R1 da mesma pergunta ficam agrupados no mesmo bloco.
