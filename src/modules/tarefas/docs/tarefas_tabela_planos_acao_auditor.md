# Tabela — tarefas_planos_acao_auditor

> **Módulo:** tarefas
> **Tipo:** Tabela (schema)
> **Migration:** `supabase/migrations/20260520180000_tarefas_planos_acao_separados_por_setor.sql`

---

## Propósito

Armazena planos de ação criados pelo **AUDITOR** para o **APROVADOR** responder. Sequência de rodada (R1, R2, R3...) **INDEPENDENTE** da tabela `tarefas_planos_acao_aprovador`.

---

## Schema

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `assignment_id` | UUID NOT NULL | FK `operational_assignments.id` ON DELETE CASCADE |
| `field_id` | UUID NOT NULL | Pergunta do checklist |
| `rodada` | INT NOT NULL CHECK ≥ 1 | Sequência por (assignment, field) — INDEPENDENTE do aprovador |
| `instrucao` | TEXT | Instrução geral do plano |
| `itens_plano` | JSONB DEFAULT `[]` | `[{tipo, titulo, obrigatorio}]` |
| `prazo_resolucao` | TIMESTAMPTZ | Quando aprovador deve responder |
| `criticidade` | TEXT CHECK (baixa/media/alta) | |
| `criado_em` | TIMESTAMPTZ DEFAULT now() | Auditoria |
| `criado_por` | UUID | FK `profiles.id` (auditor) |
| `respondido` | BOOLEAN DEFAULT false | Flag de resposta |
| `respondido_em` | TIMESTAMPTZ | Quando aprovador respondeu |
| `respondido_por` | UUID | FK `profiles.id` (aprovador) |
| `resposta_valor_json` | JSONB | Resposta do aprovador |
| `tenant_id` | UUID | Multi-tenant (RLS) |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

---

## Índices

- `idx_tarefas_planos_audit_assignment` em `(assignment_id)`
- `idx_tarefas_planos_audit_field` em `(assignment_id, field_id)`
- `idx_tarefas_planos_audit_pendentes` em `(assignment_id)` WHERE `respondido=false`

## Constraints

- UNIQUE `(assignment_id, field_id, rodada)` — impede colisão dentro do setor do auditor

---

## RPCs que escrevem nesta tabela

- INSERT: `tarefas_rpc_auditor_criar_plano_acao`
- UPDATE: `tarefas_rpc_aprovador_responder_plano_auditor`

## Triggers associados

- `tarefas_trigger_status_apos_auditor_criar_plano` — AFTER INSERT
- `tarefas_trigger_status_apos_aprovador_responder_plano_auditor` — AFTER UPDATE respondido

---

*Atualizado: 2026-05-20*
