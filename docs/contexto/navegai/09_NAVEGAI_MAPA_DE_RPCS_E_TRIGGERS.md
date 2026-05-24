# Navegai - Mapa de RPCs e Triggers

## 1. RPCs / Procedures / Functions principais

| RPC/function | Modulo | Action_id | Chamada por | Tabelas afetadas | Valida permissao | Valida tenant | Audita | Status |
|---|---|---|---|---|---|---|---|---|
| `has_role` | auth | `auth.has_role` | frontend/RLS | `user_roles` | sim | NAO ENCONTRADO NO CODIGO | nao | ativo |
| `is_admin` | auth | `auth.is_admin` | RLS | `user_roles` | sim | NAO ENCONTRADO NO CODIGO | nao | ativo |
| `get_user_effective_permissions` | configuracoes | `configuracoes.permissoes_efetivas` | `usePermissions` | permissoes | sim esperado | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | ativo |
| `dashboard_metricas_agregadas` | dashboards | `dashboard.metricas_agregadas` | `DashboardPage`, `useNotasPorSetor` | OS/avaliacoes | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | nao | ativo |
| `calcular_notas_por_setor` | avaliacoes | `avaliacoes.notas_por_setor` | `useNotasPorSetor` | avaliacoes/respostas | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | nao | ativo |
| `sync_user_role` | configuracoes | `configuracoes.sync_user_role` | `ColaboradoresPage` | `user_roles` | sim esperado | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | critico |
| `tarefas_rpc_executor_enviar_respostas` | tarefas | `tarefas.executor_enviar_respostas` | fluxo tarefas | `operational_*` | sim esperado | sim esperado | sim esperado | critico |
| `tarefas_rpc_executor_responder_plano_aprovador` | tarefas | `tarefas.executor_responder_plano_aprovador` | fluxo tarefas | planos/status | sim esperado | sim esperado | sim esperado | critico |
| `tarefas_rpc_aprovador_criar_plano_executor` | tarefas | `tarefas.aprovador_criar_plano_executor` | fluxo tarefas | planos/status | sim esperado | sim esperado | sim esperado | critico |
| `tarefas_rpc_aprovador_aprovar_para_auditoria` | tarefas | `tarefas.aprovador_aprovar_para_auditoria` | fluxo tarefas | assignments/status | sim esperado | sim esperado | sim esperado | critico |
| `tarefas_rpc_aprovador_responder_plano_auditor` | tarefas | `tarefas.aprovador_responder_plano_auditor` | fluxo tarefas | planos/status | sim esperado | sim esperado | sim esperado | critico |
| `tarefas_rpc_auditor_criar_plano_aprovador` | tarefas | `tarefas.auditor_criar_plano_aprovador` | fluxo tarefas | planos/status | sim esperado | sim esperado | sim esperado | critico |
| `tarefas_rpc_auditor_aprovar_auditoria` | tarefas | `tarefas.auditor_aprovar_auditoria` | fluxo tarefas | assignments/status | sim esperado | sim esperado | sim esperado | critico |
| `propostas_categoria_em_uso` | propostas | `propostas.categoria_em_uso` | `propostasContextoService` | `propostas_*` | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | ativo |

## 2. Triggers principais

| Trigger | Tabela | Modulo | Evento | Responsabilidade | Risco |
|---|---|---|---|---|---|
| `set_updated_at_*` | varias | geral | update | atualizar timestamp | baixo |
| `on_auth_user_created` | auth.users | auth | insert | criar profile | medio |
| `trg_check_os_completion` | respostas/avaliacoes | avaliacoes | respostas | fechar OS/avaliacao | medio |
| `tarefas_trigger_status_apos_aprovador_criar_plano` | tarefas planos | tarefas | insert | mudar status apos plano | alto |
| `tarefas_trigger_status_apos_executor_responder_plano` | tarefas planos | tarefas | update | mudar status apos resposta | alto |
| `tarefas_trigger_status_apos_auditor_criar_plano` | tarefas planos | tarefas | insert | mudar status apos plano auditor | alto |
| `tarefas_trigger_status_apos_aprovador_responder_plano_auditor` | tarefas planos | tarefas | update | finalizar etapa | alto |
| `trg_propostas_*_validate_v2` | propostas | propostas | insert/update | validacao template/produto | medio |

## 3. Triggers com responsabilidade misturada

NAO ENCONTRADO NO CODIGO nesta primeira passada. Risco maior esta no historico de multiplas migrations redefinindo as mesmas RPCs/triggers.
