# Navegai - Mapa de RPCs e Triggers

## 1. RPCs principais

| RPC/function | Modulo | Uso | Status |
|---|---|---|---|
| `has_role` | Global | Verificar role | Ativo |
| `is_admin` | Global | Verificar admin | Ativo |
| `get_user_effective_permissions` | Global | Permissoes por tela | Ativo |
| `insert_resposta_evento` | Avaliacoes | Log de resposta | Ativo |
| `calcular_notas_por_setor` | Avaliacoes | Dashboard notas | Ativo |
| `dashboard_metricas_agregadas` | Avaliacoes | Dashboard | Ativo |
| `tarefas_rpc_executor_enviar_respostas` | Tarefas | Envio executor -> aprovador | Critico |
| `tarefas_rpc_executor_responder_plano_aprovador` | Tarefas | Executor responde plano | Critico |
| `tarefas_rpc_aprovador_criar_plano_acao` | Tarefas | Aprovador cria plano | Critico |
| `tarefas_rpc_aprovador_criar_plano_executor` | Tarefas | Aprovador cria plano para executor | Critico |
| `tarefas_rpc_aprovador_aprovar_para_auditoria` | Tarefas | Aprovador envia auditoria | Critico |
| `tarefas_rpc_aprovador_responder_plano_auditor` | Tarefas | Aprovador responde auditor | Critico |
| `tarefas_rpc_auditor_criar_plano_acao` | Tarefas | Auditor cria plano | Critico |
| `tarefas_rpc_auditor_criar_plano_aprovador` | Tarefas | Auditor cria plano para aprovador | Critico |
| `tarefas_rpc_auditor_aprovar_auditoria` | Tarefas | Auditor finaliza | Critico |
| `propostas_categoria_em_uso` | Propostas | Validar categoria usada | Ativo |

## 2. Triggers principais

| Trigger/function | Modulo | Responsabilidade |
|---|---|---|
| `update_updated_at_column` | Global | Atualizar `updated_at` |
| `on_auth_user_created` | Auth | Criar profile |
| `trg_check_os_completion` | Avaliacoes | Conclusao OS |
| `tarefas_trigger_status_apos_aprovador_criar_plano` | Tarefas | Status apos plano aprovador |
| `tarefas_trigger_status_apos_executor_responder_plano` | Tarefas | Status apos resposta executor |
| `tarefas_trigger_status_apos_auditor_criar_plano` | Tarefas | Status apos plano auditor |
| `tarefas_trigger_status_apos_aprovador_responder_plano_auditor` | Tarefas | Status apos aprovador responder auditor |
| `trg_set_operational_contingency_responsavel` | Tarefas | Responsavel de contingencia |
| `trg_clientes_validate_tipo_pessoa` | Cadastros | Validacao cliente |
| `trg_propostas_perguntas_validate_tipo` | Propostas | Validar tipo de pergunta |

## 3. Regra

Nao alterar RPC/trigger sem atualizar `07`, `08`, `10`, `12`, `20`, `22`, `15` e `19`.
