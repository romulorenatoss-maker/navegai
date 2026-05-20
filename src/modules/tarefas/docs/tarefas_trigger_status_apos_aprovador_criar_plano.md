# Trigger — tarefas_trigger_status_apos_aprovador_criar_plano

> **Módulo:** tarefas
> **Tipo:** Trigger (PL/pgSQL)
> **Migration:** `supabase/migrations/20260520180000_tarefas_planos_acao_separados_por_setor.sql`

---

## Quando dispara

`AFTER INSERT ON tarefas_planos_acao_aprovador FOR EACH ROW`

Quando uma nova linha é inserida em `tarefas_planos_acao_aprovador` (i.e., o aprovador acabou de criar um plano de ação para o executor).

## O que faz

Atualiza `operational_assignments.status` para `'devolvida'` (e atualiza `updated_at = now()`) somente se o status atual está em uma das transições válidas: `aguardando_aprovacao`, `em_andamento`, `aguardando_auditoria`.

Se o status já é `devolvida` ou outro estado não esperado, o trigger não faz nada (idempotente).

## Função associada

`public.tarefas_fn_trigger_apos_aprovador_criar_plano()`

## Efeitos

- `operational_assignments.status = 'devolvida'`
- `operational_assignments.updated_at = now()`

## Tabela afetada

- LÊ: nada
- ESCREVE: `operational_assignments`

## Lógica de proteção (idempotência)

```sql
WHERE id = NEW.assignment_id
  AND status IN ('aguardando_aprovacao', 'em_andamento', 'aguardando_auditoria')
```

Evita "voltar" a tarefa para devolvida se ela já está em estado final (concluida/aprovada/cancelada).

## Segurança

`SECURITY DEFINER`, `search_path = public`.

---

*Atualizado: 2026-05-20*
