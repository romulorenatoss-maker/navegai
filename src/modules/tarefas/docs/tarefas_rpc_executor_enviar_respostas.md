# RPC — tarefas_rpc_executor_enviar_respostas

> **Módulo:** tarefas
> **Tipo:** RPC (PL/pgSQL)
> **Migration:** `supabase/migrations/20260521000000_rebuild_tarefas_fluxo_executor_aprovador_auditor.sql`

---

## Quando dispara

Executor finalizou o preenchimento das perguntas e clica em "Enviar para Avaliação". A tela do executor envia todas as respostas atuais em batch.

## O que faz

1. Valida usuário autenticado
2. Lê status atual da tarefa — só aceita envio em `pendente`/`em_andamento`/`devolvida`
3. Para cada elemento em `p_respostas`: UPSERT em `operational_field_answers` (chave: `assignment_id, field_id`)
4. Muda status para `aguardando_aprovacao`
5. Marca `fim_em = now()` se ainda nulo
6. Registra log `executor_enviou_respostas` em `operational_execution_logs`

## Parâmetros

| Nome | Tipo | Notas |
|---|---|---|
| `p_assignment_id` | UUID | FK `operational_assignments.id` |
| `p_respostas` | JSONB | Array de respostas: `[{field_id, valor_booleano?, valor_texto?, valor_numero?, valor_json?, evidencia_url?, evidencia_anexo_id?, evidencia_mime_type?, observacao?}]` |

## Retorno

```sql
TABLE (assignment_id UUID, novo_status TEXT, respostas_salvas INT)
```

## Efeitos

- N rows em `operational_field_answers` (upsert)
- `operational_assignments.status = 'aguardando_aprovacao'`
- 1 row em `operational_execution_logs`

## Erros possíveis

- `Não autenticado`
- `Tarefa X não encontrada`
- `Tarefa em status X não aceita envio do executor`

## Segurança

`SECURITY DEFINER`, `search_path = public`.

---

*Atualizado: 2026-05-21*
