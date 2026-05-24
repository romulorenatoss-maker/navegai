# Navegai - Manifest Atual do Projeto

## 1. Arquivos principais

| Caminho | Modulo | Tipo | Responsabilidade | Ultima alteracao mapeada |
|---|---|---|---|---|
| `src/App.tsx` | geral | rota | providers e rotas | 2026-05-24 |
| `src/components/AppSidebar.tsx` | geral | menu | navegacao por permissao | 2026-05-24 |
| `src/contexts/AuthContext.tsx` | auth | contexto | sessao/perfil | 2026-05-24 |
| `src/integrations/supabase/client.ts` | geral | integracao | cliente Supabase | 2026-05-24 |
| `src/modules/tarefas` | tarefas | modulo | tarefas/rotinas/fluxo | 2026-05-24 |
| `src/modules/propostas` | propostas | modulo | propostas/templates/IA | 2026-05-24 |
| `supabase/functions` | backend | edge functions | APIs server-side | 2026-05-24 |
| `supabase/migrations` | banco | migrations | schema/RLS/RPC/triggers | 2026-05-24 |
| `docs/AI` | memoria antiga | docs | contexto previo | 2026-05-24 |
| `docs/contexto/navegai` | memoria nova | docs | mapas V4 | 2026-05-24 |

## 2. Rotas

Ver `03_NAVEGAI_MAPA_DE_MENUS_E_ROTAS.md`.

## 3. Banco

Ver `08_NAVEGAI_MAPA_DE_BANCO_DE_DADOS.md` e `09_NAVEGAI_MAPA_DE_RPCS_E_TRIGGERS.md`.

## 4. Alteracoes recentes

| Data | Pedido | Arquivos | Mapas atualizados | Risco |
|---|---|---|---|---|
| 2026-05-24 | setup memoria tecnica | `docs/contexto/navegai/*` | todos | baixo |
