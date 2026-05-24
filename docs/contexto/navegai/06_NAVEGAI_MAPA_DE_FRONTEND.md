# Navegai - Mapa de Frontend

## 1. Estrutura frontend

| Caminho | Tipo | Modulo | Responsabilidade | Status |
|---|---|---|---|---|
| `src/App.tsx` | roteador | geral | Define rotas e providers | ativo |
| `src/components/AppLayout.tsx` | layout | geral | Layout protegido | ativo |
| `src/components/AppSidebar.tsx` | menu | geral | Menu por permissoes | ativo |
| `src/components/ui/*` | UI kit | geral | shadcn/Radix | ativo |
| `src/pages/*` | paginas legadas | avaliacoes/leads/cadastros/config | Telas fora de modulo | ativo |
| `src/modules/tarefas/*` | modulo | tarefas | Pages, components, hooks, services, permissions, routes | ativo/critico |
| `src/modules/propostas/*` | modulo | propostas | Pages, components, services, utils | ativo |
| `src/modules/avaliacoes/*` | modulo parcial | avaliacoes | Tempo de avaliacoes | ativo |
| `src/hooks/*` | hooks compartilhados | geral | Permissoes, realtime, notificacoes, avaliacoes | ativo |
| `src/lib/*` | utilitarios | geral | PDF, score, permissao, telefone, logs | ativo |

## 2. Pages principais

| Page | Rota | Modulo | Observacao |
|---|---|---|---|
| `DashboardPage.tsx` | `/` | dashboards | consulta Supabase direto |
| `AvaliacaoOSPage.tsx` | `/avaliacoes/pesquisa` | avaliacoes | arquivo critico/grande |
| `LeadsPage.tsx` | `/leads` | leads | arquivo critico/grande |
| `PermissoesPage.tsx` | `/configuracoes/permissoes` | configuracoes | altera permissoes |
| `tarefas_execucaoPage.tsx` | `/tarefas/execucao` | tarefas | fluxo operacional |
| `TemplateImportPage.tsx` | `/propostas/templates` | propostas | DOCX/PDF/storage |

## 3. Hooks

| Hook | Arquivo | Modulo | Status |
|---|---|---|---|
| `usePermissions` | `src/hooks/usePermissions.ts` | configuracoes | usa RPC `get_user_effective_permissions` |
| `useAvaliacaoOS` | `src/hooks/useAvaliacaoOS.ts` | avaliacoes | usa respostas/avaliacao |
| `useOperationalDashboard` | `src/modules/tarefas/hooks/tarefas_useDashboard.ts` | tarefas | dashboard tarefas |
| `useOperationalTransition` | `src/modules/tarefas/hooks/tarefas_useTransition.ts` | tarefas | transicoes |
| `tarefas_useFluxoTarefa` | `src/modules/tarefas/fluxo/hooks/tarefas_useFluxoTarefa.ts` | tarefas | fluxo tarefa |
| `tarefas_useExecutorActions` | `src/modules/tarefas/fluxo/hooks/tarefas_useExecutorActions.ts` | tarefas | actions executor |
| `tarefas_useAprovadorActions` | `src/modules/tarefas/fluxo/hooks/tarefas_useAprovadorActions.ts` | tarefas | actions aprovador |
| `tarefas_useAuditorActions` | `src/modules/tarefas/fluxo/hooks/tarefas_useAuditorActions.ts` | tarefas | actions auditor |

## 4. Services

| Service | Arquivo | Modulo | Chama API/RPC | Status |
|---|---|---|---|---|
| `tarefas_service` | `src/modules/tarefas/services/tarefas_service.ts` | tarefas | Supabase | ativo |
| `tarefas_fluxoRpcService` | `src/modules/tarefas/fluxo/services/tarefas_fluxoRpcService.ts` | tarefas | RPCs `tarefas_*` | ativo/critico |
| `tarefas_storage_service` | `src/modules/tarefas/services/tarefas_storage_service.ts` | tarefas | `tarefas-storage-*` | ativo/critico |
| `propostasService` | `src/modules/propostas/services/propostasService.ts` | propostas | `propostas-*` | ativo |
| `propostasIAService` | `src/modules/propostas/services/propostasIAService.ts` | propostas | IA/Edge Functions | ativo |

## 5. Frontend chamando banco direto ou regra critica

| Arquivo | Problema | Risco | Recomendacao |
|---|---|---|---|
| `src/pages/AvaliacaoOSPage.tsx` | inserts/updates diretos em OS, avaliacoes e respostas | regra critica no frontend | migrar gradualmente para services/RPCs. |
| `src/pages/LeadsPage.tsx` | muitas chamadas Supabase diretas | dificil auditar/permissoes | mapear actions antes de alterar. |
| `src/pages/ClientesPage.tsx` | insert/update/delete direto | exclusao/relacionamentos | exigir auditoria/confirmacao. |
| `src/pages/PermissoesPage.tsx` | altera grupos/overrides direto | permissao critica | revisar backend/RLS. |
