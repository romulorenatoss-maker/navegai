# Navegai - Mapa de Menus e Rotas

## 1. Menus principais

| Menu | Submenu | Rota | Arquivo renderizado | Modulo dono | Permissao para visualizar | Status |
|---|---|---|---|---|---|---|
| Dashboards | Dashboard OS | `/` | `DashboardPage.tsx` | dashboards | `canViewPath`/allowedScreens | ativo |
| Dashboards | Dashboard de Leads | `/leads/dashboard` | `DashboardLeadsPage.tsx` | leads | `canViewPath`/allowedScreens | ativo |
| Dashboards | Dashboard Vendas | `/leads/dashboard-vendas` | `DashboardVendasPage.tsx` | leads | `canViewPath`/allowedScreens | ativo |
| Dashboards | Assistente Navi | `/assistente` | `AssistentePage.tsx` | dashboards | `canViewPath`/allowedScreens | ativo |
| Propostas | Nova Proposta | `/propostas/nova` | `PropostaCreatePage.tsx` | propostas | `canViewPath`/allowedScreens | ativo |
| Propostas | Templates | `/propostas/templates` | `TemplateImportPage.tsx` | propostas | `canViewPath`/allowedScreens | ativo |
| Propostas | Produtos | `/propostas/produtos` | `ProdutosConversacionalPage.tsx` | propostas | `canViewPath`/allowedScreens | ativo |
| Propostas | Historico | `/propostas` | `PropostaHistoricoPage.tsx` | propostas | `canViewPath`/allowedScreens | ativo |
| Avaliacoes | Criar OS / Buscar | `/avaliacoes/pesquisa` | `AvaliacaoOSPage.tsx` | avaliacoes | `canViewPath`/allowedScreens | ativo |
| Avaliacoes | Minhas Avaliacoes | `/avaliacoes/minhas` | `MinhasAvaliacoesPage.tsx` | avaliacoes | `canViewPath`/allowedScreens | ativo |
| Avaliacoes | Tempo de Avaliacoes | `/avaliacoes/tempo-avaliacoes` | `avaliacoes_tempoAvaliacoesPage.tsx` | avaliacoes | `canViewPath`/allowedScreens | ativo |
| Leads | Gerenciador de Leads | `/leads/fila` | `FilaLeadsPage.tsx` | leads | `canViewPath`/allowedScreens | ativo |
| Leads | Leads Arquivados | `/leads/arquivados` | `LeadsArquivadosPage.tsx` | leads | `canViewPath`/allowedScreens | ativo |
| Leads | Importador de Leads | `/leads/importador` | `ImportadorLeadsPage.tsx` | leads | `canViewPath`/allowedScreens | ativo |
| Leads | Gerenciamento de Leads | `/leads/gerenciamento` | `GerenciamentoLeadsPage.tsx` | leads | `canViewPath`/allowedScreens | ativo |
| Leads | Campanhas | `/leads/campanhas` | `CampanhasPage.tsx` | leads | `canViewPath`/allowedScreens | ativo |
| Leads | Meus Leads | `/leads` | `LeadsPage.tsx` | leads | `canViewPath`/allowedScreens | ativo |
| Leads | Rotina de Tentativas | `/leads/rotina` | `RotinaTentativasPage.tsx` | leads | `canViewPath`/allowedScreens | ativo |
| Tarefas | Dashboard | `/tarefas/dashboard` | `tarefas_dashboardPage.tsx` | tarefas | `canViewPath`/allowedScreens | ativo |
| Tarefas | Execucao | `/tarefas/execucao` | `tarefas_execucaoPage.tsx` | tarefas | `canViewPath`/allowedScreens | ativo |
| Tarefas | Rotinas | `/tarefas/rotinas` | `tarefas_rotinasPage.tsx` | tarefas | `canViewPath`/allowedScreens | ativo |
| Tarefas | Agenda | `/tarefas/agendamentos` | `tarefas_agendamentosPage.tsx` | tarefas | `canViewPath`/allowedScreens | ativo |
| Tarefas | Historico | `/tarefas/historico` | `tarefas_historicoPage.tsx` | tarefas | `canViewPath`/allowedScreens | ativo |
| Tarefas | Desempenho | `/tarefas/desempenho` | `tarefas_desempenhoPage.tsx` | tarefas | `canViewPath`/allowedScreens | ativo |
| Tarefas | Relatorios | `/tarefas/relatorios` | `tarefas_relatoriosPage.tsx` | tarefas | `canViewPath`/allowedScreens | ativo |
| Tarefas | Configuracoes | `/tarefas/configuracoes` | `tarefas_configuracoesPage.tsx` | tarefas | `canViewPath`/allowedScreens | ativo |
| Cadastros | Tipos de Servico | `/cadastros/servicos` | `TiposServicoPage.tsx` | cadastros | `canViewPath`/allowedScreens | ativo |
| Cadastros | Perguntas | `/avaliacoes/perguntas` | `PerguntasPage.tsx` | avaliacoes | `canViewPath`/allowedScreens | ativo |
| Cadastros | Objecoes | `/leads/objecoes` | `ObjecoesLeadsPage.tsx` | leads | `canViewPath`/allowedScreens | ativo |
| Cadastros | Clientes | `/cadastros/clientes` | `ClientesPage.tsx` | cadastros | `canViewPath`/allowedScreens | ativo |
| Cadastros | Enderecos | `/cadastros/enderecos` | `CadastroEnderecosPage.tsx` | cadastros | `canViewPath`/allowedScreens | ativo |
| Configuracoes | Configuracoes | `/configuracoes` | `ConfiguracoesPage.tsx` | configuracoes | `canViewPath`/allowedScreens | ativo |
| Relatorios | Relatorios de OS | `/relatorios` | `RelatoriosPage.tsx` | relatorios | `canViewPath`/allowedScreens | ativo |
| Relatorios | Relatorios de Leads | `/leads/relatorios` | `RelatoriosLeadsPage.tsx` | relatorios | `canViewPath`/allowedScreens | ativo |

## 2. Rotas especiais

| Rota | Page | Wrapper/layout | Modulo | Protegida? | Observacao |
|---|---|---|---|---|---|
| `/login` | `LoginPage.tsx` | sem `ProtectedRoute` | auth | nao | Entrada publica. |
| `/desempenho` | `DesempenhoColaboradorPage.tsx` | `AppLayout` | dashboards/avaliacoes | sim | Rota fora de menu direto. |
| `/desempenho/tempo-avaliacoes` | redirect | `Navigate` | avaliacoes | sim | Redireciona para `/avaliacoes/tempo-avaliacoes`. |
| `/auditoria` | `PlaceholderPage` | `AppLayout` | auditoria | sim | Pendente/placeholder. |
| `/configuracoes/permissoes` | `PermissoesPage.tsx` | `AppLayout` | configuracoes | sim | Nao aparece no menu principal atual. |
| `/configuracoes/integracoes` | `IntegracoesPage.tsx` | `AppLayout` | configuracoes | sim | Nao aparece no menu principal atual. |
| `*` | `NotFound.tsx` | fora do layout | geral | NAO ENCONTRADO NO CODIGO | Fallback. |
