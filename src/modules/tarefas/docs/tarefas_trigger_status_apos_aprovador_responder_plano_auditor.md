# Trigger — tarefas_trigger_status_apos_aprovador_responder_plano_auditor

> **Módulo:** tarefas
> **Tipo:** Trigger (PL/pgSQL)
> **Migration:** `supabase/migrations/20260520180000_tarefas_planos_acao_separados_por_setor.sql`

---

## Quando dispara

`AFTER UPDATE OF respondido ON tarefas_planos_acao_auditor FOR EACH ROW`

Quando a coluna `respondido` é atualizada em `tarefas_planos_acao_auditor` (i.e., o aprovador acabou de responder o plano do auditor).

## O que faz

Se `NEW.respondido = true` e `OLD.respondido != true`:

- Atualiza `operational_assignments.status = 'aguardando_auditoria'`
- Só executa se o status atual está em `'aguardando_aprovacao'`.

## Função associada

`public.tarefas_fn_trigger_apos_aprovador_responder_plano_auditor()`

## Efeitos

- `operational_assignments.status = 'aguardando_auditoria'`
- `operational_assignments.updated_at = now()`

## Tabela afetada

- LÊ: nada
- ESCREVE: `operational_assignments`

## Lógica de proteção

```sql
IF NEW.respondido = true AND (OLD.respondido IS DISTINCT FROM true) THEN
  UPDATE ... WHERE status IN ('aguardando_aprovacao');
END IF;
```

- Idempotente (só roda na primeira transição de pendente → respondido)
- Só transiciona se o assignment está em aguardando_aprovacao (caso contrário, deixa quieto)

## Próximo passo no fluxo

O auditor agora vê a resposta do aprovador e pode:
- Conformar → status = concluida (via outro fluxo)
- Não conformar → criar novo plano (outro INSERT em `tarefas_planos_acao_auditor`)

## Segurança

`SECURITY DEFINER`.

---

*Atualizado: 2026-05-20*
