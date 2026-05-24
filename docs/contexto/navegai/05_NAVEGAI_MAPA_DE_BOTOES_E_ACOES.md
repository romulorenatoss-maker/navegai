# Navegai - Mapa de Botoes e Actions

## 1. Indice rapido de botoes

| Nome visual | Action_id | Tela | Rota | Modulo | Hook/Service | API/RPC | Status |
|---|---|---|---|---|---|---|---|
| Enviar respostas ao aprovador | `tarefas.executor.enviar_respostas` | Tarefas Execucao | `/tarefas/execucao` | Tarefas | `tarefas_useExecutorActions` / `tarefas_fluxoRpcService` | `tarefas_rpc_executor_enviar_respostas` | Critico |
| Iniciar etapa | `tarefas.executor.iniciar_etapa_local` | Drawer executor | `/tarefas/execucao` | Tarefas | estado local `tarefas_fluxoExecutorPanel` | NAO ENCONTRADO NO CODIGO como RPC | Visual/local |
| Finalizar etapa | `tarefas.executor.finalizar_etapa_local` | Drawer executor | `/tarefas/execucao` | Tarefas | estado local `tarefas_fluxoExecutorPanel` | NAO ENCONTRADO NO CODIGO como RPC | Visual/local |
| Conforme | `tarefas.executor.responder_conforme` | DynamicFieldRenderer | `/tarefas/execucao` | Tarefas | `tarefas_dynamicFieldRenderer` | grava resposta existente | Ativo |
| Nao Conforme | `tarefas.executor.responder_nao_conforme` | DynamicFieldRenderer | `/tarefas/execucao` | Tarefas | `tarefas_dynamicFieldRenderer` | grava resposta existente | Ativo |
| N/A | `tarefas.executor.responder_na` | DynamicFieldRenderer | `/tarefas/execucao` | Tarefas | `tarefas_dynamicFieldRenderer` | valor_texto `na` | Ativo |
| Gerar proposta | `propostas.gerar` | Proposta Conversacional | `/propostas/conversa` | Propostas | `propostasService` | Edge `propostas-gerar-proposta` / `propostas-conversacional` | Ativo |
| Importar template | `propostas.template.importar` | Templates | `/propostas/templates` | Propostas | `TemplateImportPage` | Edge `preview-proposta` | Ativo |
| Salvar OS | `avaliacoes.os.salvar` | Avaliacao OS | `/avaliacoes/pesquisa` | Avaliacoes | `useAvaliacaoOS` | Supabase direto | Ativo |

## 2. Contrato tecnico - `tarefas.executor.enviar_respostas`

- Nome visual: Enviar respostas ao aprovador
- Modulo dono: Tarefas
- Rota: `/tarefas/execucao`
- Tela: `tarefas_execucaoPage.tsx`
- Componente: `tarefas_fluxoExecutorPanel.tsx`
- Hook: `tarefas_useExecutorActions`
- Service: `tarefas_fluxoRpcService`
- API/RPC: `tarefas_rpc_executor_enviar_respostas`
- Tabelas afetadas: `operational_field_answers`, `operational_assignments`, `operational_assignment_history`
- Triggers: triggers de status em migrations `tarefas_*`
- Permissao: executor/admin conforme RPC/policies
- O que pode fazer: enviar respostas finais para aprovador
- O que NAO pode fazer: enviar etapa seguinte sem etapa anterior concluida quando fluxo por etapas estiver ativo
- Teste minimo: preencher obrigatorias, anexos exigidos, finalizar etapas, enviar e verificar status aguardando aprovacao

## 3. Botoes sem acao encontrada

| Nome visual | Tela | Arquivo | Problema | Risco |
|---|---|---|---|---|
| Iniciar etapa | Tarefas Execucao | `tarefas_fluxoExecutorPanel.tsx` | Acao local sem persistencia | Baixo nesta fase; alto se precisar auditoria de tempo |
| Finalizar etapa | Tarefas Execucao | `tarefas_fluxoExecutorPanel.tsx` | Acao local sem persistencia | Baixo nesta fase; alto se precisar auditoria de tempo |
