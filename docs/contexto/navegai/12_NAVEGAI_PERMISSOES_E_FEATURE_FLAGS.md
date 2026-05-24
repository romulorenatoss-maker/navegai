# Navegai - Permissoes e Feature Flags

## 1. Permissoes por modulo/tela/action

| Permissao | Modulo | Tela | Action_id | Quem pode | RPC valida? | UI valida? | Observacao |
|---|---|---|---|---|---|---|---|
| `canViewPath(path)` | geral | menu/layout | visualizar rota | admin ou allowedScreens | NAO ENCONTRADO NO CODIGO | sim | `AppSidebar` filtra menu. |
| `get_user_effective_permissions` | configuracoes | geral | permissoes efetivas | usuario autenticado | sim esperado | sim | usado por `usePermissions`. |
| `has_role`, `is_admin` | auth | varias | roles/admin | admin/role | sim | parcial | base de varias policies. |
| `TAREFAS_SCREEN_PERMISSIONS` | tarefas | `/tarefas/*` | visualizar telas tarefas | conforme config | NAO ENCONTRADO NO CODIGO | sim | `src/modules/tarefas/permissions/tarefas_permissions.ts`. |
| permissoes de grupos | configuracoes | `/configuracoes/permissoes` | create/edit/delete/export | admin | NAO ENCONTRADO NO CODIGO | sim | tabelas `permission_*`. |

## 2. Feature flags

NAO ENCONTRADO NO CODIGO como sistema formal de feature flags.

## 3. Permissoes sensiveis

| Permissao | Risco | Exige MFA/reautenticacao? | Audita? | Observacao |
|---|---|---|---|---|
| criar usuario | alto | recomendado | recomendado | Edge Function `create-user`. |
| alterar senha | alto | recomendado | recomendado | `admin-update-password`. |
| gerenciar MFA | alto | sim recomendado | recomendado | `admin-manage-mfa`. |
| exportar relatorio | medio/alto | nao encontrado | recomendado | `can_export` existe em tipos/permissoes. |
| download anexo | medio/alto | nao encontrado | recomendado | `permitir_download` existe para storage tarefas. |
