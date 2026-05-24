# Navegai - Regras de Negocio

## 1. Regras validadas que nao podem ser quebradas

| Regra | Modulo | Onde esta implementada | Impacta | Pode mudar? | Observacao |
|---|---|---|---|---|---|
| Tarefas tem rotas oficiais em `/tarefas/*` | tarefas | `src/App.tsx`, `src/modules/tarefas/routes/tarefas_routes.ts`, `docs/AI` | menu, permissoes, navegacao | nao sem aprovacao | Nao voltar para `/operacional/*`. |
| Fluxo Tarefas deve passar por RPCs oficiais | tarefas | `tarefas_fluxoRpcService`, migrations `20260521*` | status, auditoria, planos | nao sem aprovacao | Evita regra critica no frontend. |
| Propostas fica isolado em `src/modules/propostas` | propostas | estrutura de pastas | render/IA/templates | nao sem aprovacao | Nao misturar com paginas legadas. |
| Permissao de tela filtra menu | configuracoes | `AppSidebar`, `ProtectedRoute`, `usePermissions` | acesso | nao sem aprovacao | Backend/RLS tambem deve validar. |
| Service role nao pode ir para frontend | seguranca | Edge Functions e `.env` | seguranca | nunca | Secret somente server-side. |

## 2. Regras que precisam de consolidacao

| Regra | Modulo | Problema | Recomendacao |
|---|---|---|---|
| Exclusao de clientes/colaboradores/enderecos | cadastros | existe delete/update direto no frontend | criar service/RPC com auditoria. |
| Exportacao de relatorios | relatorios | permissao/auditoria nao consolidada no mapa inicial | mapear antes de alterar. |
| Fluxo reverso de Tarefas | tarefas | nao encontrado completo no primeiro mapeamento | documentar antes de nova action critica. |
