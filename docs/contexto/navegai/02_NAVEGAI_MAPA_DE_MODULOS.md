# Navegai - Mapa de Modulos

## 1. Lista de modulos oficiais

| Modulo | Menu principal | Objetivo | Dono da regra | Status | Feature flag | Observacao |
|---|---|---|---|---|---|---|
| Tarefas | Tarefas | Rotinas, execucao, aprovacao, auditoria e relatorios operacionais | `src/modules/tarefas` | Ativo | Permissoes por tela/action | Modulo mais sensivel atualmente |
| Propostas | Propostas | Gerar propostas, templates, produtos, conversa IA, render DOCX | `src/modules/propostas` | Ativo | Admin em setup | Usa Edge Functions |
| Avaliacoes/OS | Avaliacoes | Criar OS, responder perguntas, medir desempenho | `src/pages`, `src/hooks/useAvaliacaoOS.ts` | Ativo legado | Roles admin/avaliador | Tabelas historicas |
| Leads | Leads | Captacao, fila, importacao, campanhas, objecoes | `src/pages` | Ativo legado | Permissoes de telas | Muito acesso direto ao banco |
| Cadastros | Cadastros | Clientes, enderecos, setores, colaboradores, servicos | `src/pages` | Ativo | Admin/gestores | Compartilhado por OS/leads/propostas |
| Configuracoes | Configuracoes | Permissoes, integracoes e ajustes | `src/pages` | Ativo | Admin | Pode afetar acesso global |

## 2. Contrato por modulo

### Modulo: Tarefas

- Rotas: `/tarefas`, `/tarefas/dashboard`, `/tarefas/execucao`, `/tarefas/rotinas`, `/tarefas/agendamentos`, `/tarefas/historico`, `/tarefas/configuracoes`, `/tarefas/desempenho`, `/tarefas/relatorios`.
- Pages: `src/modules/tarefas/pages/*`.
- Fluxo critico: executor responde -> aprovador avalia/cria plano -> auditor aprova/gera plano -> historico/dashboard.
- RPCs: `tarefas_rpc_executor_enviar_respostas`, `tarefas_rpc_aprovador_*`, `tarefas_rpc_auditor_*`.
- Tabelas: `operational_assignments`, `operational_templates`, `operational_template_fields`, `operational_template_sections`, `operational_field_answers`, `operational_assignment_history`, `operational_contingencies`, `tarefas_planos_acao_aprovador`, `tarefas_planos_acao_auditor`.
- NAO pode fazer: alterar aprovador/auditor quando pedido for executor; criar persistencia de tempo por etapa sem autorizacao.

### Modulo: Propostas

- Rotas: `/propostas`, `/propostas/nova`, `/propostas/setup`, `/propostas/conversa`, `/propostas/dados-render`, `/propostas/perguntas`, `/propostas/templates`, `/propostas/produtos`, `/propostas/produtos/grid`, `/propostas/:id`.
- Pages: `src/modules/propostas/pages/*`.
- Services: `src/modules/propostas/services/*`.
- Edge Functions: `propostas-*`, `preview-proposta`.
- Tabelas: `propostas_propostas`, `propostas_itens`, `propostas_produtos`, `propostas_templates`, `propostas_historico`, `propostas_fluxo`, `propostas_perguntas_setup`.

### Modulo: Avaliacoes/OS

- Rotas: `/avaliacoes/pesquisa`, `/avaliacoes/perguntas`, `/avaliacoes/minhas`, `/avaliacoes/tempo-avaliacoes`.
- Hooks principais: `useAvaliacaoOS`, `useInconsistencyDetection`, `useNotasPorSetor`.
- Tabelas: `ordens_servico`, `avaliacoes`, `respostas_avaliacao`, `perguntas_avaliacao`, `avaliacoes_inconsistencias`.

### Modulo: Leads

- Rotas: `/leads`, `/leads/fila`, `/leads/importador`, `/leads/dashboard`, `/leads/dashboard-vendas`, `/leads/gerenciamento`, `/leads/campanhas`, `/leads/objecoes`, `/leads/relatorios`.
- Tabelas: `leads`, `lead_contatos`, `lead_interacoes`, `lead_historico`, `lead_tarefas_contato`, `campanhas`, `lead_objecoes`.

## 3. Modulos suspeitos, duplicados ou sem dono

| Item | Tipo | Caminho | Motivo | Acao recomendada |
|---|---|---|---|---|
| Pages legadas fora de `src/modules` | Organizacao | `src/pages/*` | Avaliacoes/leads/cadastros ainda nao modularizados | Nao mover sem plano |
| `reports/AI_RETURN` | Artefatos | `reports/AI_RETURN/*` | Muitos retornos/diffs anteriores | Nao usar como fonte sem validar codigo |
| `docs/AI` | Memoria antiga | `docs/AI/*` | Regras antigas podem conflitar | Usar `docs/contexto/navegai` como fonte atual |
