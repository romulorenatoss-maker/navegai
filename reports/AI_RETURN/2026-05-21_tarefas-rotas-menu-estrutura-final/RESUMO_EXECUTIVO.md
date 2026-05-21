# Tarefas - rotas, menu e estrutura final

## Objetivo

Limpar rotas, menu, imports e estrutura do modulo Tarefas, removendo o componente V2 e as rotas antigas funcionais.

## Rotas antes

- `/tarefas/rotinas`
- `/tarefas/minhas`
- `/tarefas/gestao`
- `/tarefas/avaliacao-avaliador/:id`
- `/tarefas/avaliacao`
- `/tarefas/aprovacao`
- `/tarefas/contingencias`
- `/tarefas/relatorios`
- `/tarefas/desempenho`
- `/tarefas/tempo-avaliacoes`
- redirects `/operacional/*`
- redirects `/checklists/*`

## Rotas depois

- `/tarefas`
- `/tarefas/dashboard`
- `/tarefas/lista`
- `/tarefas/detalhes/:id`
- `/tarefas/rotinas`
- `/tarefas/agendamentos`
- `/tarefas/execucao`
- `/tarefas/historico`
- `/tarefas/configuracoes`
- `/tarefas/desempenho`
- `/tarefas/relatorios`

## Menu antes

- Dash de Tarefas -> `/tarefas/gestao`
- Minhas Tarefas -> `/tarefas/minhas`
- Rotinas Operacionais -> `/tarefas/rotinas`
- Desempenho -> `/tarefas/desempenho`

## Menu depois

- Dashboard -> `/tarefas/dashboard`
- Lista -> `/tarefas/lista`
- Execucao -> `/tarefas/execucao`
- Rotinas -> `/tarefas/rotinas`
- Agenda -> `/tarefas/agendamentos`
- Historico -> `/tarefas/historico`
- Desempenho -> `/tarefas/desempenho`
- Relatorios -> `/tarefas/relatorios`
- Configuracoes -> `/tarefas/configuracoes`

## Arquivos apagados

- `src/modules/tarefas/components/responsaveis/TarefasResponsaveisV2.tsx`
- `src/modules/tarefas/components/tarefas_painelRetornoCard.tsx`
- `src/modules/tarefas/hooks/tarefas_useAssignmentExecution.ts`
- `src/modules/tarefas/docs/MOCKUP_FLUXO_RESPOSTAS.html`
- `src/modules/tarefas/docs/checklist_tarefas_fluxo_validacao.md`
- `src/modules/tarefas/docs/diff_tarefas_fluxo_rebuild.md`
- `src/modules/tarefas/docs/manifest_tarefas_fluxo_rebuild.json`
- `src/modules/tarefas/docs/rollback_tarefas_fluxo_rebuild.sql`
- `src/modules/tarefas/docs/tarefas_arquivos_deprecated.md`

## Arquivos criados

- `src/modules/tarefas/pages/tarefas_agendamentosPage.tsx`
- `src/modules/tarefas/pages/tarefas_configuracoesPage.tsx`
- `src/modules/tarefas/pages/tarefas_historicoPage.tsx`
- `src/modules/tarefas/routes/tarefas_routes.ts`
- `src/modules/tarefas/permissions/tarefas_permissions.ts`
- `src/modules/tarefas/api/.gitkeep`
- `src/modules/tarefas/validations/.gitkeep`

## Arquivos renomeados

- `src/modules/tarefas/pages/tarefas_gestaoPage.tsx` -> `src/modules/tarefas/pages/tarefas_dashboardPage.tsx`
- `src/modules/tarefas/pages/tarefas_minhasTarefasPage.tsx` -> `src/modules/tarefas/pages/tarefas_execucaoPage.tsx`

## Validacao

- `npm run build`: passou.
- `npm run lint`: executado, falhou por erros globais preexistentes do projeto. Log completo em `LINT.log`.
- `git diff --check`: passou, apenas avisos normais de LF/CRLF no Windows.
- Grep final funcional: `ZERO_REFERENCIAS_FUNCIONAIS`.

