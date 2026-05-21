# MEMORIA MESTRA DO PROJETO

Este arquivo e a fonte de verdade principal do projeto Navegai.

Nenhuma outra memoria pode contradizer este arquivo.

## Projeto

- Nome: Navegai.
- Stack: Vite, React 18, TypeScript, Tailwind CSS, shadcn/ui, Radix UI, React Query e Supabase.
- Backend: Supabase Auth, Postgres, RLS, migrations SQL e Edge Functions.
- Entrada principal: `src/main.tsx`, `src/App.tsx`.
- Layout autenticado: `src/components/AppLayout.tsx`, `src/components/AppSidebar.tsx`, `src/components/ProtectedRoute.tsx`.
- Supabase client: `src/integrations/supabase/client.ts`.

## Modulos oficiais

- Avaliacoes/OS: criacao/busca de OS, perguntas, minhas avaliacoes, tempo de avaliacoes, dashboards e relatorios.
- Tarefas: rotinas, minhas tarefas, gestao, desempenho, relatorios, execucao, aprovacao, auditoria, contingencias, anexos e planos de acao.
- Leads: fila, tarefas de contato, importador, campanhas, objecoes, dashboards, rotinas, arquivados e relatorios.
- Propostas: criacao, conversa, setup, templates, produtos, historico, preview, renderizacao e IA.
- Cadastros: setores, colaboradores/avaliadores, clientes, servicos, enderecos e perguntas.
- Configuracoes: permissoes, integracoes, sessoes, MFA e armazenamento.
- Assistente: pagina de assistente de negocio via Edge Function.

## Menus oficiais

Definidos em `src/components/AppSidebar.tsx`:

- Dashboards: Dashboard OS, Dashboard de Leads, Dashboard Vendas, Assistente Navi.
- Propostas: Nova Proposta, Templates, Produtos, Historico.
- Avaliacoes: Criar OS / Buscar, Minhas Avaliacoes, Tempo de Avaliacoes.
- Leads: Gerenciador de Leads, Leads Arquivados, Importador, Gerenciamento, Campanhas, Meus Leads, Rotina de Tentativas.
- Tarefas: Dash de Tarefas, Minhas Tarefas, Rotinas Operacionais, Desempenho.
- Cadastros: Tipos de Servico, Perguntas, Objecoes, Clientes, Enderecos.
- Configuracoes: Configuracoes.
- Relatorios: Relatorios de OS, Relatorio de Tarefas, Relatorios de Leads.

## Rotas oficiais principais

Definidas em `src/App.tsx`:

- `/login`
- `/`
- `/avaliacoes/pesquisa`, `/avaliacoes/perguntas`, `/avaliacoes/minhas`, `/avaliacoes/tempo-avaliacoes`
- `/tarefas/rotinas`, `/tarefas/minhas`, `/tarefas/gestao`, `/tarefas/relatorios`, `/tarefas/desempenho`
- `/cadastros/setores`, `/cadastros/avaliadores`, `/cadastros/colaboradores`, `/cadastros/clientes`, `/cadastros/servicos`, `/cadastros/enderecos`
- `/relatorios`, `/relatorios/tarefas`
- `/leads`, `/leads/fila`, `/leads/fila-tarefas`, `/leads/arquivados`, `/leads/dashboard`, `/leads/dashboard-vendas`, `/leads/rotina`, `/leads/importador`, `/leads/gerenciamento`, `/leads/campanhas`, `/leads/objecoes`, `/leads/relatorios`
- `/assistente`
- `/propostas`, `/propostas/nova`, `/propostas/setup`, `/propostas/conversa`, `/propostas/dados-render`, `/propostas/perguntas`, `/propostas/:id/preview`, `/propostas/:id`, `/propostas/templates`, `/propostas/produtos`, `/propostas/produtos/grid`
- `/auditoria`, `/configuracoes`, `/configuracoes/permissoes`, `/configuracoes/integracoes`

## Tarefas - decisao oficial atual

- `/tarefas/minhas` deve renderizar o fluxo principal apenas via `src/modules/tarefas/fluxo`.
- Drawer oficial: executor usa `FluxoExecutorPanel`, aprovador usa `FluxoAprovadorPanel`, auditor usa `FluxoAuditorPanel`.
- `tarefas_minhasTarefasPage.tsx` nao deve voltar a usar diretamente `useAssignmentExecution`, `usePlanosAcao`, `DrawerActionRouter`, `DynamicFieldRenderer`, `ExecutorPlanoAprovadorCard` ou `EmbeddedReviewPanel` para executor/aprovador/auditor.
- R0 do executor vive em `operational_field_answers` e nao pode sofrer overwrite depois do envio inicial.
- Devolucoes usam RPCs de plano, nao reenvio de R0.

Arquivo detalhado: `docs/AI/FLUXOS_OFICIAIS/tarefas_fluxo_executor_aprovador_auditor.md`.

## Tabelas conhecidas

- Core/auth: `profiles`, `user_roles`, `sessoes_usuario`, `audit_logs`, `screen_permissions`.
- Cadastros: `setores`, `colaborador_setores`, `clientes`, `cliente_contatos`, `cliente_responsaveis`, `cidades`, `bairros`, `ruas`, `planos`.
- Tarefas: `operational_templates`, `operational_template_sections`, `operational_template_fields`, `operational_assignments`, `operational_field_answers`, `operational_execution_logs`, `operational_assignment_history`, `operational_audit_trail`, `operational_contingencies`, `operational_action_plans`, `tarefas_anexos`, `tarefas_ada_config`, `tarefas_pontuacao_config`, `tarefas_planos_acao_aprovador`, `tarefas_planos_acao_auditor`.
- Tabelas legadas de tarefas ainda existentes podem aparecer no historico, mas nao sao fonte oficial do fluxo executor/aprovador/auditor.
- Propostas: `propostas_produtos`, `propostas_templates`, `propostas_propostas`, `propostas_itens`, `propostas_historico`, `propostas_setup_respostas`, `propostas_rascunhos_conversa`, `propostas_fluxo`, `propostas_empresa_contexto`.

## RPCs oficiais de tarefas fluxo

- `tarefas_rpc_executor_enviar_respostas`
- `tarefas_rpc_executor_responder_plano_aprovador`
- `tarefas_rpc_aprovador_criar_plano_executor`
- `tarefas_rpc_aprovador_aprovar_para_auditoria`
- `tarefas_rpc_aprovador_responder_plano_auditor`
- `tarefas_rpc_auditor_criar_plano_aprovador`
- `tarefas_rpc_auditor_aprovar_auditoria`

## Permissoes

- Autenticacao central via `AuthProvider` e `ProtectedRoute`.
- Menu filtra rotas por admin, `allowedScreens` ou `canViewPath`.
- Permissoes efetivas carregadas por `usePermissions` via RPC `get_user_effective_permissions`.
- Banco usa RLS nas tabelas operacionais.

## Itens legados removidos da memoria ativa

- `docs/MEMORIA_PROJETO_CODEX.md`
- `docs/ULTIMA_ALTERACAO_CODEX.md`
- `docs/PADRAO_ARQUITETURA_E_GOVERNANCA.md`
- `docs/ARQUITETURA_PADRAO.md`

Conteudo util desses arquivos foi consolidado em `docs/AI/`.

## Pendencias conhecidas

- Aplicar no Supabase/Lovable a migration `supabase/migrations/20260521003000_tarefas_bloquear_reenvio_r0_fluxo.sql`, caso ainda nao tenha sido aplicada.
- Rodar checklist manual do fluxo tarefas no preview Lovable com usuarios executor, aprovador e auditor.
- `npm audit` precisa revisao separada antes de aplicar correcoes automaticas.
- Existem lockfiles `package-lock.json`, `bun.lock` e `bun.lockb`; instalacao validada foi com npm.
- Ha textos com mojibake em arquivos antigos; corrigir apenas se fizer parte do escopo.
