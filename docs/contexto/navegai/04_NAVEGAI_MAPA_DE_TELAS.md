# Navegai - Mapa de Telas

## 1. Telas oficiais

| Tela | Rota | Arquivo | Modulo | Objetivo | Hooks/Services | Status |
|---|---|---|---|---|---|---|
| Tarefas Execucao | `/tarefas/execucao` | `src/modules/tarefas/pages/tarefas_execucaoPage.tsx` | Tarefas | Listar tarefas e abrir drawer executor/aprovador/auditor | `tarefas_useFluxoTarefa`, `tarefas_fluxoRpcService` | Ativo |
| Tarefas Rotinas | `/tarefas/rotinas` | `tarefas_rotinasPage.tsx` | Tarefas | Configurar templates/rotinas | `RotinasModal`, services tarefas | Ativo |
| Tarefas Dashboard | `/tarefas/dashboard` | `tarefas_dashboardPage.tsx` | Tarefas | Indicadores operacionais | `tarefas_useDashboard` | Ativo |
| Tarefas Historico | `/tarefas/historico` | `tarefas_historicoPage.tsx` | Tarefas | Historico de execucoes | Supabase direto/services | Ativo |
| Proposta Conversacional | `/propostas/conversa` | `PropostaConversacionalPage.tsx` | Propostas | Criar proposta por conversa | Edge `propostas-conversacional` | Ativo |
| Proposta Preview | `/propostas/:id` | `PropostaPreviewPage.tsx` | Propostas | Visualizar proposta | `propostasService` | Ativo |
| Produtos Propostas | `/propostas/produtos` | `ProdutosConversacionalPage.tsx` | Propostas | Gerir produtos por IA | Edge `propostas-produtos-conversa` | Ativo |
| Avaliacao OS | `/avaliacoes/pesquisa` | `AvaliacaoOSPage.tsx` | Avaliacoes | Criar/buscar/responder OS | `useAvaliacaoOS` | Ativo |
| Leads Fila | `/leads/fila` | `FilaLeadsPage.tsx` | Leads | Atender tarefas de contato | Supabase direto | Ativo |
| Clientes | `/cadastros/clientes` | `ClientesPage.tsx` | Cadastros | Gerir clientes | Supabase direto | Ativo |

## 2. Contrato detalhado - Tarefas Execucao

- Rota: `/tarefas/execucao`, `/tarefas/detalhes/:id`
- Arquivo renderizado: `src/modules/tarefas/pages/tarefas_execucaoPage.tsx`
- Modulo dono: Tarefas
- Dados exibidos: assignments, status, executor/aprovador/auditor, perguntas, anexos, historico.
- Componentes: `tarefas_fluxoExecutorPanel`, `tarefas_fluxoAprovadorPanel`, `tarefas_fluxoAuditorPanel`, `tarefas_dynamicFieldRenderer`.
- Hooks: `tarefas_useFluxoTarefa`, `tarefas_useExecutorActions`, `tarefas_useAprovadorActions`, `tarefas_useAuditorActions`.
- Services/RPC: `tarefas_fluxoRpcService`, RPCs `tarefas_rpc_*`.
- O que NAO pode fazer: alterar regras de aprovador/auditor sem pedido explicito; criar persistencia de cronometro sem banco aprovado.

## 3. Telas duplicadas ou paralelas

| Tela | Arquivo | Similar a | Risco | Decisao recomendada |
|---|---|---|---|---|
| Leads fila/tarefas | `FilaLeadsPage.tsx`, `FilaTarefasLeadsPage.tsx` | Gerenciamento de contatos | Media | Validar antes de remover |
| Propostas produtos | `ProdutosConversacionalPage.tsx`, `PropostaProdutosPage.tsx` | Produtos | Baixa/media | Mantidas por rotas diferentes |
