# Navegai - Mapa de Botoes e Actions

## 1. Indice rapido de botoes/actions criticos

| Nome visual | Action_id | Tela | Rota | Modulo | Hook | Service | API/RPC | Permissao | Status |
|---|---|---|---|---|---|---|---|---|---|
| Enviar respostas executor | `tarefas.executor_enviar_respostas` | Execucao tarefa | `/tarefas/execucao`, `/tarefas/detalhes/:id` | tarefas | `tarefas_useExecutorActions` | `tarefas_fluxoRpcService` | `tarefas_rpc_executor_enviar_respostas` | tarefas/acesso operacional | encontrado por nome |
| Responder plano aprovador | `tarefas.executor_responder_plano_aprovador` | Execucao tarefa | `/tarefas/*` | tarefas | `tarefas_useExecutorActions` | `tarefas_fluxoRpcService` | `tarefas_rpc_executor_responder_plano_aprovador` | tarefas/acesso operacional | encontrado por nome |
| Criar plano executor | `tarefas.aprovador_criar_plano_executor` | Fluxo aprovador | `/tarefas/*` | tarefas | `tarefas_useAprovadorActions` | `tarefas_fluxoRpcService` | `tarefas_rpc_aprovador_criar_plano_executor` | aprovador/admin | encontrado por nome |
| Aprovar para auditoria | `tarefas.aprovador_aprovar_para_auditoria` | Fluxo aprovador | `/tarefas/*` | tarefas | `tarefas_useAprovadorActions` | `tarefas_fluxoRpcService` | `tarefas_rpc_aprovador_aprovar_para_auditoria` | aprovador/admin | encontrado por nome |
| Aprovar auditoria | `tarefas.auditor_aprovar_auditoria` | Fluxo auditor | `/tarefas/*` | tarefas | `tarefas_useAuditorActions` | `tarefas_fluxoRpcService` | `tarefas_rpc_auditor_aprovar_auditoria` | auditor/admin | encontrado por nome |
| Criar usuario | `configuracoes.criar_usuario` | Colaboradores | `/cadastros/colaboradores` | configuracoes/cadastros | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | `create-user` | admin | encontrado por chamada |
| Atualizar senha admin | `configuracoes.admin_update_password` | Dialog admin | NAO ENCONTRADO NO CODIGO | configuracoes | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | `admin-update-password` | admin | encontrado por chamada |
| MFA admin | `configuracoes.admin_manage_mfa` | Dialog colaborador | NAO ENCONTRADO NO CODIGO | configuracoes | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | `admin-manage-mfa` | admin | encontrado por chamada |
| Gerar proposta | `propostas.gerar_proposta` | Nova proposta/conversa | `/propostas/*` | propostas | NAO ENCONTRADO NO CODIGO | `propostasService` | `propostas-gerar-proposta` | propostas | encontrado por chamada |
| Preview proposta PDF | `propostas.preview_pdf` | Templates/preview | `/propostas/templates` | propostas | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | `preview-proposta` | propostas | encontrado por chamada |
| Iniciar etapa executor | `tarefas.executor_iniciar_etapa_local` | Execucao tarefa | `/tarefas/execucao`, `/tarefas/detalhes/:id` | tarefas | estado local em `FluxoExecutorPanel` | frontend local | sem RPC nesta fase | tarefas/acesso operacional | controle visual local |
| Finalizar etapa executor | `tarefas.executor_finalizar_etapa_local` | Execucao tarefa | `/tarefas/execucao`, `/tarefas/detalhes/:id` | tarefas | estado local em `FluxoExecutorPanel` | frontend local | sem RPC nesta fase | tarefas/acesso operacional | valida obrigatorios/evidencias localmente |

## 2. Contrato tecnico minimo por action critica

### ACTION_ID: tarefas.executor_enviar_respostas

- Modulo dono: tarefas
- Tela: Execucao/Dashboard de Tarefas
- Hook: `src/modules/tarefas/fluxo/hooks/tarefas_useExecutorActions.ts`
- Service: `src/modules/tarefas/fluxo/services/tarefas_fluxoRpcService.ts`
- API/RPC: `tarefas_rpc_executor_enviar_respostas`
- Tabelas afetadas: `operational_assignments`, `operational_field_answers`, logs/plano conforme migration vigente.
- Triggers: triggers de fluxo em migrations `20260521*`/`20260522*`.
- Permissao: usuario executor/admin conforme RPC/RLS.
- Fluxo direto: executor envia respostas e muda status do fluxo.
- Fluxo reverso: NAO ENCONTRADO NO CODIGO neste mapa inicial.
- O que NAO pode fazer: alterar status fora da RPC oficial.

## 3. Botoes sem acao encontrada

| Nome visual | Tela | Arquivo | Problema | Risco |
|---|---|---|---|---|
| Auditoria placeholder | `/auditoria` | `src/App.tsx` + `PlaceholderPage` | tela sem implementacao real | expectativa falsa para auditoria. |

## 4. Regra para novas actions

Toda nova action critica deve nascer com: action_id, hook, service, API/RPC, permissao, auditoria, correlation_id/idempotency_key, fluxo direto e reverso.

## 5. Observacao sobre etapas do executor

- O menu de etapas do executor em `/tarefas/execucao` e uma camada visual local sobre `template_snapshot.sections` e `template_snapshot.fields`.
- A action critica `tarefas.executor_enviar_respostas` continua sendo o unico envio ao aprovador nesta fase.
- Tempo real por etapa ainda nao tem persistencia. Proposta separada: `src/modules/tarefas/docs/proposta_etapas_tempo_persistente.md`.
