# Navegai - Mapa de Telas

## 1. Telas oficiais

| Tela | Rota | Arquivo | Modulo | Objetivo | Hooks/Services | Status |
|---|---|---|---|---|---|---|
| Dashboard OS | `/` | `src/pages/DashboardPage.tsx` | dashboards | Metricas OS/avaliacoes | Supabase direto, `dashboard_metricas_agregadas` | ativo |
| Criar OS / Buscar | `/avaliacoes/pesquisa` | `src/pages/AvaliacaoOSPage.tsx` | avaliacoes | Criar e responder avaliacoes/OS | Supabase direto, `useAvaliacaoOS` | ativo/critico |
| Perguntas | `/avaliacoes/perguntas` | `src/pages/PerguntasPage.tsx` | avaliacoes | Checklists/perguntas | Supabase direto | ativo |
| Minhas Avaliacoes | `/avaliacoes/minhas` | `src/pages/MinhasAvaliacoesPage.tsx` | avaliacoes | Avaliacoes do usuario | NAO ENCONTRADO NO CODIGO | ativo |
| Tempo Avaliacoes | `/avaliacoes/tempo-avaliacoes` | `src/modules/avaliacoes/pages/avaliacoes_tempoAvaliacoesPage.tsx` | avaliacoes | Tempo e eventos de resposta | Supabase direto | ativo |
| Leads | `/leads` | `src/pages/LeadsPage.tsx` | leads | Gerenciar leads | Supabase direto | ativo/arquivo grande |
| Fila Leads | `/leads/fila` | `src/pages/FilaLeadsPage.tsx` | leads | Fila/gerenciador | Supabase direto | ativo |
| Propostas | varias `/propostas/*` | `src/modules/propostas/pages/*` | propostas | Proposta, setup, templates, produtos, preview | `propostasService`, Edge Functions | ativo |
| Tarefas | varias `/tarefas/*` | `src/modules/tarefas/pages/*` | tarefas | Dashboard, execucao, rotinas, agenda, historico, desempenho, relatorios, configuracoes | hooks/services `tarefas_*` | ativo/critico |
| Cadastros | `/cadastros/*` | `src/pages/*` | cadastros | Clientes, enderecos, setores, servicos | Supabase direto | ativo |
| Permissoes | `/configuracoes/permissoes` | `src/pages/PermissoesPage.tsx` | configuracoes | Grupos e permissoes | Supabase direto | ativo/critico |
| Assistente | `/assistente` | `src/pages/AssistentePage.tsx` | dashboards | Assistente de relatorios | `business-assistant` | ativo |

## 2. Telas duplicadas ou paralelas

| Tela | Arquivo | Similar a | Risco | Decisao recomendada |
|---|---|---|---|---|
| Fila Tarefas Leads | `src/pages/FilaTarefasLeadsPage.tsx` | `FilaLeadsPage.tsx` | arquivo possivelmente nao roteado | validar antes de usar/remover. |
| Dashboard Operacional KPI | `src/pages/DashboardOperacionalKPIPage.tsx` | `src/modules/tarefas/pages/tarefas_dashboardPage.tsx` | rota nao encontrada | validar se morto. |
| Auditoria | `PlaceholderPage` via `/auditoria` | auditoria real nao encontrada | usuario acha que existe tela | implementar com contrato ou remover menu. |
