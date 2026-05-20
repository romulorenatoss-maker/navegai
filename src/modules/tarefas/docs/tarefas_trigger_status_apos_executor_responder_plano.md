# Trigger — tarefas_trigger_status_apos_executor_responder_plano

> **Módulo:** tarefas
> **Tipo:** Trigger (PL/pgSQL)
> **Migration:** `supabase/migrations/20260520180000_tarefas_planos_acao_separados_por_setor.sql`

---

## Quando dispara

`AFTER UPDATE OF respondido ON tarefas_planos_acao_aprovador FOR EACH ROW`

Quando a coluna `respondido` é atualizada em `tarefas_planos_acao_aprovador` (i.e., o executor acabou de responder o plano).

## O que faz

Se `NEW.respondido = true` e `OLD.respondido != true` (transição de pendente → respondido):

- Atualiza `operational_assignments.status = 'aguardando_aprovacao'`
- Só executa se o status atual está em `'devolvida'` ou `'em_andamento'`.

## Função associada

`public.tarefas_fn_trigger_apos_executor_responder_plano()`

## Efeitos

- `operational_assignments.status = 'aguardando_aprovacao'`
- `operational_assignments.updated_at = now()`

## Tabela afetada

- LÊ: nada
- ESCREVE: `operational_assignments`

## Lógica de proteção

```sql
IF NEW.respondido = true AND (OLD.respondido IS DISTINCT FROM true) THEN
  UPDATE ... WHERE status IN ('devolvida', 'em_andamento');
END IF;
```

Garante:
- Só dispara na PRIMEIRA vez que `respondido` vira `true` (não em updates subsequentes)
- Só muda status se faz sentido (não sobrescreve estados finais)

## Observação importante

**Múltiplos planos pendentes:** se há vários planos do aprovador pendentes no mesmo assignment, o trigger dispara a cada UPDATE. O status pode oscilar enquanto o executor responde um plano de cada vez. Comportamento esperado: depois do último plano respondido, o status fica em `aguardando_aprovacao`.

## Segurança

`SECURITY DEFINER`.

---

*Atualizado: 2026-05-20*
