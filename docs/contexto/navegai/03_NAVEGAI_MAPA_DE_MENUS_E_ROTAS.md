# Navegai - Mapa de Menus e Rotas

## 1. Menus principais

| Menu | Submenu | Rota | Arquivo renderizado | Modulo dono | Permissao para visualizar | Status |
|---|---|---|---|---|---|---|
| Dashboards | Dashboard OS | `/` | `src/pages/DashboardPage.tsx` | Avaliacoes/OS | `canViewPath`/admin | Ativo |
| Dashboards | Dashboard de Leads | `/leads/dashboard` | `src/pages/DashboardLeadsPage.tsx` | Leads | `canViewPath`/admin | Ativo |
| Dashboards | Dashboard Vendas | `/leads/dashboard-vendas` | `src/pages/DashboardVendasPage.tsx` | Leads | `canViewPath`/admin | Ativo |
| Dashboards | Assistente Navi | `/assistente` | `src/pages/AssistentePage.tsx` | Assistente | `canViewPath`/admin | Ativo |
| Propostas | Nova Proposta | `/propostas/nova` | `src/modules/propostas/pages/PropostaCreatePage.tsx` | Propostas | `canViewPath`/admin | Ativo |
| Propostas | Templates | `/propostas/templates` | `TemplateImportPage.tsx` | Propostas | `canViewPath`/admin | Ativo |
| Propostas | Produtos | `/propostas/produtos` | `ProdutosConversacionalPage.tsx` | Propostas | `canViewPath`/admin | Ativo |
| Propostas | Historico | `/propostas` | `PropostaHistoricoPage.tsx` | Propostas | `canViewPath`/admin | Ativo |
| Avaliacoes | Criar OS / Buscar | `/avaliacoes/pesquisa` | `AvaliacaoOSPage.tsx` | Avaliacoes | `canViewPath`/admin | Ativo |
| Avaliacoes | Minhas Avaliacoes | `/avaliacoes/minhas` | `MinhasAvaliacoesPage.tsx` | Avaliacoes | `canViewPath`/admin | Ativo |
| Avaliacoes | Tempo de Avaliacoes | `/avaliacoes/tempo-avaliacoes` | `avaliacoes_tempoAvaliacoesPage.tsx` | Avaliacoes | `canViewPath`/admin | Ativo |
| Leads | Gerenciador de Leads | `/leads/fila` | `FilaLeadsPage.tsx` | Leads | `canViewPath`/admin | Ativo |
| Leads | Leads Arquivados | `/leads/arquivados` | `LeadsArquivadosPage.tsx` | Leads | `canViewPath`/admin | Ativo |
| Leads | Importador de Leads | `/leads/importador` | `ImportadorLeadsPage.tsx` | Leads | `canViewPath`/admin | Ativo |
| Leads | Meus Leads | `/leads` | `LeadsPage.tsx` | Leads | `canViewPath`/admin | Ativo |
| Tarefas | Dashboard | `/tarefas/dashboard` | `tarefas_dashboardPage.tsx` | Tarefas | `canViewPath`/admin | Ativo |
| Tarefas | Execucao | `/tarefas/execucao` | `tarefas_execucaoPage.tsx` | Tarefas | `canViewPath`/admin | Ativo |
| Tarefas | Rotinas | `/tarefas/rotinas` | `tarefas_rotinasPage.tsx` | Tarefas | `canViewPath`/admin | Ativo |
| Tarefas | Agenda | `/tarefas/agendamentos` | `tarefas_agendamentosPage.tsx` | Tarefas | `canViewPath`/admin | Ativo |
| Tarefas | Historico | `/tarefas/historico` | `tarefas_historicoPage.tsx` | Tarefas | `canViewPath`/admin | Ativo |
| Tarefas | Configuracoes | `/tarefas/configuracoes` | `tarefas_configuracoesPage.tsx` | Tarefas | `canViewPath`/admin | Ativo |
| Cadastros | Clientes | `/cadastros/clientes` | `ClientesPage.tsx` | Cadastros | `canViewPath`/admin | Ativo |
| Configuracoes | Configuracoes | `/configuracoes` | `ConfiguracoesPage.tsx` | Configuracoes | `canViewPath`/admin | Ativo |
| Relatorios | Relatorios de OS | `/relatorios` | `RelatoriosPage.tsx` | Avaliacoes | `canViewPath`/admin | Ativo |

## 2. Rotas especiais

| Rota | Page | Observacao |
|---|---|---|
| `/tarefas/detalhes/:id` | `tarefas_execucaoPage.tsx` | Alias para abrir tarefa especifica |
| `/desempenho/tempo-avaliacoes` | `Navigate` | Redireciona para `/avaliacoes/tempo-avaliacoes` |
| `/propostas/:id/preview` e `/propostas/:id` | `PropostaPreviewPage.tsx` | Preview/detalhe da proposta |
| `*` | `NotFound.tsx` | Fallback |

## 3. Menus sem rota ou rotas sem menu

| Item | Tipo | Caminho | Observacao |
|---|---|---|---|
| `/configuracoes/permissoes` | Rota sem item direto no sidebar | `src/App.tsx` | Acessivel por configuracoes |
| `/configuracoes/integracoes` | Rota sem item direto no sidebar | `src/App.tsx` | Acessivel por configuracoes |
| `/propostas/setup`, `/propostas/conversa`, `/propostas/dados-render`, `/propostas/perguntas`, `/propostas/produtos/grid` | Rotas sem item direto principal | `src/App.tsx` | Fluxos internos do modulo propostas |
