# RPC — tarefas_rpc_aprovador_responder_plano_auditor

> **Módulo:** tarefas
> **Tipo:** RPC (PL/pgSQL)
> **Migration:** `supabase/migrations/20260520180000_tarefas_planos_acao_separados_por_setor.sql`

---

## Quando dispara

Quando o **APROVADOR** termina de responder ao plano de ação aberto pelo auditor.

## O que faz

1. Valida usuário autenticado
2. UPDATE em `tarefas_planos_acao_auditor`:
   - `respondido = true`
   - `respondido_em = now()`
   - `respondido_por = profile.id`
   - `resposta_valor_json = p_resposta_valor_json`
3. Trigger `tarefas_trigger_status_apos_aprovador_responder_plano_auditor` muda status para `aguardando_auditoria`

## Parâmetros

| Nome | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `p_plano_id` | UUID | sim | `tarefas_planos_acao_auditor.id` |
| `p_resposta_valor_json` | JSONB | sim | Resposta do aprovador |

## Retorno

Linha atualizada.

## Efeitos colaterais

- `respondido=true`
- Via trigger: status → `aguardando_auditoria` (se estava em aguardando_aprovacao)

## Tabela afetada

`tarefas_planos_acao_auditor`

## Erros possíveis

- `Não autenticado`
- `Plano não encontrado ou já excluído: {id}`

## Segurança

`SECURITY DEFINER`.

## Exemplo de uso

```ts
const { data, error } = await supabase.rpc("tarefas_rpc_aprovador_responder_plano_auditor", {
  p_plano_id: planoId,
  p_resposta_valor_json: {
    texto: { valor_texto: "Conferi pessoalmente os 4 ambientes." },
    foto: {
      evidencia_url: "anexos/conferencia.jpg",
      evidencia_anexo_id: "uuid",
      evidencia_mime_type: "image/jpeg",
    },
  },
});
```

---

*Atualizado: 2026-05-20*
