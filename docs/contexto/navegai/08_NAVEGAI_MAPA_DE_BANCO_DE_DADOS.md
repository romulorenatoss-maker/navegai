# Navegai - Mapa de Banco de Dados

## 1. Grupos de tabelas principais

| Grupo | Tabelas principais | Modulo | Observacao |
|---|---|---|---|
| Auth/perfis | `profiles`, `user_roles`, `screen_permissions`, `user_screen_permissions`, `audit_logs` | Global | Roles e permissoes |
| Avaliacoes/OS | `ordens_servico`, `avaliacoes`, `respostas_avaliacao`, `perguntas_avaliacao`, `avaliacoes_inconsistencias`, `inconsistencias_vinculadas` | Avaliacoes | Fluxo legado de OS |
| Cadastros | `clientes`, `cliente_contatos`, `cliente_responsaveis`, `setores`, `tipos_servico`, `colaborador_setores` | Cadastros | Compartilhado |
| Leads | `leads`, `lead_contatos`, `lead_interacoes`, `lead_historico`, `lead_tarefas_contato`, `campanhas`, `lead_objecoes`, `rotina_tentativas_leads` | Leads | Fila e funil |
| Tarefas | `operational_assignments`, `operational_templates`, `operational_template_fields`, `operational_template_sections`, `operational_field_answers`, `operational_assignment_stage_runs`, `operational_assignment_history`, `operational_contingencies` | Tarefas | Execucao operacional |
| Tarefas planos | `tarefas_planos_acao_aprovador`, `tarefas_planos_acao_auditor` | Tarefas | Planos separados por etapa de aprovacao/auditoria |
| Tarefas anexos | `tarefas_anexos` | Tarefas | Evidencias/anexos |
| Propostas | `propostas_propostas`, `propostas_itens`, `propostas_produtos`, `propostas_templates`, `propostas_historico`, `propostas_fluxo`, `propostas_perguntas_setup`, `propostas_rascunhos_conversa` | Propostas | Comercial |

## 2. Migrations

- Pasta: `supabase/migrations/`
- Periodo observado: 2026-03 a 2026-05
- Padrao: muitas migrations incrementais com RLS, functions, triggers e policies.
- Ultima migration observada: `20260524154658_551e81ea-9256-4610-a24d-a8e785b1d0f9.sql`, com reforcos de seguranca em clientes/contatos/responsaveis.
- Migration adicionada em 2026-05-24: `20260524170000_tarefas_etapas_execucao_persistente.sql`, cria `operational_assignment_stage_runs` para persistir inicio/fim/duracao/atrasos das etapas do executor.

## 3. Pontos de atencao

| Item | Risco | Acao |
|---|---|---|
| Tabelas operacionais de tarefas | Status/regra sensivel | Alterar via RPC quando possivel |
| `operational_assignment_stage_runs` | Tempo de etapa e auditoria operacional | Escrever via RPC `tarefas_rpc_executor_iniciar_etapa` / `tarefas_rpc_executor_finalizar_etapa` |
| Tabelas de clientes/contatos | Dados pessoais | Validar RLS antes de abrir acesso |
| Tabelas de propostas | Dados comerciais | Registrar historico em alteracoes |
| Leads | Dados pessoais e funil | Evitar updates diretos sem historico |
