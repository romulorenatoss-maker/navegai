# Diff real - layout R1 abaixo da pergunta original

Data: 2026-05-21

Escopo:
- Somente renderizacao visual/estrutura do painel executor.
- Sem SQL.
- Sem RPC.
- Sem rotas.
- Sem menu.
- Sem regra de aprovacao.
- Sem componente paralelo.

## Arquivo alterado

- `src/modules/tarefas/fluxo/components/tarefas_fluxoExecutorPanel.tsx`

## Antes

O painel do executor renderizava todos os planos pendentes do aprovador antes da lista de perguntas:

```tsx
{data.planosAprovadorPendentes.length > 0 && (
  <div>
    {data.planosAprovadorPendentes.map((p) => (
      <ExecutorPlanoAprovadorCard plano={p} />
    ))}
  </div>
)}

{data.perguntas.map((p) => (
  // pergunta original
))}
```

E quando a pergunta ficava read-only, era usado um card simplificado `ReadOnlyR0`, diferente do renderer original.

## Depois

Cada pergunta renderiza primeiro o `DynamicFieldRenderer` original, em modo editavel ou read-only conforme permissao/status. Os planos pendentes sao filtrados pelo `field_id` da pergunta e aparecem logo abaixo dela:

```tsx
{data.perguntas.map((pergunta) => {
  const planosPendentesDaPergunta = data.planosAprovadorPendentes.filter(
    (plano) => plano.field_id === pergunta.fieldId
  );

  return (
    <div>
      <DynamicFieldRenderer disabled={perguntaReadonly} lockOriginal={perguntaReadonly} />

      {planosPendentesDaPergunta.map((plano) => (
        <ExecutorPlanoAprovadorCard plano={plano} />
      ))}
    </div>
  );
})}
```

## Resultado estrutural

```text
[ Pergunta original - renderer oficial read-only ]
  - resposta original marcada
  - evidencia/anexo original
  - badges/regras originais

  [ Plano de acao R1 da mesma pergunta ]
    - instrucao do aprovador
    - itens obrigatorios
    - novo anexo
    - botao responder plano
```

## Observacoes

- `ReadOnlyR0` foi removido porque simplificava a pergunta e nao preservava exatamente o layout original.
- `DynamicFieldRenderer` foi reutilizado para manter resposta, evidencia, badges e estrutura visual da pergunta.
- `allAnswers` agora recebe respostas originais/rascunho por `fieldId`, evitando quebra de perguntas condicionais no modo read-only.
