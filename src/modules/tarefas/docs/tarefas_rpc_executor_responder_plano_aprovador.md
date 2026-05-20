# RPC — tarefas_rpc_executor_responder_plano_aprovador

> **Módulo:** tarefas
> **Tipo:** RPC (PL/pgSQL)
> **Migration:** `supabase/migrations/20260520180000_tarefas_planos_acao_separados_por_setor.sql`

---

## Quando dispara

Quando o **EXECUTOR** termina de responder um plano de ação aberto pelo aprovador.

## O que faz

1. Valida usuário autenticado
2. UPDATE em `tarefas_planos_acao_aprovador`:
   - `respondido = true`
   - `respondido_em = now()`
   - `respondido_por = profile.id`
   - `resposta_valor_json = p_resposta_valor_json`
3. Trigger `tarefas_trigger_status_apos_executor_responder_plano` muda status para `aguardando_aprovacao`

## Parâmetros

| Nome | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `p_plano_id` | UUID | sim | `tarefas_planos_acao_aprovador.id` |
| `p_resposta_valor_json` | JSONB | sim | `{foto: {evidencia_url, evidencia_anexo_id, evidencia_mime_type}, texto: {valor_texto}, ...}` |

## Retorno

Linha atualizada em `tarefas_planos_acao_aprovador`.

## Efeitos colaterais

- Linha atualizada (`respondido=true`)
- Via trigger: status → `aguardando_aprovacao` (se estava em devolvida/em_andamento)

## Tabela afetada

`tarefas_planos_acao_aprovador`

## Erros possíveis

- `Não autenticado`
- `Plano não encontrado ou já excluído: {id}` — plano com deleted_at ou ID inválido

## Segurança

`SECURITY DEFINER`.

## Exemplo de uso

```ts
const { data, error } = await supabase.rpc("tarefas_rpc_executor_responder_plano_aprovador", {
  p_plano_id: planoId,
  p_resposta_valor_json: {
    foto: {
      evidencia_url: "anexos/abc.jpg",
      evidencia_anexo_id: "uuid-aqui",
      evidencia_mime_type: "image/jpeg",
    },
    texto: { valor_texto: "Refeito conforme solicitado." },
  },
});
```

---

*Atualizado: 2026-05-20*
