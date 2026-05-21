# MEMORIA DO PROJETO CODEX

Atualizado em: 2026-05-21

## Objetivo

Mapa operacional do projeto Navegai para reduzir releituras amplas e orientar alteracoes cirurgicas.

## Stack

- Frontend: Vite, React 18, TypeScript, Tailwind CSS, shadcn/ui, Radix UI, lucide-react.
- Estado/dados: React Query e Supabase JS.
- Backend: Supabase Auth, Postgres, RLS, migrations SQL e Edge Functions.
- Testes/config: Vitest, Playwright config Lovable, ESLint.
- Entrada principal: `src/main.tsx`, `src/App.tsx`.
- Layout autenticado: `src/components/AppLayout.tsx`, `src/components/AppSidebar.tsx`, `src/components/ProtectedRoute.tsx`.
- Supabase client: `src/integrations/supabase/client.ts`.

## Modulos existentes

- Avaliacoes/OS: criacao/busca de OS, perguntas, minhas avaliacoes, tempo de avaliacoes, dashboards e relatorios.
- Tarefas: rotinas, minhas tarefas, gestao, desempenho, relatorios, execucao, aprovacao, auditoria, contingencias, anexos, planos de acao.
- Leads: fila, tarefas de contato, importador, campanhas, objecoes, dashboards, rotinas, arquivados, relatorios.
- Propostas: criacao, conversa, setup, templates, produtos, historico, preview, renderizacao e IA.
- Cadastros: setores, colaboradores/avaliadores, clientes, servicos, enderecos, perguntas.
- Configuracoes: permissoes, integracoes, sessoes, MFA, armazenamento.
- Assistente: pagina de assistente de negocio via Edge Function.

## Menus principais

Definidos em `src/components/AppSidebar.tsx`:

- Dashboards: Dashboard OS, Dashboard de Leads, Dashboard Vendas, Assistente Navi.
- Propostas: Nova Proposta, Templates, Produtos, Historico.
- Avaliacoes: Criar OS / Buscar, Minhas Avaliacoes, Tempo de Avaliacoes.
- Leads: Gerenciador de Leads, Leads Arquivados, Importador, Gerenciamento, Campanhas, Meus Leads, Rotina de Tentativas.
- Tarefas: Dash de Tarefas, Minhas Tarefas, Rotinas Operacionais, Desempenho.
- Cadastros: Tipos de Servico, Perguntas, Objecoes, Clientes, Enderecos.
- Configuracoes: Configuracoes.
- Relatorios: Relatorios de OS, Relatorio de Tarefas, Relatorios de Leads.

## Rotas principais

Definidas em `src/App.tsx`:

- `/login`
- `/`
- `/avaliacoes/pesquisa`, `/avaliacoes/perguntas`, `/avaliacoes/minhas`, `/avaliacoes/tempo-avaliacoes`
- `/tarefas/rotinas`, `/tarefas/minhas`, `/tarefas/gestao`, `/tarefas/relatorios`, `/tarefas/desempenho`
- Redirects legados: `/operacional/*`, `/checklists/*`, `/tarefas/avaliacao`, `/tarefas/aprovacao`, `/tarefas/contingencias`
- `/cadastros/setores`, `/cadastros/avaliadores`, `/cadastros/colaboradores`, `/cadastros/clientes`, `/cadastros/servicos`, `/cadastros/enderecos`
- `/relatorios`, `/relatorios/tarefas`
- `/leads`, `/leads/fila`, `/leads/fila-tarefas`, `/leads/arquivados`, `/leads/dashboard`, `/leads/dashboard-vendas`, `/leads/rotina`, `/leads/importador`, `/leads/gerenciamento`, `/leads/campanhas`, `/leads/objecoes`, `/leads/relatorios`
- `/desempenho`, `/desempenho/operacional`, `/desempenho/tempo-avaliacoes`
- `/assistente`
- `/propostas`, `/propostas/nova`, `/propostas/setup`, `/propostas/conversa`, `/propostas/dados-render`, `/propostas/perguntas`, `/propostas/:id/preview`, `/propostas/:id`, `/propostas/templates`, `/propostas/produtos`, `/propostas/produtos/grid`
- `/auditoria`, `/configuracoes`, `/configuracoes/permissoes`, `/configuracoes/integracoes`

## Componentes principais

- Layout/permissao: `AppLayout`, `AppSidebar`, `ProtectedRoute`, `NavLink`.
- UI base: `src/components/ui/*`.
- Auth/sessao: `AuthContext`, `MfaEnrollSection`, `MfaVerifyDialog`, `SessoesUsuarioTab`.
- Tarefas: componentes em `src/modules/tarefas/components/*`, paineis em `components/painels/*`, rotinas em `components/rotinas/*`.
- Propostas: `PropostaEditorVisual`, `FluxoPropostaBuilder`, `PerguntaGuiadaPanel`, `PropostaPlaceholderModal`.
- Importacao/leads: `ColumnMapper`, `ImportPreviewTable`, dialogs de leads.

## Hooks principais

- Globais: `useAvaliacaoOS`, `usePermissions`, `useSessionTracker`, `usePendingNotifications`, `useNotasPorSetor`, hooks realtime.
- Tarefas: `tarefas_useAccess`, `tarefas_useApprovalFlow`, `tarefas_useAssignmentExecution`, `tarefas_useAssignmentReview`, `tarefas_useAuditFlow`, `tarefas_useContingencyManagement`, `tarefas_useDashboard`, `tarefas_useFlowPermissions`, `tarefas_usePlanosAcao`, `tarefas_useRealtime`, `tarefas_useScoring`, `tarefas_useTransition`.
- Propostas: `usePlaceholderData`.

## Services principais

- Tarefas: `tarefas_service`, `tarefas_rbac`, `tarefas_canTransition`, `tarefas_audit`, `tarefas_messagesService`, `tarefas_storage_service`, `tarefas_pontuacao_config_service`, `tarefas_systemLogger`.
- Propostas: `propostasService`, `propostasContextoService`, `propostasFluxoService`, `propostasIAService`, `propostasPerguntasService`, `propostasRascunhoService`, `propostasResponsaveisService`.
- Utils relevantes: `calculate-average`, `export-os-pdf`, `lead-task-utils`, `logRespostaEvento`, `screen-permissions`.

## Tabelas conhecidas

Identificadas por migrations e uso no frontend:

- Core/auth: `profiles`, `user_roles`, `sessoes_usuario`, `audit_logs`, `screen_permissions`.
- Avaliacoes/OS: `ordens_servico`, `avaliacoes`, `respostas_avaliacao`, `perguntas_avaliacao`, `tipos_avaliacao`, `tipos_servico`, `os_perguntas`, `avaliacoes_inconsistencias`, `inconsistencias_vinculadas`.
- Cadastros: `setores`, `colaborador_setores`, `clientes`, `cliente_contatos`, `cliente_responsaveis`, `cidades`, `bairros`, `ruas`, `planos`.
- Leads: `leads`, `lead_contatos`, `lead_historico`, `lead_interacoes`, `lead_tarefas_contato`, `rotina_tentativas_leads`, `cadencia_tentativas`, `campanhas`, `registro_objecao_lead`, `registro_atraso_tentativa`.
- Tarefas: `operational_templates`, `operational_template_sections`, `operational_template_fields`, `operational_assignments`, `operational_field_answers`, `operational_field_reviews`, `operational_approval_answers`, `operational_execution_logs`, `operational_execution_step_logs`, `operational_execution_check_answers`, `operational_assignment_history`, `operational_audit_trail`, `operational_contingencies`, `operational_contingency_resolution_logs`, `operational_score_logs`, `operational_score_overrides`, `operational_action_plans`, `operational_audit_answers`, `operational_audit_overrides`, `operational_sla_pausas`, `tarefas_anexos`, `tarefas_ada_config`, `tarefas_pontuacao_config`, `tarefas_planos_acao_aprovador`, `tarefas_planos_acao_auditor`.
- Propostas: `propostas_produtos`, `propostas_templates`, `propostas_propostas`, `propostas_itens`, `propostas_historico`, `propostas_setup_respostas`, `propostas_rascunhos_conversa`, `propostas_fluxo`, `propostas_empresa_contexto`, `propostas_perguntas_produtos`, `propostas_pergunta_produto_link`, `propostas_categorias_setup`, `propostas_perguntas_setup`, `propostas_ajustes_ia`.

## RPCs conhecidas

- Permissao/auth: `has_role`, `is_admin`, `sync_user_role`, `get_user_effective_permissions`.
- Dashboards/avaliacoes: `calcular_notas_por_setor`, `dashboard_metricas_agregadas`.
- Propostas: `propostas_categoria_em_uso`.
- Tarefas planos de acao: `tarefas_rpc_aprovador_criar_plano_acao`, `tarefas_rpc_executor_responder_plano_aprovador`, `tarefas_rpc_auditor_criar_plano_acao`, `tarefas_rpc_aprovador_responder_plano_auditor`.
- Tarefas rotinas: `fn_gerar_ada_assignment`.

## Triggers conhecidas

- Gerais: `update_updated_at_column`, triggers de `updated_at` em tabelas principais.
- Auth: `on_auth_user_created`, `trg_sync_admin_setor_membership`.
- Avaliacoes/OS: `trg_check_os_completion`, `on_avaliacao_update`, `on_avaliacao_insert`.
- Tarefas: triggers de pontuacao, ADA, anexos, responsavel de contingencia, status apos planos de acao.
- Planos de acao: `tarefas_trigger_status_apos_aprovador_criar_plano`, `tarefas_trigger_status_apos_executor_responder_plano`, `tarefas_trigger_status_apos_auditor_criar_plano`, `tarefas_trigger_status_apos_aprovador_responder_plano_auditor`.
- Propostas: `trg_propostas_perguntas_validate_tipo`.

## Permissoes

- Autenticacao central via `AuthProvider` e `ProtectedRoute`.
- Menu filtra rotas por admin, `allowedScreens` ou `canViewPath`.
- Permissoes efetivas carregadas por `usePermissions` via RPC `get_user_effective_permissions`.
- Banco usa RLS em tabelas operacionais; regras de tenant/perfil aparecem nas migrations, principalmente tarefas e planos de acao.

## Regras de negocio principais

- O padrao global obrigatorio do projeto esta em `docs/PADRAO_ARQUITETURA_E_GOVERNANCA.md`.
- Cada item de menu pertence a um modulo oficial do sistema; modulo deve ter estrutura propria e nomenclatura explicita.
- Regras criticas devem ficar em service, RPC, trigger, RLS ou camada central, nao apenas em componente.
- Historico de respostas, aprovacoes, reprovacoes, auditorias e planos de acao deve ser imutavel quando validado.
- Tarefas centraliza fluxo em `/tarefas/minhas` com chips/query params para avaliacao, aprovacao e contingencias.
- Rotas legadas de operacional/checklists redirecionam para o modulo tarefas atual.
- Planos de acao de aprovador e auditor sao separados por tabela/RPC/trigger.
- Propostas e tarefas usam services/modulos dedicados; evitar duplicar hooks/services/telas.

## Arquivos criticos

- `package.json`, `package-lock.json`, `bun.lock`, `vite.config.ts`, `tsconfig*.json`
- `src/App.tsx`
- `src/components/AppLayout.tsx`, `src/components/AppSidebar.tsx`, `src/components/ProtectedRoute.tsx`
- `src/contexts/AuthContext.tsx`
- `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`
- `src/modules/tarefas/**`
- `src/modules/propostas/**`
- `supabase/migrations/**`
- `supabase/functions/**`

## Ultima alteracao relevante

- 2026-05-21: adicionado `docs/PADRAO_ARQUITETURA_E_GOVERNANCA.md` como regra obrigatoria do repo; mantido ajuste de `package-lock.json` sincronizado e `.tools/` no `.gitignore`.

## Pendencias conhecidas

- `npm audit` reportou 20 vulnerabilidades (3 low, 7 moderate, 10 high); precisa revisao separada antes de aplicar `audit fix`.
- O projeto possui `.env` versionado com chave anon publishable do Supabase; nao foi alterado nesta intervencao.
- Existem lockfiles `package-lock.json`, `bun.lock` e `bun.lockb`; a instalacao validada foi com npm.
- Arquivos e comentarios apresentam sinais de mojibake em alguns textos; nao foi corrigido por estar fora do escopo.
