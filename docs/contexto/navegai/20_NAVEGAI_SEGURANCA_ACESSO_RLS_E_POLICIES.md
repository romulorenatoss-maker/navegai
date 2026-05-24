# Navegai - Seguranca, Acesso, RLS e Policies

## 1. Modelo de acesso

| Camada | Protecao | Status | Observacao |
|---|---|---|---|
| UI | `AppSidebar` filtra por admin, `canViewPath`, `allowedScreens` | encontrado | nao basta sozinho. |
| Rotas | `ProtectedRoute` envolve app interno | encontrado | `/login` publico. |
| Hook/service | `usePermissions`, services de tarefas/propostas | parcial | varias paginas ainda chamam banco direto. |
| API/RPC | Supabase RPC e Edge Functions | encontrado | validar permissao em cada function critica. |
| Banco | RLS/policies em migrations | encontrado | 426 policies encontradas por busca textual. |
| Storage | bucket policies e signed URLs | encontrado | buckets privados/publicos historicos. |
| Auditoria | `audit_logs`, tarefas logs | parcial | consolidar por action critica. |

## 2. Policies por tabela

Mapa completo por policy exige extracao dedicada. Primeira leitura confirmou RLS/policies para tabelas centrais: `profiles`, `user_roles`, `setores`, `ordens_servico`, `avaliacoes`, `respostas_avaliacao`, `operational_*`, `tarefas_planos_*`, `propostas_*` e storage buckets.

## 3. Falhas/riscos encontrados

| Falha | Local | Risco | Correcao recomendada |
|---|---|---|---|
| Frontend faz operacoes diretas em tabelas criticas | `src/pages/*` | regra/permissao bypass por erro de policy | criar actions server-side por fluxo critico. |
| Functions com service role | `supabase/functions/*` | bypass RLS | validar usuario/role antes de usar admin client. |
| Buckets ja foram publicos historicamente | migrations storage | exposicao de anexos/evidencias | garantir private + signed URL. |
| Export/download sem action contract consolidado | relatorios/storage | vazamento | permissao separada e auditoria. |
