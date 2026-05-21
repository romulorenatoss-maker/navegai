# RPC — tarefas_rpc_auditor_criar_plano_aprovador

> **Módulo:** tarefas
> **Tipo:** RPC (PL/pgSQL)
> **Migration:** `supabase/migrations/20260521000000_rebuild_tarefas_fluxo_executor_aprovador_auditor.sql`
>
> **Renomeada de:** `tarefas_rpc_auditor_criar_plano_acao` (legacy, deprecated em 20260521).

---

## Quando dispara

Auditor identifica não-conformidade no trabalho do aprovador e cria plano para ele responder.

## O que faz

1. Valida usuário autenticado
2. Status deve ser `aguardando_auditoria`
3. Calcula próxima rodada (independente do aprovador)
4. INSERT em `tarefas_planos_acao_auditor`
5. Muda status para `aguardando_aprovacao` (vai pro aprovador)
6. Registra log

## Parâmetros

Mesma assinatura de `tarefas_rpc_aprovador_criar_plano_executor`:
- `p_assignment_id`, `p_field_id`, `p_instrucao`, `p_itens_plano`, `p_prazo_resolucao`, `p_criticidade`

## Retorno

Linha completa de `tarefas_planos_acao_auditor`.

## Erros possíveis

- `Auditor só pode criar plano em status aguardando_auditoria`

---

*Atualizado: 2026-05-21*
