# Sugestao de correcao sem aplicar

Data: 2026-05-22T00:28:27-03:00

Escopo: diagnostico apenas. Este arquivo descreve o caminho seguro, mas nenhuma correcao foi aplicada nesta etapa.

## Regra principal

Nao criar coluna `concluida_em`.

A tabela `operational_assignments` ja possui:

- `status`
- `fim_em`
- `auditor_fim_em`
- `auditado_em`
- `auditado_por`

Esses campos cobrem a conclusao e a auditoria sem criar coluna duplicada.

## Passo 1 - Confirmar schema vivo

Rodar no SQL editor do Supabase/Lovable:

```sql
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'operational_assignments'
order by ordinal_position;
```

Confirmar especialmente:

```text
fim_em: existe
concluida_em: nao existe
finalizado_em: nao existe
auditor_fim_em: existe
auditado_em: existe
aprovado_em: existe
avaliador_fim_em: nao existe
aprovador_fim_em: nao existe
```

## Passo 2 - Confirmar definicoes vivas das RPCs

```sql
select
  p.proname,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'tarefas_rpc_executor_enviar_respostas',
    'tarefas_rpc_executor_responder_plano_aprovador',
    'tarefas_rpc_aprovador_criar_plano_acao',
    'tarefas_rpc_aprovador_criar_plano_executor',
    'tarefas_rpc_aprovador_aprovar_para_auditoria',
    'tarefas_rpc_aprovador_responder_plano_auditor',
    'tarefas_rpc_auditor_criar_plano_acao',
    'tarefas_rpc_auditor_criar_plano_aprovador',
    'tarefas_rpc_auditor_aprovar_auditoria'
  )
order by p.proname;
```

## Passo 3 - Procurar colunas fantasmas nas funcoes vivas

Se qualquer definicao viva retornar:

- `finalizado_em`
- `concluida_em`
- `avaliador_inicio_em`
- `avaliador_fim_em`
- `aprovador_inicio_em`
- `aprovador_fim_em`

entao a funcao viva esta desalinhada com a tabela real.

## Passo 4 - Correcao provavel apos autorizacao

Se a RPC viva `tarefas_rpc_auditor_aprovar_auditoria` ainda tiver `concluida_em`, aplicar somente `CREATE OR REPLACE FUNCTION` com o bloco que usa:

```sql
fim_em = COALESCE(oa.fim_em, now()),
auditor_fim_em = COALESCE(oa.auditor_fim_em, now()),
auditado_em = COALESCE(oa.auditado_em, now()),
auditado_por = COALESCE(oa.auditado_por, v_profile_id)
```

Nao criar coluna nova.

Se a RPC viva `tarefas_rpc_executor_enviar_respostas` ainda tiver `finalizado_em`, aplicar somente `CREATE OR REPLACE FUNCTION` com:

```sql
fim_em = COALESCE(oa.fim_em, now())
```

## Passo 5 - Validacao apos autorizacao

Depois de aplicar a correcao autorizada:

1. Confirmar `pg_get_functiondef` sem `concluida_em`.
2. Confirmar `pg_get_functiondef` sem `finalizado_em`.
3. Recarregar schema:

```sql
notify pgrst, 'reload schema';
```

4. Testar no app:
   - abrir `/tarefas/execucao`;
   - abrir tarefa em `aguardando_auditoria`;
   - abrir resumo de notas;
   - confirmar auditoria;
   - validar status `concluida`;
   - validar `fim_em`, `auditor_fim_em`, `auditado_em` preenchidos;
   - validar ausencia de erro `concluida_em`.

## Comando para pedir ao Lovable/Supabase

```text
Execute somente diagnostico SQL, sem alterar nada:

1. Rode:
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'operational_assignments'
order by ordinal_position;

2. Rode:
select p.proname, pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'tarefas_rpc_executor_enviar_respostas',
    'tarefas_rpc_executor_responder_plano_aprovador',
    'tarefas_rpc_aprovador_criar_plano_acao',
    'tarefas_rpc_aprovador_criar_plano_executor',
    'tarefas_rpc_aprovador_aprovar_para_auditoria',
    'tarefas_rpc_aprovador_responder_plano_auditor',
    'tarefas_rpc_auditor_criar_plano_acao',
    'tarefas_rpc_auditor_criar_plano_aprovador',
    'tarefas_rpc_auditor_aprovar_auditoria'
  )
order by p.proname;

3. Entregue o resultado em um arquivo ZIP com:
- schema_operational_assignments.csv
- rpcs_tarefas_pg_get_functiondef.sql
- rpcs_tarefas_pg_get_functiondef.md

Nao crie coluna, nao altere RPC, nao aplique migration.
```
