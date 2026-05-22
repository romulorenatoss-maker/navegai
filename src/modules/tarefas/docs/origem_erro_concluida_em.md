# Origem do erro `concluida_em`

Data: 2026-05-22T00:28:27-03:00

Escopo: diagnostico apenas. Nenhuma correcao foi aplicada nesta etapa.

## Erro observado

Mensagem no Lovable:

```text
Erro ao aprovar auditoria: column "concluida_em" of relation "operational_assignments" does not exist
```

## Caminho funcional ate a RPC

1. Tela/painel: `src/modules/tarefas/fluxo/components/tarefas_fluxoAuditorPanel.tsx`
2. Botao: `Concluir e ver resumo`
3. Modal: `src/modules/tarefas/fluxo/components/tarefas_resumoNotasModal.tsx`
4. Confirmacao final chama `handleFinalizar`
5. Hook: `src/modules/tarefas/fluxo/hooks/tarefas_useAuditorActions.ts`
6. Service: `src/modules/tarefas/fluxo/services/tarefas_fluxoRpcService.ts`
7. RPC chamada: `tarefas_rpc_auditor_aprovar_auditoria`
8. Payload enviado: `p_assignment_id` e `p_notas`

## Definicao antiga que introduz o erro

Arquivo:

```text
supabase/migrations/20260521113000_tarefas_rpc_fluxo_aliases_completos.sql
```

Trecho problemático da versao antiga:

```sql
UPDATE public.operational_assignments AS oa
  SET status = 'concluida',
      updated_at = now(),
      concluida_em = now()
  WHERE oa.id = p_assignment_id;
```

`concluida_em` nao existe em `operational_assignments`.

## Definicoes antigas tambem com `concluida_em`

- `supabase/migrations/20260521000000_rebuild_tarefas_fluxo_executor_aprovador_auditor.sql`
- `supabase/migrations/20260521021218_d0e93c72-ff3f-42db-94d2-19daf5537995.sql`
- `supabase/migrations/20260521112908_5aec25b8-d6da-4324-b6f2-21d973aecbfc.sql`
- `supabase/migrations/20260521113000_tarefas_rpc_fluxo_aliases_completos.sql`

## Definicao local mais recente no repo

Arquivo:

```text
supabase/migrations/20260522001500_tarefas_rpc_auditor_aprovar_auditoria_fim_em.sql
```

Trecho local atual:

```sql
UPDATE public.operational_assignments AS oa
  SET status = 'concluida',
      updated_at = now(),
      fim_em = COALESCE(oa.fim_em, now()),
      auditor_fim_em = COALESCE(oa.auditor_fim_em, now()),
      auditado_em = COALESCE(oa.auditado_em, now()),
      auditado_por = COALESCE(oa.auditado_por, v_profile_id)
  WHERE oa.id = p_assignment_id;
```

Essa definicao usa apenas colunas existentes no type atual.

## Diagnostico da origem

O erro nao nasce do modal visual de notas. O modal apenas envia `p_notas`.

A origem pratica e a funcao SQL viva de `tarefas_rpc_auditor_aprovar_auditoria` quando ela ainda contem `concluida_em`.

Se o erro persiste no Lovable mesmo com o repo contendo `20260522001500`, os cenarios provaveis sao:

1. A migration `20260522001500_tarefas_rpc_auditor_aprovar_auditoria_fim_em.sql` ainda nao foi aplicada no banco vivo.
2. O preview do Lovable esta apontando para banco/schema anterior.
3. O cache de schema/PostgREST ainda nao recarregou a funcao.
4. Existe outra definicao viva da RPC no banco diferente da ultima migration local.

## Confirmacao recomendada no banco vivo

Antes de corrigir, rodar no Supabase/Lovable:

```sql
select
  p.proname,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'tarefas_rpc_auditor_aprovar_auditoria';
```

Se o retorno ainda tiver `concluida_em`, a funcao viva esta desatualizada.
