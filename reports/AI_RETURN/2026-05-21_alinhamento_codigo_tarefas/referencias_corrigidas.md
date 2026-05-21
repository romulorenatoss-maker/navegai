# Referencias corrigidas

## Runtime real

Corrigido:

- `src/modules/tarefas/fluxo/types/tarefas_fluxoTypes.ts`
  - Antes: `finalizado_em: string | null`
  - Depois: `fim_em: string | null`
  - Classificacao: type/interface de runtime do fluxo oficial.

Nao foi encontrado uso runtime direto em `src/modules/tarefas` no formato:

- `assignment.finalizado_em`
- `.finalizado_em`
- query/select ativo usando `finalizado_em`

## Documentacao do modulo Tarefas

Corrigido:

- `src/modules/tarefas/docs/tarefas_rpc_executor_enviar_respostas.md`
  - Antes: RPC marca `finalizado_em = now()`
  - Depois: RPC marca `fim_em = now()`

- `src/modules/tarefas/docs/FLUXO_PERMISSOES.md`
  - Antes: `finalizado_em > prazo_execucao`
  - Depois: `fim_em > prazo_execucao`

## Referencias localizadas e nao corrigidas por nao serem `finalizado_em`

- `src/modules/tarefas/hooks/tarefas_useTransition.ts`
  - Comentarios sobre saneamento de `avaliador_inicio_em` / `avaliador_fim_em`.
  - Mantido porque o comentario informa que essas colunas nao existem mais e nao envia payload com elas.

- `src/modules/tarefas/services/tarefas_pontuacao_config_service.ts`
  - String de metadado: `operational_assignments.avaliador_fim_em vs prazo SLA do aprovador`.
  - Mantido porque nao e acesso direto a coluna nem query Supabase. Alterar essa fonte de metadado pode impactar regra de configuracao/pontuacao e precisa de decisao funcional separada.

## Resultado esperado

Depois desta alteracao, o codigo atual do fluxo oficial nao deve mais tipar `operational_assignments.finalizado_em`.
