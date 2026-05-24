# Navegai - Mapa de Backup, Secrets e Ambientes

## 1. Arquivos de ambiente

| Item | Status | Observacao |
|---|---|---|
| `.env` | Deve ficar local | Nao versionar |
| Supabase URL/anon key | Usado no frontend | Projeto Lovable publicado precisa de URL/anon key disponiveis no bundle; anon key pode ser publica, service role nao |
| Tokens GitHub | Externo ao repo | Regenerar se exposto |
| Secrets IA/Cloud/Storage | Supabase secrets | Nao colocar em codigo |

## 2. Configuracoes

| Caminho | Uso |
|---|---|
| `supabase/config.toml` | Config Supabase local/projeto |
| `supabase/functions/*` | Edge Functions que dependem de secrets |
| `src/integrations/supabase/client.ts` | Cliente frontend |

## 3. Regra critica - Supabase client no Lovable

- Incidente 2026-05-24: app publicado ficou em tela branca porque `src/integrations/supabase/client.ts` leu `import.meta.env.VITE_SUPABASE_URL` e o valor saiu `undefined` no bundle publicado.
- Erro observado: `supabaseUrl is required` durante o boot, antes de qualquer rota/tela carregar.
- Padrao Lovable aprovado: manter `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` diretamente disponiveis no `client.ts` do frontend publicado.
- Nao trocar o `client.ts` para depender apenas de `import.meta.env` sem validar build publicada no Lovable.
- Nunca hardcodar service role, tokens privados, GitHub token, chaves de IA ou secrets de Edge Function no frontend. A excecao e somente URL do Supabase e anon/publishable key.

## 4. Backup

- Backup real do banco/storage: NAO ENCONTRADO NO CODIGO.
- Artefatos `reports/AI_RETURN` nao substituem backup.
- Antes de migration critica, gerar rollback SQL separado.
