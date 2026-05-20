# RPC — tarefas_rpc_aprovador_criar_plano_acao

> **Módulo:** tarefas
> **Tipo:** RPC (PL/pgSQL)
> **Migration:** `supabase/migrations/20260520180000_tarefas_planos_acao_separados_por_setor.sql`

---

## Quando dispara

Quando o **APROVADOR** decide criar um plano de ação para o **EXECUTOR** responder em uma pergunta específica. Geralmente após o aprovador marcar "Não Conforme" e selecionar "Criar plano de ação".

## O que faz

1. Valida usuário autenticado (`auth.uid()` → `profiles.id`)
2. Calcula próxima `rodada` = `MAX(rodada) WHERE (assignment_id, field_id) + 1` na tabela `tarefas_planos_acao_aprovador` (independente do auditor)
3. INSERT em `tarefas_planos_acao_aprovador` com `respondido=false`
4. Trigger `tarefas_trigger_status_apos_aprovador_criar_plano` automaticamente muda status do assignment para `devolvida`

## Parâmetros

| Nome | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `p_assignment_id` | UUID | sim | FK `operational_assignments.id` |
| `p_field_id` | UUID | sim | Pergunta do checklist |
| `p_instrucao` | TEXT | não | Instrução geral |
| `p_itens_plano` | JSONB | sim | `[{tipo, titulo, obrigatorio}]` |
| `p_prazo_resolucao` | TIMESTAMPTZ | sim | Prazo do executor responder |
| `p_criticidade` | TEXT | não (default 'media') | baixa / media / alta |

## Retorno

Linha inserida em `tarefas_planos_acao_aprovador`.

## Efeitos colaterais

- Linha inserida em `tarefas_planos_acao_aprovador`
- Via trigger: `operational_assignments.status = 'devolvida'` (se estava em aguardando_aprovacao/em_andamento/aguardando_auditoria)

## Tabela afetada

`tarefas_planos_acao_aprovador`

## Erros possíveis

- `Não autenticado` — `auth.uid()` não casa com nenhum `profiles.user_id`
- Constraint UNIQUE violado — raro (concorrência simultânea)

## Segurança

`SECURITY DEFINER` — RPC roda com privilégios do dono (bypass RLS). `search_path = public` para evitar shadowing.

## Exemplo de uso (frontend)

```ts
const { data, error } = await supabase.rpc("tarefas_rpc_aprovador_criar_plano_acao", {
  p_assignment_id: assignmentId,
  p_field_id: fieldId,
  p_instrucao: "Refazer limpeza dos vidros",
  p_itens_plano: [
    { tipo: "foto", titulo: "Foto após limpeza", obrigatorio: true }
  ],
  p_prazo_resolucao: "2026-05-21T18:00:00Z",
  p_criticidade: "media",
});
```

---

*Atualizado: 2026-05-20*
