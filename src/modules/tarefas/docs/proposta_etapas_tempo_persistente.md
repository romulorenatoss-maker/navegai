# Proposta futura: persistencia de tempo por etapa

Esta proposta documenta uma fase futura para persistir inicio, fim e duracao real por etapa no fluxo de execucao de tarefas. Nao foi implementada nesta etapa.

## Tabela sugerida

`tarefas_execucao_etapas_tempo`

Campos sugeridos:

- `id uuid primary key default gen_random_uuid()`
- `assignment_id uuid not null references operational_assignments(id)`
- `template_section_id text not null`
- `section_label text null`
- `started_at timestamptz null`
- `finished_at timestamptz null`
- `duration_seconds integer null`
- `status text not null default 'pendente'`
- `created_by uuid null references auth.users(id)`
- `updated_by uuid null references auth.users(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indice recomendado:

- `(assignment_id, template_section_id)`

Restricao recomendada:

- unique `(assignment_id, template_section_id)`

## RPCs sugeridas

- `tarefas_rpc_executor_iniciar_etapa(p_assignment_id uuid, p_template_section_id text)`
- `tarefas_rpc_executor_finalizar_etapa(p_assignment_id uuid, p_template_section_id text)`
- `tarefas_rpc_executor_listar_etapas_tempo(p_assignment_id uuid)`

## Trigger sugerido

- `tarefas_trigger_execucao_etapas_tempo_updated_at`

## Regras de seguranca sugeridas

- Executor da tarefa pode iniciar/finalizar somente etapas do proprio assignment.
- Aprovador, auditor e admin podem consultar historico de tempo.
- Escrita deve passar por RPC para validar ordem das etapas, obrigatorios e evidencias.
