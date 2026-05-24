# Navegai - Seguranca, Acesso, RLS e Policies

## 1. Mecanismos encontrados

| Mecanismo | Onde | Observacao |
|---|---|---|
| Supabase Auth | `AuthContext.tsx` | Sessao/perfil |
| Roles | `user_roles`, `has_role`, `is_admin` | Admin/avaliador/etc |
| RLS | migrations | Muitas tabelas com `ENABLE ROW LEVEL SECURITY` |
| Policies | migrations | Admin/manage, authenticated/view e policies especificas |
| Permissoes de tela | `usePermissions.ts`, `screen-permissions.ts` | Controla menu/rotas |
| Edge auth propostas | `_shared/propostas_auth.ts` | Validacao compartilhada |

## 2. Policies/tabelas sensiveis

| Area | Tabelas | Risco |
|---|---|---|
| Clientes | `clientes`, `cliente_contatos`, `cliente_responsaveis` | Dados pessoais |
| Tarefas | `operational_*`, `tarefas_*` | Operacao e anexos |
| Propostas | `propostas_*` | Dados comerciais |
| Leads | `leads`, `lead_*` | Dados pessoais/comerciais |
| Audit | `audit_logs`, historicos | Trilhas de auditoria |

## 3. Checklist antes de mexer em seguranca

- Validar se existe RLS.
- Validar policy por role/tenant/responsavel.
- Validar se frontend nao depende so de botao escondido.
- Validar se RPC/Edge revalida permissao.
- Registrar no changelog e mapa de auditoria.
