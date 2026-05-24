# Navegai - Backup, Secrets e Ambientes

## 1. Ambientes

| Ambiente | URL | Banco | Storage | Variaveis | Risco |
|---|---|---|---|---|---|
| desenvolvimento local | Vite local | Supabase configurado por env | Supabase/externo | `.env` local existe | nao imprimir/commitar secrets |
| Lovable | README Lovable | Supabase | Supabase | NAO ENCONTRADO NO CODIGO | confirmar projeto real |
| producao | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | confirmar antes de deploy |

## 2. Secrets

| Secret/variavel | Onde usado | Pode ir para frontend? | Rotacao | Observacao |
|---|---|---|---|---|
| `SUPABASE_URL` | frontend/functions | sim se URL publica | quando mudar projeto | nao sensivel sozinho. |
| `SUPABASE_ANON_KEY` | frontend/functions | sim | se comprometido | respeitar RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | nunca | obrigatoria se exposto | bypass RLS. |
| `LOVABLE_API_KEY` | proposals/assistant functions | nunca | obrigatoria se exposto | IA externa. |
| `CLOUDCONVERT_API_KEY` | `preview-proposta` | nunca | obrigatoria se exposto | conversao PDF. |
| GitHub PAT | fluxo de publicacao local | nunca | revogar se aparecer em print | nao salvar no repo. |

## 3. Backup

| Backup | Frequencia | Onde fica | Quem pode baixar | Audita? | Retencao |
|---|---|---|---|---|---|
| banco Supabase | NAO ENCONTRADO NO CODIGO | Supabase | admin | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO |
| storage/anexos | NAO ENCONTRADO NO CODIGO | Supabase/provedor externo | admin/autorizado | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO |

## 4. Riscos

| Risco | Local | Severidade | Acao recomendada |
|---|---|---|---|
| `.env` local presente | raiz do repo local | alta | confirmar `.gitignore`, nunca adicionar ao Git. |
| tokens em prints | navegador/terminal | alta | revogar e gerar novo token. |
| service role em functions | Supabase | alta | validar caller antes de uso. |
