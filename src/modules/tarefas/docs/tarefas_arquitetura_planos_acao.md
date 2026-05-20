# Arquitetura — Planos de ação SEPARADOS POR SETOR

> **Módulo:** tarefas
> **Tipo:** Arquitetura / Visão geral
> **Migration:** `supabase/migrations/20260520180000_tarefas_planos_acao_separados_por_setor.sql`

---

## Problema que esta arquitetura resolve

Antes deste refactor, **TODOS** os planos de ação (do aprovador para o executor, do auditor para o aprovador) ficavam na mesma tabela `operational_field_reviews`, identificados pela coluna `criado_por_papel`.

A sequência de rodada (R1, R2, R3...) era **compartilhada**. Resultado:

1. Aprovador devolve R1 → executor responde
2. Aprovador aprova → auditor
3. Auditor abre plano → cria `field_review` com rodada=2
4. Volta pro aprovador
5. Aprovador cria outro plano pro executor → cálculo retornava rodada=2 ❌ **COLISÃO**

Dois registros no mesmo `(assignment_id, field_id, rodada)`. Display fica confuso, executor não sabe qual plano responder, resposta vai pra chave errada.

---

## Solução

**2 tabelas dedicadas, cada uma com sua sequência R1/R2/R3 INDEPENDENTE:**

| Tabela | Quem cria | Quem responde |
|---|---|---|
| `tarefas_planos_acao_aprovador` | aprovador | executor |
| `tarefas_planos_acao_auditor` | auditor | aprovador |

Auditor e aprovador podem ter R1 simultâneo sem conflito — estão em tabelas diferentes.

---

## Fluxo de status (automatizado por trigger)

```
[em_andamento]
    │ executor envia
    ↓
[aguardando_aprovacao]
    │ aprovador cria plano (RPC tarefas_rpc_aprovador_criar_plano_acao)
    ↓                            (trigger: status → devolvida)
[devolvida]
    │ executor responde plano (RPC tarefas_rpc_executor_responder_plano_aprovador)
    ↓                            (trigger: status → aguardando_aprovacao)
[aguardando_aprovacao]
    │ aprovador aprova
    ↓
[aguardando_auditoria]
    │ auditor cria plano (RPC tarefas_rpc_auditor_criar_plano_acao)
    ↓                       (trigger: status → aguardando_aprovacao)
[aguardando_aprovacao]
    │ aprovador responde plano do auditor
    ↓                       (RPC tarefas_rpc_aprovador_responder_plano_auditor)
[aguardando_auditoria]      (trigger: status → aguardando_auditoria)
    │ auditor confirma
    ↓
[concluida]
```

---

## RPCs (4 — 1 por ação, Regra 4)

| RPC | Doc |
|---|---|
| `tarefas_rpc_aprovador_criar_plano_acao` | `tarefas_rpc_aprovador_criar_plano_acao.md` |
| `tarefas_rpc_executor_responder_plano_aprovador` | `tarefas_rpc_executor_responder_plano_aprovador.md` |
| `tarefas_rpc_auditor_criar_plano_acao` | `tarefas_rpc_auditor_criar_plano_acao.md` |
| `tarefas_rpc_aprovador_responder_plano_auditor` | `tarefas_rpc_aprovador_responder_plano_auditor.md` |

---

## Triggers (4 — 1 por responsabilidade)

| Trigger | Tabela | Quando | O que faz | Doc |
|---|---|---|---|---|
| `tarefas_trigger_status_apos_aprovador_criar_plano` | `tarefas_planos_acao_aprovador` | AFTER INSERT | status → devolvida | `tarefas_trigger_status_apos_aprovador_criar_plano.md` |
| `tarefas_trigger_status_apos_executor_responder_plano` | `tarefas_planos_acao_aprovador` | AFTER UPDATE respondido | status → aguardando_aprovacao | `tarefas_trigger_status_apos_executor_responder_plano.md` |
| `tarefas_trigger_status_apos_auditor_criar_plano` | `tarefas_planos_acao_auditor` | AFTER INSERT | status → aguardando_aprovacao | `tarefas_trigger_status_apos_auditor_criar_plano.md` |
| `tarefas_trigger_status_apos_aprovador_responder_plano_auditor` | `tarefas_planos_acao_auditor` | AFTER UPDATE respondido | status → aguardando_auditoria | `tarefas_trigger_status_apos_aprovador_responder_plano_auditor.md` |

---

## RLS (multi-tenant SaaS, Regra 4)

- **SELECT:** qualquer autenticado da mesma `tenant_id`
- **INSERT/UPDATE:** somente via RPC (policies bloqueiam writes diretos do frontend)
- **DELETE:** sem policy direta — usa `deleted_at` soft delete em RPC

---

## Por que NÃO mexer na operational_field_reviews

A tabela legada continua existindo e armazena devoluções "simples" (devolução de campo sem plano de ação estruturado). Os planos de ação NOVOS vão para as 2 tabelas dedicadas. Migração de dados antigos não é feita automaticamente — coexistência durante transição.

---

*Atualizado: 2026-05-20*
