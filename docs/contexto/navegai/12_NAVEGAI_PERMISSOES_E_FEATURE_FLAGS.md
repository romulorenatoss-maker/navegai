# Navegai - Permissoes e Feature Flags

## 1. Fontes de permissao

| Fonte | Caminho | Uso |
|---|---|---|
| Roles | `user_roles`, RPC `has_role`, `is_admin` | Admin/avaliador/outros |
| Permissoes de tela | `screen_permissions`, `user_screen_permissions` | Sidebar/rotas |
| Hook | `src/hooks/usePermissions.ts` | Carrega permissoes efetivas |
| Biblioteca | `src/lib/screen-permissions.ts` | Helpers de telas |
| Sidebar | `src/components/AppSidebar.tsx` | Filtra menus |

## 2. Regras

- Admin ve todos os menus.
- Usuario comum depende de `canViewPath` ou `allowedScreens`.
- Operacao critica deve validar tambem em RPC/API/RLS.
- Feature flags explicitas: NAO ENCONTRADO NO CODIGO como sistema central; existem flags/configs por modulo e permissoes.

## 3. Pontos sensiveis

| Modulo | Risco | Recomendacao |
|---|---|---|
| Tarefas | Status e anexos | Validar por RPC/policy |
| Propostas | Dados comerciais e templates | Validar em Edge Functions |
| Clientes/Leads | Dados pessoais | RLS estrita e historico |
| Admin users/MFA | Service role | Nunca expor no frontend |
