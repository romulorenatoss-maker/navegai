# Navegai - Indice de Busca Rapida

## 1. Mapa rapido por palavra

| Termo do usuario | Modulo | Arquivos iniciais maximos |
|---|---|---|
| tarefa, execucao, executor, aprovador, auditor | Tarefas | `tarefas_execucaoPage.tsx`, `tarefas_fluxoExecutorPanel.tsx`, `tarefas_useFluxoTarefa.ts` |
| etapas, section_id, horario, finalizar etapa | Tarefas | `tarefas_fluxoExecutorPanel.tsx`, `tarefas_fluxoTypes.ts`, `tarefas_dynamicFieldRenderer.tsx` |
| anexo, evidencia, upload tarefa | Tarefas | `tarefas_dynamicFieldRenderer.tsx`, `tarefas_storage_service.ts`, `AnexoViewer.tsx` |
| enviar respostas ao aprovador | Tarefas | `tarefas_fluxoExecutorPanel.tsx`, `tarefas_useExecutorActions.ts`, `tarefas_fluxoRpcService.ts` |
| rotina, template tarefa, perguntas por etapa | Tarefas | `tarefas_rotinasPage.tsx`, `RotinasModal.tsx`, `rotinas_types.ts` |
| proposta, template, docx, produtos | Propostas | `PropostaConversacionalPage.tsx`, `propostasService.ts`, Edge `propostas-render-docx` |
| cliente, contato, responsavel | Cadastros/Propostas | `ClientesPage.tsx`, `ClienteContatosResponsaveis.tsx`, `propostasResponsaveisService.ts` |
| lead, fila, importador | Leads | `FilaLeadsPage.tsx`, `ImportadorLeadsPage.tsx`, `LeadsPage.tsx` |
| permissao, menu, acesso | Global | `AppSidebar.tsx`, `usePermissions.ts`, `screen-permissions.ts` |
| OS, avaliacao, pergunta avaliacao | Avaliacoes | `AvaliacaoOSPage.tsx`, `useAvaliacaoOS.ts`, `PerguntasPage.tsx` |

## 2. Comandos rapidos

- Listar rotas: abrir `src/App.tsx`.
- Listar menus: abrir `src/components/AppSidebar.tsx`.
- Tarefas fluxo: abrir `src/modules/tarefas/fluxo`.
- Propostas: abrir `src/modules/propostas`.
- Banco/RPC: buscar em `supabase/migrations`.

## 3. Limite padrao no modo rapido

Abrir no maximo 3 arquivos reais. Se o mapa nao bastar, registrar `MAPA INCOMPLETO` e pedir autorizacao.
