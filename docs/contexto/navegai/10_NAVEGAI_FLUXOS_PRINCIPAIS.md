# Navegai - Fluxos Principais

## 1. Tarefas - executor/aprovador/auditor

1. Template/rotina criado em `operational_templates`, fields e sections.
2. Assignment gerado em `operational_assignments`.
3. Executor abre `/tarefas/execucao`.
4. Drawer executor carrega perguntas e respostas.
5. Executor inicia etapa via `tarefas_rpc_executor_iniciar_etapa`; o banco grava inicio, atraso e usuario.
6. Executor responde campos e anexa evidencias; autosave usa `tarefas_rpc_executor_autosalvar_respostas`.
7. Executor finaliza etapa via `tarefas_rpc_executor_finalizar_etapa`; o banco grava fim, duracao e atraso.
8. Executor envia respostas via `tarefas_rpc_executor_enviar_respostas`.
9. Aprovador avalia, aprova ou cria plano.
10. Auditor finaliza auditoria ou devolve plano.
11. Historico/dashboard refletem status.

Regra por etapas atual: `operational_assignment_stage_runs` e fonte do inicio/fim/duracao. Proxima etapa libera somente quando a anterior esta `concluida` nessa tabela.

## 2. Propostas

1. Usuario configura produtos/templates/perguntas.
2. Conversa ou formulario cria contexto/itens.
3. `propostas_conversacional` e services geram estrutura.
4. Proposta salva em `propostas_propostas` e itens em `propostas_itens`.
5. Preview/render usa templates e Edge Functions.
6. Historico registra eventos.

## 3. Avaliacoes/OS

1. OS criada/buscada em `/avaliacoes/pesquisa`.
2. Perguntas carregadas por servico/tipo/checklist.
3. Avaliador responde.
4. Respostas gravadas em `respostas_avaliacao`.
5. Nota/conclusao atualiza OS/avaliacao.
6. Inconsistencias podem ser detectadas e vinculadas.

## 4. Leads

1. Lead entra por importador/manual.
2. Fila/tarefas de contato guiam atendimento.
3. Interacoes e historico sao gravados.
4. Dashboards e relatorios leem funil.

## 5. Fluxo reverso

Para qualquer alteracao critica, mapear como desfazer: revert de commit, rollback SQL quando houver migration, e reprocessar estado quando trigger/RPC afetar status.
