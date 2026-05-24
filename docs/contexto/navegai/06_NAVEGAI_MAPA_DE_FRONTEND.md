# Navegai - Mapa de Frontend

## 1. Estrutura frontend

| Caminho | Tipo | Modulo | Responsabilidade | Status |
|---|---|---|---|---|
| `src/App.tsx` | Rotas | Global | Registro de rotas protegidas | Ativo |
| `src/components/AppSidebar.tsx` | Menu | Global | Sidebar filtrada por permissao | Ativo |
| `src/components/ui/*` | UI | Global | shadcn/Radix primitives | Ativo |
| `src/contexts/AuthContext.tsx` | Auth | Global | Sessao, perfil, roles | Ativo |
| `src/integrations/supabase/*` | Client | Global | Supabase client/types | Ativo |
| `src/modules/tarefas/*` | Modulo | Tarefas | Pages/components/hooks/services/fluxo | Ativo |
| `src/modules/propostas/*` | Modulo | Propostas | Pages/components/services/hooks/utils | Ativo |
| `src/pages/*` | Pages legadas | Avaliacoes/Leads/Cadastros | Telas fora de modules | Ativo legado |

## 2. Hooks criticos

| Hook | Arquivo | Modulo | Chama service/RPC | Status |
|---|---|---|---|---|
| `tarefas_useFluxoTarefa` | `src/modules/tarefas/fluxo/hooks/tarefas_useFluxoTarefa.ts` | Tarefas | `tarefas_fluxoRpcService` | Critico |
| `tarefas_useExecutorActions` | `src/modules/tarefas/fluxo/hooks/tarefas_useExecutorActions.ts` | Tarefas | RPC executor | Critico |
| `tarefas_useAprovadorActions` | `src/modules/tarefas/fluxo/hooks/tarefas_useAprovadorActions.ts` | Tarefas | RPC aprovador | Critico |
| `useAvaliacaoOS` | `src/hooks/useAvaliacaoOS.ts` | Avaliacoes | Supabase direto | Critico |
| `usePermissions` | `src/hooks/usePermissions.ts` | Global | RPC `get_user_effective_permissions` | Critico |

## 3. Services criticos

| Service | Arquivo | Modulo | Chama API/RPC | Status |
|---|---|---|---|---|
| `tarefas_fluxoRpcService` | `src/modules/tarefas/fluxo/services/tarefas_fluxoRpcService.ts` | Tarefas | `tarefas_rpc_*` | Critico |
| `tarefas_storage_service` | `src/modules/tarefas/services/tarefas_storage_service.ts` | Tarefas | Edge/storage | Critico |
| `propostasService` | `src/modules/propostas/services/propostasService.ts` | Propostas | Edge + Supabase | Ativo |
| `propostasIAService` | `src/modules/propostas/services/propostasIAService.ts` | Propostas | Edge IA | Ativo |

## 4. Frontend chamando banco direto ou regra critica

| Arquivo | Problema | Risco | Recomendacao |
|---|---|---|---|
| `src/pages/*` | Muitas telas usam `supabase.from(...).insert/update/delete` direto | Medio/alto | Para regra sensivel, mover para RPC/Edge |
| `src/modules/tarefas/components/rotinas/RotinasModal.tsx` | Edita templates/fields/sections direto | Alto | Validar policies e manter alteracoes localizadas |
| `src/modules/propostas/services/propostasService.ts` | Cria proposta/itens/historico direto | Medio | Preservar historico e validar permissao |
