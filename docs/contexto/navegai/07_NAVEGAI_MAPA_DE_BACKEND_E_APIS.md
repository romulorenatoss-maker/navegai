# Navegai - Mapa de Backend e APIs

## 1. Edge Functions

| Nome | Tipo | Caminho | Modulo | Chamado por | Permissao | Valida tenant? | Audita? | Status |
|---|---|---|---|---|---|---|---|---|
| `create-user` | Supabase Function | `supabase/functions/create-user/index.ts` | configuracoes | Colaboradores | admin esperado | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | critico |
| `admin-update-password` | Supabase Function | `supabase/functions/admin-update-password/index.ts` | configuracoes | AdminPasswordDialog | admin esperado | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | critico |
| `admin-manage-mfa` | Supabase Function | `supabase/functions/admin-manage-mfa/index.ts` | configuracoes | ColaboradorDetailDialog | admin esperado | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | critico |
| `business-assistant` | Supabase Function | `supabase/functions/business-assistant/index.ts` | dashboards | Assistente | autenticado | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | ativo |
| `generate-daily-assignments` | Supabase Function | `supabase/functions/generate-daily-assignments/index.ts` | tarefas | agendamentos | autenticado/cron | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | ativo |
| `tarefas-storage-upload` | Supabase Function | `supabase/functions/tarefas-storage-upload/index.ts` | tarefas | anexos | autenticado | NAO ENCONTRADO NO CODIGO | parcial | critico |
| `tarefas-storage-signed-url` | Supabase Function | `supabase/functions/tarefas-storage-signed-url/index.ts` | tarefas | downloads | autenticado/token | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | critico |
| `tarefas-storage-delete` | Supabase Function | `supabase/functions/tarefas-storage-delete/index.ts` | tarefas | anexos | autenticado | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | critico |
| `tarefas-storage-config` | Supabase Function | `supabase/functions/tarefas-storage-config/index.ts` | tarefas | configuracoes storage | autenticado | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | critico |
| `tarefas-storage-create-folder` | Supabase Function | `supabase/functions/tarefas-storage-create-folder/index.ts` | tarefas | storage | autenticado | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | ativo |
| `propostas-*` | Supabase Functions | `supabase/functions/propostas-*/index.ts` | propostas | propostas pages/services | autenticado esperado | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | ativo |
| `preview-proposta` | Supabase Function | `supabase/functions/preview-proposta/index.ts` | propostas | template preview | autenticado esperado | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | critico |

## 2. Observacoes de seguranca

- Varias functions leem `Authorization` e criam client com `SUPABASE_ANON_KEY`.
- Functions admin e storage podem usar `SUPABASE_SERVICE_ROLE_KEY`; validar que permissao do chamador e checada antes de operar.
- Functions de propostas usam `LOVABLE_API_KEY` e `CLOUDCONVERT_API_KEY`; nunca expor no frontend.

## 3. APIs nao usadas pelo frontend

NAO ENCONTRADO NO CODIGO nesta primeira passada. Exige cruzamento fino por function.

## 4. Chamadas frontend sem backend encontrado

Paginas legadas chamam `supabase.from(...)` direto; nesses casos o backend e RLS/policies do Supabase, nao uma API dedicada.
