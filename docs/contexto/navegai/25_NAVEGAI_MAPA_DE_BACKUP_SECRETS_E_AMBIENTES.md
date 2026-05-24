# Navegai - Mapa de Backup, Secrets e Ambientes

## 1. Arquivos de ambiente

| Item | Status | Observacao |
|---|---|---|
| `.env` | Deve ficar local | Nao versionar |
| Supabase URL/anon key | Usado no frontend | Anon key pode ser publica, service role nao |
| Tokens GitHub | Externo ao repo | Regenerar se exposto |
| Secrets IA/Cloud/Storage | Supabase secrets | Nao colocar em codigo |

## 2. Configuracoes

| Caminho | Uso |
|---|---|
| `supabase/config.toml` | Config Supabase local/projeto |
| `supabase/functions/*` | Edge Functions que dependem de secrets |
| `src/integrations/supabase/client.ts` | Cliente frontend |

## 3. Backup

- Backup real do banco/storage: NAO ENCONTRADO NO CODIGO.
- Artefatos `reports/AI_RETURN` nao substituem backup.
- Antes de migration critica, gerar rollback SQL separado.
