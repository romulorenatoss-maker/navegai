# Navegai - Indice de Busca Rapida

## 1. Como usar

Quando houver pedido de bug/alteracao, procurar aqui primeiro. Abrir no maximo 3 arquivos reais no modo rapido.

## 2. Indice por palavra-chave

| Palavra/frase do usuario | Onde consultar | Modulo | Arquivo alvo provavel | Observacao |
|---|---|---|---|---|
| menu lateral | `03`, `06` | geral | `src/components/AppSidebar.tsx` | rotas e labels. |
| rota nao abre | `03`, `04` | geral | `src/App.tsx` | confirmar ProtectedRoute. |
| permissao | `12`, `20` | configuracoes | `src/hooks/usePermissions.ts`, `src/pages/PermissoesPage.tsx` | risco alto. |
| tarefas dashboard | `02`, `04`, `10` | tarefas | `src/modules/tarefas/pages/tarefas_dashboardPage.tsx` | usar modulo. |
| tarefas execucao | `05`, `09`, `10` | tarefas | `src/modules/tarefas/pages/tarefas_execucaoPage.tsx` | fluxo critico. |
| plano de acao | `09`, `10`, docs tarefas | tarefas | `src/modules/tarefas/fluxo/*` | RPCs oficiais. |
| anexos tarefas | `07`, `23`, `25` | tarefas | `tarefas_storage_service.ts`, functions `tarefas-storage-*` | storage/download. |
| proposta | `02`, `07`, `23` | propostas | `src/modules/propostas/*` | Edge Functions. |
| template DOCX/PDF | `07`, `23`, `25` | propostas | `TemplateImportPage.tsx`, `preview-proposta` | CloudConvert/storage. |
| leads | `04`, `06` | leads | `src/pages/LeadsPage.tsx`, `FilaLeadsPage.tsx` | arquivos grandes. |
| criar OS | `04`, `08`, `11` | avaliacoes | `src/pages/AvaliacaoOSPage.tsx` | regra critica. |
| clientes/endereco | `04`, `08`, `11` | cadastros | `ClientesPage.tsx`, `CadastroEnderecosPage.tsx` | merge/delete com cuidado. |
| relatorio/exportar | `23` | relatorios | `RelatoriosPage.tsx`, `AssistenteReportTable.tsx` | checar permissao. |
| token/secret/env | `25` | seguranca | `.env`, functions | nao expor. |

## 3. Indice por action_id

| Action_id | Nome visual | Tela | Arquivo alvo | Hook | Service | RPC/API | Permissao |
|---|---|---|---|---|---|---|---|
| `tarefas.executor_enviar_respostas` | Enviar respostas | Tarefas execucao | `tarefas_execucaoPage.tsx` | `tarefas_useExecutorActions` | `tarefas_fluxoRpcService` | `tarefas_rpc_executor_enviar_respostas` | executor/admin |
| `tarefas.aprovador_aprovar_para_auditoria` | Aprovar para auditoria | Tarefas fluxo | fluxo components | `tarefas_useAprovadorActions` | `tarefas_fluxoRpcService` | `tarefas_rpc_aprovador_aprovar_para_auditoria` | aprovador/admin |
| `tarefas.auditor_aprovar_auditoria` | Aprovar auditoria | Tarefas fluxo | fluxo components | `tarefas_useAuditorActions` | `tarefas_fluxoRpcService` | `tarefas_rpc_auditor_aprovar_auditoria` | auditor/admin |
| `propostas.gerar_proposta` | Gerar proposta | Propostas | `PropostaCreatePage.tsx` | NAO ENCONTRADO NO CODIGO | `propostasService` | `propostas-gerar-proposta` | propostas |
| `configuracoes.criar_usuario` | Criar usuario | Colaboradores | `ColaboradoresPage.tsx` | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | `create-user` | admin |

## 4. Indice por erro conhecido

| Mensagem de erro | Onde investigar | Arquivo/RPC/tabela | Observacao |
|---|---|---|---|
| permissao negada | `12`, `20` | `usePermissions`, RLS | confirmar UI e policy. |
| coluna nao existe | `08`, docs tarefas | migrations recentes | modulo Tarefas teve coluna fantasma registrada em docs. |
| PDF nao disponivel | `07`, `23` | `preview-proposta`, `TemplateImportPage` | CloudConvert/storage. |
