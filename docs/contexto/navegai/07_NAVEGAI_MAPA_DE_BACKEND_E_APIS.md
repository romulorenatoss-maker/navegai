# Navegai - Mapa de Backend e APIs

## 1. Edge Functions

| Nome | Tipo | Caminho | Modulo | Chamado por | Permissao | Status |
|---|---|---|---|---|---|---|
| `create-user` | Edge Function | `supabase/functions/create-user` | Admin | Usuarios/config | Admin/service role | Ativo |
| `admin-update-password` | Edge Function | `supabase/functions/admin-update-password` | Admin | Config usuarios | Admin/service role | Ativo |
| `admin-manage-mfa` | Edge Function | `supabase/functions/admin-manage-mfa` | Admin | MFA | Admin/service role | Ativo |
| `business-assistant` | Edge Function | `supabase/functions/business-assistant` | Assistente | Assistente Navi | Secrets IA | Ativo |
| `generate-daily-assignments` | Edge Function | `supabase/functions/generate-daily-assignments` | Tarefas | Agendamento/cron | Service role | Ativo |
| `tarefas-storage-*` | Edge Functions | `supabase/functions/tarefas-storage-*` | Tarefas | Anexos/evidencias | Storage config | Ativo |
| `propostas-conversacional` | Edge Function | `supabase/functions/propostas-conversacional` | Propostas | Conversa proposta | `propostas_auth` | Ativo |
| `propostas-render-docx` | Edge Function | `supabase/functions/propostas-render-docx` | Propostas | Render DOCX | `propostas_auth` | Ativo |
| `propostas-*` | Edge Functions | `supabase/functions/propostas-*` | Propostas | Produtos/templates/IA | `propostas_auth` | Ativo |
| `preview-proposta` | Edge Function | `supabase/functions/preview-proposta` | Propostas | Preview/import | Auth | Ativo |

## 2. Contrato por API critica

### API/RPC/Endpoint: `tarefas-storage-upload`

- Tipo: Edge Function
- Modulo: Tarefas
- Chamado por: renderer/anexos de tarefas
- Responsabilidade: upload de evidencia/anexo
- Risco: anexo obrigatorio precisa gravar `evidencia_url` ou `evidencia_anexo_id`

### API/RPC/Endpoint: `propostas-render-docx`

- Tipo: Edge Function
- Modulo: Propostas
- Chamado por: proposta preview/render
- Responsabilidade: gerar DOCX a partir de proposta/template
- Risco: precisa validar permissao e evitar payload adulterado

## 3. Shared backend

| Caminho | Responsabilidade |
|---|---|
| `supabase/functions/_shared/propostas_auth.ts` | Autorizacao compartilhada de propostas |
| `supabase/functions/_shared/tarefas_storage_provider.ts` | Provider de storage tarefas |
| `supabase/functions/_shared/storage_providers/*` | Google Drive/outros providers |
