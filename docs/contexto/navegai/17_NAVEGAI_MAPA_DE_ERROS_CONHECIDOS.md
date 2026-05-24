# Navegai - Mapa de Erros Conhecidos

## 1. Erros conhecidos/recorrentes

| Erro/sintoma | Modulo | Possivel causa | Onde olhar |
|---|---|---|---|
| Anexo carregado nao aparece | Tarefas | Renderer esconde evidencia se regra ativa nao exige evidencia | `tarefas_dynamicFieldRenderer.tsx`, `AnexoViewer.tsx` |
| Etapa 2 libera cedo | Tarefas | Uso de preenchimento em vez de etapa concluida | `tarefas_fluxoExecutorPanel.tsx` |
| Envio ao aprovador bloqueado | Tarefas | Obrigatorias/evidencias incompletas ou etapa nao concluida | `tarefas_fluxoExecutorPanel.tsx`, RPC executor |
| Permissao de menu some | Global | `canViewPath`/`allowedScreens` | `AppSidebar.tsx`, `usePermissions.ts` |
| Render proposta falha | Propostas | Template/tokens/Edge Function | `propostas-render-docx`, `propostasService.ts` |

## 2. Mensagens nao encontradas

- NAO ENCONTRADO NO CODIGO: catalogo completo de mensagens de erro.
