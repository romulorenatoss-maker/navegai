# Navegai - Mapa de Modulos

## 1. Lista de modulos oficiais

| Modulo | Menu principal | Objetivo | Dono da regra | Status | Feature flag | Observacao |
|---|---|---|---|---|---|---|
| dashboards | Dashboards | Visao executiva OS/leads/vendas/assistente | `src/pages/*Dashboard*`, `src/components/assistente` | ativo | NAO ENCONTRADO NO CODIGO | Consulta Supabase direto em paginas. |
| propostas | Propostas | Criar, renderizar, importar templates e gerenciar propostas | `src/modules/propostas`, `supabase/functions/propostas-*` | ativo | NAO ENCONTRADO NO CODIGO | Modulo isolado. |
| avaliacoes | Avaliacoes | Criar OS, responder avaliacoes, perguntas e metricas | `src/pages/AvaliacaoOSPage.tsx`, `src/modules/avaliacoes` | ativo | NAO ENCONTRADO NO CODIGO | Parte ainda em paginas legadas. |
| leads | Leads | Captacao, funil, importacao, campanhas, objecoes | `src/pages/*Leads*`, `LeadPostCaptureDialog` | ativo | NAO ENCONTRADO NO CODIGO | Arquivos grandes e regra no frontend. |
| tarefas | Tarefas | Rotinas, execucao, aprovacao, auditoria, anexos, desempenho | `src/modules/tarefas`, migrations `tarefas_*` | critico | NAO ENCONTRADO NO CODIGO | Melhor modularizado; nao duplicar fluxo. |
| cadastros | Cadastros | Dados base: clientes, enderecos, setores, servicos, perguntas | `src/pages/*`, `src/components/clientes` | ativo | NAO ENCONTRADO NO CODIGO | Operacoes diretas em tabelas. |
| configuracoes | Configuracoes | Permissoes, integracoes, sessoes, MFA/admin | `src/pages/PermissoesPage.tsx`, `src/components/*Mfa*` | critico | NAO ENCONTRADO NO CODIGO | Mexe em permissoes e usuarios. |
| relatorios | Relatorios | Relatorios OS/leads/tarefas | `src/pages/Relatorios*`, `src/modules/tarefas/pages/tarefas_relatoriosPage.tsx` | ativo | NAO ENCONTRADO NO CODIGO | Exportacao deve ser auditada. |

## 2. Contrato por modulo

### Modulo: tarefas

- Objetivo: operacionalizar rotinas/tarefas com executor, aprovador, auditor, planos, anexos e desempenho.
- Rotas: `/tarefas`, `/tarefas/dashboard`, `/tarefas/detalhes/:id`, `/tarefas/rotinas`, `/tarefas/agendamentos`, `/tarefas/execucao`, `/tarefas/historico`, `/tarefas/configuracoes`, `/tarefas/desempenho`, `/tarefas/relatorios`.
- Telas: `src/modules/tarefas/pages/*`.
- Components: `src/modules/tarefas/components/*` e `src/modules/tarefas/fluxo/components/*`.
- Hooks: `src/modules/tarefas/hooks/*` e `src/modules/tarefas/fluxo/hooks/*`.
- Services: `src/modules/tarefas/services/*` e `src/modules/tarefas/fluxo/services/*`.
- APIs/RPCs: `tarefas_rpc_executor_enviar_respostas`, `tarefas_rpc_aprovador_*`, `tarefas_rpc_auditor_*`, storage functions `tarefas-storage-*`.
- Tabelas: `operational_*`, `tarefas_planos_acao_*`, `tarefas_anexos`, `profiles`, `setores`.
- Riscos: fluxo critico, historico de rebuild, triggers e RPCs repetidas em migrations.

### Modulo: propostas

- Objetivo: criar proposta, importar template DOCX, detectar produtos, gerar contexto e renderizar documentos.
- Rotas: `/propostas`, `/propostas/nova`, `/propostas/setup`, `/propostas/conversa`, `/propostas/dados-render`, `/propostas/perguntas`, `/propostas/:id/preview`, `/propostas/templates`, `/propostas/produtos`, `/propostas/produtos/grid`.
- Telas/components/hooks/services: `src/modules/propostas/*`.
- APIs/Edge Functions: `propostas-*`, `preview-proposta`.
- Tabelas: `propostas_*`, `clientes`.
- Storage: `propostas-templates`.
- Riscos: CloudConvert, IA externa, DOCX/PDF, secrets.

### Modulo: avaliacoes

- Objetivo: OS, avaliacao, perguntas, inconsistencias e tempo de avaliacao.
- Arquivos: `src/pages/AvaliacaoOSPage.tsx`, `PerguntasPage.tsx`, `MinhasAvaliacoesPage.tsx`, `src/modules/avaliacoes/pages/avaliacoes_tempoAvaliacoesPage.tsx`.
- Tabelas: `ordens_servico`, `avaliacoes`, `respostas_avaliacao`, `perguntas_avaliacao`, `checklists`, `inconsistencias_*`.
- Riscos: muitos inserts/updates diretos do frontend.

### Modulos suspeitos, duplicados ou sem dono

| Item | Tipo | Caminho | Motivo | Acao recomendada |
|---|---|---|---|---|
| `src/pages/FilaTarefasLeadsPage.tsx` | pagina | `src/pages` | existe arquivo, mas rota usa `FilaLeadsPage` em `/leads/fila-tarefas` | validar uso antes de remover. |
| `src/pages/DashboardOperacionalKPIPage.tsx` | pagina | `src/pages` | arquivo existe, rota nao encontrada em `App.tsx` | validar se morto. |
| `/auditoria` | rota placeholder | `src/App.tsx` | usa `PlaceholderPage` | implementar ou documentar como pendente. |
