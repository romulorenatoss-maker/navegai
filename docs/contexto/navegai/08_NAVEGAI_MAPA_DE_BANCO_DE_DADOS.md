# Navegai - Mapa de Banco de Dados

## 1. Schemas e migrations

| Item | Valor |
|---|---|
| Pasta | `supabase/migrations` |
| Total de migrations SQL | 239 |
| Ocorrencias CREATE TABLE encontradas | 103 |
| Ocorrencias CREATE/REPLACE FUNCTION encontradas | 122 |
| Ocorrencias CREATE POLICY encontradas | 426 |
| Ocorrencias CREATE TRIGGER encontradas | 71 |

## 2. Tabelas principais por modulo

| Tabela | Modulo dono | Finalidade | RLS | Policies | Auditoria | Status |
|---|---|---|---|---|---|---|
| `profiles` | auth/configuracoes | perfil de usuarios | sim | sim | parcial | ativa |
| `user_roles` | auth/configuracoes | roles | sim | sim | NAO ENCONTRADO NO CODIGO | ativa |
| `permission_resources`, `permission_groups`, `group_permissions`, `user_group_assignments`, `user_permission_overrides` | configuracoes | permissoes granulares | sim esperado | sim esperado | NAO ENCONTRADO NO CODIGO | ativo |
| `setores`, `colaborador_setores` | cadastros/tarefas | organizacao por setor | sim | sim | NAO ENCONTRADO NO CODIGO | ativo |
| `clientes`, `cliente_contatos`, `cliente_responsaveis` | cadastros/leads/propostas | clientes e contatos | sim | sim | parcial | ativo |
| `cidades`, `bairros`, `ruas` | cadastros | enderecos | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | ativo |
| `leads`, `lead_interacoes`, `lead_objecoes`, `registro_objecao_lead` | leads | funil e historico | sim esperado | sim esperado | NAO ENCONTRADO NO CODIGO | ativo |
| `ordens_servico` | avaliacoes | OS | sim | sim | parcial | ativo/critico |
| `avaliacoes`, `respostas_avaliacao`, `respostas_eventos` | avaliacoes | respostas e notas | sim | sim | parcial | ativo/critico |
| `perguntas_avaliacao`, `checklists`, `checklist_itens`, `checklist_perguntas` | avaliacoes/cadastros | perguntas/checklists | sim | sim | NAO ENCONTRADO NO CODIGO | ativo |
| `operational_templates`, `operational_assignments`, `operational_field_answers`, `operational_audit_answers`, `operational_contingencies`, `operational_action_plans`, `operational_score_logs` | tarefas | rotinas/tarefas/fluxo | sim | sim | sim/parcial | critico |
| `tarefas_planos_acao_aprovador`, `tarefas_planos_acao_auditor`, `tarefas_anexos` | tarefas | planos/anexos | sim | sim | sim/parcial | critico |
| `propostas_*` | propostas | templates, produtos, historico, setup | sim esperado | sim esperado | NAO ENCONTRADO NO CODIGO | ativo |
| `audit_logs` | auditoria | logs | sim | sim | propria tabela | ativo |

## 3. Tabelas sem dono ou com risco

| Tabela | Problema | Risco | Recomendacao |
|---|---|---|---|
| `cidades`, `bairros`, `ruas` | usadas por cadastros/leads/clientes sem modulo dedicado claro | exclusao/merge direto | criar contrato de action antes de alterar. |
| `operational_*` | muitas migrations e reworks | divergencia de coluna/RPC | sempre consultar migration mais recente e docs do modulo. |
| `propostas_*` | v2 historico em migrations | nomenclatura v2 em banco | nao criar nova v2; tratar como legado validado. |
