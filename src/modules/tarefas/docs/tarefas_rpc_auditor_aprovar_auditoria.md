# RPC — tarefas_rpc_auditor_aprovar_auditoria

> **Módulo:** tarefas
> **Tipo:** RPC (PL/pgSQL)
> **Migration:** `supabase/migrations/20260521000000_rebuild_tarefas_fluxo_executor_aprovador_auditor.sql`

---

## Quando dispara

Auditor finaliza auditoria positiva e clica "Aprovar auditoria" / "Finalizar".

## O que faz

1. Valida usuário autenticado
2. Status deve ser `aguardando_auditoria`
3. **Bloqueio:** não permite finalizar se há plano do auditor pendente (aprovador ainda não respondeu)
4. Muda status para `concluida`
5. Marca `fim_em = COALESCE(fim_em, now())` e `auditor_fim_em = COALESCE(auditor_fim_em, now())`
6. Registra evento em `operational_audit_trail` com notas

## Parâmetros

| Nome | Tipo | Notas |
|---|---|---|
| `p_assignment_id` | UUID | FK |
| `p_notas` | JSONB | Estrutura livre |

## Retorno

```sql
TABLE (assignment_id UUID, novo_status TEXT)
```

## Erros possíveis

- `Auditor só pode aprovar em status aguardando_auditoria`
- `Existem N plano(s) do auditor pendentes`

---

*Atualizado: 2026-05-21*
