# Trigger — tarefas_trigger_status_apos_auditor_criar_plano

> **Módulo:** tarefas
> **Tipo:** Trigger (PL/pgSQL)
> **Migration:** `supabase/migrations/20260520180000_tarefas_planos_acao_separados_por_setor.sql`

---

## Quando dispara

`AFTER INSERT ON tarefas_planos_acao_auditor FOR EACH ROW`

Quando uma nova linha é inserida em `tarefas_planos_acao_auditor` (i.e., o auditor acabou de criar um plano de ação para o aprovador responder).

## O que faz

Atualiza `operational_assignments.status` para `'aguardando_aprovacao'` somente se o status atual está em: `aguardando_auditoria` ou `em_andamento`.

## Função associada

`public.tarefas_fn_trigger_apos_auditor_criar_plano()`

## Efeitos

- `operational_assignments.status = 'aguardando_aprovacao'`
- `operational_assignments.updated_at = now()`

## Tabela afetada

- LÊ: nada
- ESCREVE: `operational_assignments`

## Lógica de proteção

```sql
WHERE id = NEW.assignment_id
  AND status IN ('aguardando_auditoria', 'em_andamento')
```

Evita transições inesperadas se a tarefa já está em estado final.

## Observação

A tarefa volta pro aprovador para responder ao plano do auditor. **Não vai pro executor** — só o aprovador responde planos do auditor.

## Segurança

`SECURITY DEFINER`.

---

*Atualizado: 2026-05-20*
