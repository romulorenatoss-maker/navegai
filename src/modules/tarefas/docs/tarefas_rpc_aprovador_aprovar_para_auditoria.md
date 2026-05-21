# RPC — tarefas_rpc_aprovador_aprovar_para_auditoria

> **Módulo:** tarefas
> **Tipo:** RPC (PL/pgSQL)
> **Migration:** `supabase/migrations/20260521000000_rebuild_tarefas_fluxo_executor_aprovador_auditor.sql`

---

## Quando dispara

Aprovador termina a revisão e clica "Aprovar e enviar para auditoria".

## O que faz

1. Valida usuário autenticado
2. Status atual deve ser `aguardando_aprovacao`
3. **Bloqueio 1:** não permite aprovar se há plano do aprovador pendente (executor não respondeu)
4. **Bloqueio 2:** não permite aprovar se há plano do auditor pendente (aprovador não respondeu)
5. Muda status para `aguardando_auditoria`
6. Registra evento em `operational_audit_trail` com `dados_novos.notas` contendo `p_notas`

## Parâmetros

| Nome | Tipo | Notas |
|---|---|---|
| `p_assignment_id` | UUID | FK |
| `p_notas` | JSONB | Estrutura livre (decisão/observações do aprovador) |

## Retorno

```sql
TABLE (assignment_id UUID, novo_status TEXT)
```

## Erros possíveis

- `Aprovador só pode aprovar quando status = aguardando_aprovacao`
- `Existem N plano(s) do aprovador pendentes`
- `Existem N plano(s) do auditor pendentes`

---

*Atualizado: 2026-05-21*
