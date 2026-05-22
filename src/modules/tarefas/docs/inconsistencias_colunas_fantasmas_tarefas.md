# Inconsistencias de colunas fantasmas - Tarefas

Data: 2026-05-22T00:28:27-03:00

Escopo: diagnostico apenas. Nenhuma correcao foi aplicada nesta etapa.

## Tabela de inconsistencias

| RPC/arquivo | Coluna usada | Existe? | Coluna real provavel | Impacto | Correcao sugerida |
| --- | --- | --- | --- | --- | --- |
| `tarefas_rpc_executor_enviar_respostas` em `supabase/migrations/20260521000000_rebuild_tarefas_fluxo_executor_aprovador_auditor.sql` | `finalizado_em` | Nao | `fim_em` | Quebra envio do executor quando esta definicao fica ativa no banco. | Nao criar coluna. Garantir que a definicao ativa seja a de `20260521114645`, que usa `fim_em`. |
| `tarefas_rpc_executor_enviar_respostas` em `supabase/migrations/20260521003000_tarefas_bloquear_reenvio_r0_fluxo.sql` | `finalizado_em` | Nao | `fim_em` | Reintroduz o mesmo erro de coluna fantasma em envio R0. | Nao editar migration antiga ja aplicada; validar funcao viva com `pg_get_functiondef`. |
| `tarefas_rpc_executor_enviar_respostas` em `supabase/migrations/20260521021218_d0e93c72-ff3f-42db-94d2-19daf5537995.sql` | `finalizado_em` | Nao | `fim_em` | Pode quebrar envio se esta versao estiver ativa no banco. | Reaplicar/confirmar a migration posterior que usa `fim_em`. |
| `tarefas_rpc_executor_enviar_respostas` em `supabase/migrations/20260521053500_tarefas_rpc_executor_enviar_respostas_aliases.sql` | `finalizado_em` | Nao | `fim_em` | Mesmo risco de erro no envio do executor. | Confirmar definicao ativa da RPC no banco. |
| `tarefas_rpc_executor_enviar_respostas` em `supabase/migrations/20260521112908_5aec25b8-d6da-4324-b6f2-21d973aecbfc.sql` | `finalizado_em` | Nao | `fim_em` | Mesmo risco de erro no envio do executor. | Confirmar que `20260521114645` foi aplicada no banco vivo. |
| `tarefas_rpc_executor_enviar_respostas` em `supabase/migrations/20260521113000_tarefas_rpc_fluxo_aliases_completos.sql` | `finalizado_em` | Nao | `fim_em` | Mesmo risco de erro no envio do executor. | Confirmar que `20260521114645` sobrescreveu a funcao. |
| `tarefas_rpc_auditor_aprovar_auditoria` em `supabase/migrations/20260521000000_rebuild_tarefas_fluxo_executor_aprovador_auditor.sql` | `concluida_em` | Nao | `fim_em` + `auditor_fim_em` + `auditado_em` | Quebra o botao final de auditoria com erro `column "concluida_em" ... does not exist`. | Nao criar coluna. A definicao deve usar as colunas reais. |
| `tarefas_rpc_auditor_aprovar_auditoria` em `supabase/migrations/20260521021218_d0e93c72-ff3f-42db-94d2-19daf5537995.sql` | `concluida_em` | Nao | `fim_em` + `auditor_fim_em` + `auditado_em` | Mesmo erro atual se esta funcao estiver ativa. | Confirmar definicao viva no banco. |
| `tarefas_rpc_auditor_aprovar_auditoria` em `supabase/migrations/20260521112908_5aec25b8-d6da-4324-b6f2-21d973aecbfc.sql` | `concluida_em` | Nao | `fim_em` + `auditor_fim_em` + `auditado_em` | Mesmo erro atual se esta funcao estiver ativa. | Confirmar definicao viva no banco. |
| `tarefas_rpc_auditor_aprovar_auditoria` em `supabase/migrations/20260521113000_tarefas_rpc_fluxo_aliases_completos.sql` | `concluida_em` | Nao | `fim_em` + `auditor_fim_em` + `auditado_em` | Origem mais provavel do erro atual no Lovable se `20260522001500` ainda nao foi aplicada. | Aplicar somente apos autorizacao a definicao posterior `20260522001500`, sem criar coluna. |
| `src/modules/tarefas/docs/comando_codex_refazer_notas_automaticas.md` | `finalizado_em` | Nao | `fim_em` | Documentacao pode induzir agente futuro a reintroduzir campo fantasma. | Atualizar documentacao apos autorizacao. |
| `src/modules/tarefas/hooks/tarefas_useTransition.ts` | `avaliador_inicio_em` / `avaliador_fim_em` | Nao | Nenhuma coluna ativa; comentario diz que foram removidas | Sem impacto runtime; aparece em comentario de saneamento. | Pode manter como nota historica ou limpar comentario apos autorizacao. |
| Migrations antigas de score antes de `20260514051025` | `avaliador_fim_em` | Nao no schema atual | `auditor_fim_em` para auditoria; `aprovado_em` para aprovacao | Se trigger antigo sobreviver no banco vivo, score pode quebrar ao tocar assignment. | Verificar `pg_get_functiondef` dos triggers vivos antes de qualquer correcao. |

## Conclusao do diagnostico

- No codigo runtime atual em `src/modules/tarefas` nao ha uso ativo de `finalizado_em` ou `concluida_em`.
- As colunas fantasmas ainda existem em migrations antigas e em documentacao.
- A definicao local mais recente de `tarefas_rpc_auditor_aprovar_auditoria` nao usa `concluida_em`.
- Se o Lovable ainda mostra o erro `concluida_em`, o banco vivo provavelmente esta executando uma definicao antiga da RPC ou nao aplicou a migration posterior.
