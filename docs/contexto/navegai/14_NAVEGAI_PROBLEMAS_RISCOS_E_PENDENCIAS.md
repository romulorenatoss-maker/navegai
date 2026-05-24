# Navegai - Problemas, Riscos e Pendencias

## 1. Riscos encontrados

| Risco | Severidade | Evidencia | Acao recomendada |
|---|---|---|---|
| Frontend com muitos acessos diretos ao banco | Alta | `rg supabase.from` em pages/hooks/modules | Migrar regra critica para RPC/Edge |
| Artefatos antigos de IA no repo | Media | `reports/AI_RETURN`, `docs/AI` | Nao usar como verdade sem validar codigo |
| Tarefas com fluxo complexo | Alta | RPCs e triggers `tarefas_*` | Alterar localmente e testar status |
| Secrets/ambientes | Alta | Edge Functions e Supabase | `.env` deve ficar fora do Git |
| Boot branco por Supabase env | Alta | `client.ts` com `import.meta.env.VITE_SUPABASE_URL` pode virar `undefined` no Lovable publicado | Nao alterar padrao Lovable do client sem validar deploy |
| RPC nova antes de migration/cache | Alta | PostgREST pode retornar `Could not find the function ... in the schema cache` | Frontend deve ter fallback e migration deve estar aplicada antes de depender da RPC |
| Persistencia de tempo por etapa | Media | NAO ENCONTRADO NO CODIGO | Propor tabela/RPC somente com aprovacao |

## 2. Pendencias de mapa

- Mapear detalhadamente todas as policies por tabela em rodada especifica de seguranca.
- Mapear todos os botoes de telas legadas se forem alvo de alteracao.
- Identificar funcoes nao usadas com ferramenta dedicada antes de remover qualquer arquivo.
