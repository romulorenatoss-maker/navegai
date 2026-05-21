# Referencias mantidas por serem migration legacy ou SQL historico

Regra aplicada:
- Nao alterar SQL.
- Nao criar migration.
- Nao mexer em Supabase migrations antigas ja aplicadas.
- Nao alterar RPC.

## `finalizado_em` mantido em SQL historico

- `docs/rollback_tarefas_fluxo_rebuild_final.sql`
- `supabase/migrations/20260521000000_rebuild_tarefas_fluxo_executor_aprovador_auditor.sql`
- `supabase/migrations/20260521003000_tarefas_bloquear_reenvio_r0_fluxo.sql`
- `supabase/migrations/20260521021218_d0e93c72-ff3f-42db-94d2-19daf5537995.sql`
- `supabase/migrations/20260521053500_tarefas_rpc_executor_enviar_respostas_aliases.sql`
- `supabase/migrations/20260521113000_tarefas_rpc_fluxo_aliases_completos.sql`

Observacao: essas referencias nao foram editadas por ordem explicita de nao alterar SQL/migrations/RPC. O backup do Lovable informa que a correcao SQL real ja foi aplicada no banco usando `fim_em`.

## `avaliador_inicio_em` / `avaliador_fim_em` mantidos em migrations antigas

- `supabase/migrations/20260415002648_637ebfd8-d2d8-4229-afb8-3df4a81936f0.sql`
- `supabase/migrations/20260415011323_022826b7-e6d8-4a8d-932b-221c5c19d52b.sql`
- `supabase/migrations/20260415014527_586db77c-b8cd-4111-b4e0-9f68bf857935.sql`
- `supabase/migrations/20260415023744_e6b76a5d-0037-487b-8ac0-c8da803bd0e9.sql`
- `supabase/migrations/20260415194142_2534bfea-b93f-4100-919d-53b19106bc9c.sql`
- `supabase/migrations/20260514034458_fb296e56-6cf0-4aae-8159-649e6561c81a.sql`
- `supabase/migrations/20260514051025_efe6405f-8d6a-40ed-8990-4aac6f482137.sql`

Observacao: `20260514051025...` remove essas colunas com `DROP COLUMN IF EXISTS`, confirmando o saneamento historico.
