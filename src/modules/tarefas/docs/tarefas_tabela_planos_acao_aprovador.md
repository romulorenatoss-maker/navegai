# Tabela — tarefas_planos_acao_aprovador

> **Módulo:** tarefas
> **Tipo:** Tabela (schema)
> **Migration:** `supabase/migrations/20260520180000_tarefas_planos_acao_separados_por_setor.sql`

---

## Propósito

Armazena planos de ação criados pelo **APROVADOR** para o **EXECUTOR** responder. Sequência de rodada (R1, R2, R3...) **INDEPENDENTE** da tabela `tarefas_planos_acao_auditor`.

---

## Schema

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `assignment_id` | UUID NOT NULL | FK `operational_assignments.id` ON DELETE CASCADE |
| `field_id` | UUID NOT NULL | Pergunta do checklist |
| `rodada` | INT NOT NULL CHECK ≥ 1 | Sequência por (assignment, field) |
| `instrucao` | TEXT | Instrução geral do plano |
| `itens_plano` | JSONB DEFAULT `[]` | Lista de itens: `[{tipo, titulo, obrigatorio}]` |
| `prazo_resolucao` | TIMESTAMPTZ | Quando executor deve responder |
| `criticidade` | TEXT CHECK (baixa/media/alta) | Severidade |
| `criado_em` | TIMESTAMPTZ DEFAULT now() | Auditoria |
| `criado_por` | UUID | FK `profiles.id` (aprovador) |
| `respondido` | BOOLEAN DEFAULT false | Flag de resposta |
| `respondido_em` | TIMESTAMPTZ | Quando executor respondeu |
| `respondido_por` | UUID | FK `profiles.id` (executor) |
| `resposta_valor_json` | JSONB | Resposta: `{foto: {evidencia_url,...}, texto: {valor_texto},...}` |
| `tenant_id` | UUID | Multi-tenant (RLS) |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

---

## Índices

- `idx_tarefas_planos_aprov_assignment` em `(assignment_id)`
- `idx_tarefas_planos_aprov_field` em `(assignment_id, field_id)`
- `idx_tarefas_planos_aprov_pendentes` em `(assignment_id)` WHERE `respondido=false`

## Constraints

- UNIQUE `(assignment_id, field_id, rodada)` — impede colisão dentro do setor do aprovador

---

## RPCs que escrevem nesta tabela

- INSERT: `tarefas_rpc_aprovador_criar_plano_acao`
- UPDATE: `tarefas_rpc_executor_responder_plano_aprovador`

## Triggers associados

- `tarefas_trigger_status_apos_aprovador_criar_plano` — AFTER INSERT
- `tarefas_trigger_status_apos_executor_responder_plano` — AFTER UPDATE respondido

---

*Atualizado: 2026-05-20*
