# RPC — tarefas_rpc_aprovador_criar_plano_executor

> **Módulo:** tarefas
> **Tipo:** RPC (PL/pgSQL)
> **Migration:** `supabase/migrations/20260521000000_rebuild_tarefas_fluxo_executor_aprovador_auditor.sql`
>
> **Renomeada de:** `tarefas_rpc_aprovador_criar_plano_acao` (legacy, deprecated em 20260521).

---

## Quando dispara

Aprovador identifica que uma pergunta não está conforme e decide criar um plano de ação para o executor refazer/anexar mais detalhes.

## O que faz

1. Valida usuário autenticado
2. Verifica status atual: só permite em `aguardando_aprovacao` ou `em_andamento`
3. **Gate de plano do auditor pendente:** se há plano do auditor pendente em alguma pergunta, o aprovador SÓ pode criar plano para executor na pergunta liberada pelo auditor (mesmo `field_id`).
4. Calcula próxima rodada (independente dos planos do auditor): `MAX(rodada) WHERE assignment_id + field_id + 1`
5. INSERT em `tarefas_planos_acao_aprovador`
6. Muda status para `devolvida`
7. Registra log

## Parâmetros

| Nome | Tipo | Notas |
|---|---|---|
| `p_assignment_id` | UUID | FK |
| `p_field_id` | UUID | Pergunta |
| `p_instrucao` | TEXT | Instrução geral |
| `p_itens_plano` | JSONB | `[{tipo, titulo, obrigatorio}]` |
| `p_prazo_resolucao` | TIMESTAMPTZ | |
| `p_criticidade` | TEXT (default 'media') | baixa/media/alta |

## Retorno

Linha completa de `tarefas_planos_acao_aprovador`.

## Erros possíveis

- `Não autenticado`
- `Tarefa X não encontrada`
- `Aprovador não pode criar plano de executor em status X`
- `Há planos pendentes do auditor — aprovador só pode criar plano para executor em perguntas liberadas pelo auditor`

---

*Atualizado: 2026-05-21*
