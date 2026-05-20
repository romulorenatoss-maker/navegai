# RPC — tarefas_rpc_auditor_criar_plano_acao

> **Módulo:** tarefas
> **Tipo:** RPC (PL/pgSQL)
> **Migration:** `supabase/migrations/20260520180000_tarefas_planos_acao_separados_por_setor.sql`

---

## Quando dispara

Quando o **AUDITOR**, ao revisar o trabalho do aprovador, decide criar um plano de ação para o **APROVADOR** responder.

## O que faz

1. Valida usuário autenticado
2. Calcula próxima `rodada` (independente do aprovador — usa MAX da tabela do auditor)
3. INSERT em `tarefas_planos_acao_auditor`
4. Trigger `tarefas_trigger_status_apos_auditor_criar_plano` muda status para `aguardando_aprovacao`

## Parâmetros

| Nome | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `p_assignment_id` | UUID | sim | |
| `p_field_id` | UUID | sim | Pergunta sobre a qual o auditor quer mais info |
| `p_instrucao` | TEXT | não | |
| `p_itens_plano` | JSONB | sim | `[{tipo, titulo, obrigatorio}]` |
| `p_prazo_resolucao` | TIMESTAMPTZ | sim | Prazo do aprovador responder |
| `p_criticidade` | TEXT | não (default 'media') | |

## Retorno

Linha inserida em `tarefas_planos_acao_auditor`.

## Efeitos colaterais

- Linha inserida em `tarefas_planos_acao_auditor`
- Via trigger: status → `aguardando_aprovacao` (se estava em aguardando_auditoria/em_andamento)

## Tabela afetada

`tarefas_planos_acao_auditor`

## Segurança

`SECURITY DEFINER`.

## Exemplo de uso

```ts
const { data, error } = await supabase.rpc("tarefas_rpc_auditor_criar_plano_acao", {
  p_assignment_id: assignmentId,
  p_field_id: fieldId,
  p_instrucao: "Verificar se aprovador conferiu pessoalmente",
  p_itens_plano: [
    { tipo: "texto", titulo: "Detalhe da conferência", obrigatorio: true },
    { tipo: "foto", titulo: "Foto de comprovação", obrigatorio: true },
  ],
  p_prazo_resolucao: "2026-05-21T18:00:00Z",
  p_criticidade: "alta",
});
```

---

*Atualizado: 2026-05-20*
