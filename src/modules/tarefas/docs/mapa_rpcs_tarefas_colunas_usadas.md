# Mapa de RPCs Tarefas - colunas usadas

Data: 2026-05-22T00:28:27-03:00

Escopo: diagnostico apenas. Nenhuma RPC foi alterada nesta etapa.

## Criterio

Para cada RPC do fluxo executor -> aprovador -> auditor, foi considerada a ultima migration `CREATE OR REPLACE FUNCTION` encontrada no repo para o mesmo nome da funcao.

## RPCs revisadas

| RPC | Ultima definicao no repo | Toca `operational_assignments`? | Colunas de `operational_assignments` usadas na definicao mais recente | Campo fantasma na definicao mais recente? | Status |
| --- | --- | --- | --- | --- | --- |
| tarefas_rpc_executor_enviar_respostas | `supabase/migrations/20260521114645_9ba0776f-3680-41d5-a3c8-7be17ab046f2.sql` | Sim | `id`, `status`, `responsavel_id`, `setor_executor_id`, `template_snapshot`, `updated_at`, `fim_em` | Nao | Atual no repo usa `fim_em`. |
| tarefas_rpc_executor_responder_plano_aprovador | `supabase/migrations/20260521113000_tarefas_rpc_fluxo_aliases_completos.sql` | Sim | `id`, `status`, `updated_at` | Nao | Sem fantasma detectado na ultima definicao local. |
| tarefas_rpc_aprovador_criar_plano_acao | `supabase/migrations/20260521113000_tarefas_rpc_fluxo_aliases_completos.sql` | Nao diretamente | Nao aplicavel | Nao | Alias deprecated mantido para compatibilidade. |
| tarefas_rpc_aprovador_criar_plano_executor | `supabase/migrations/20260521113000_tarefas_rpc_fluxo_aliases_completos.sql` | Sim | `id`, `status`, `updated_at` | Nao | Sem fantasma detectado na ultima definicao local. |
| tarefas_rpc_aprovador_aprovar_para_auditoria | `supabase/migrations/20260521113000_tarefas_rpc_fluxo_aliases_completos.sql` | Sim | `id`, `status`, `updated_at` | Nao | Recebe `p_notas`, mas nao usa coluna fantasma em `operational_assignments`. |
| tarefas_rpc_aprovador_responder_plano_auditor | `supabase/migrations/20260521113000_tarefas_rpc_fluxo_aliases_completos.sql` | Sim | `id`, `status`, `updated_at` | Nao | Sem fantasma detectado na ultima definicao local. |
| tarefas_rpc_auditor_criar_plano_acao | `supabase/migrations/20260521113000_tarefas_rpc_fluxo_aliases_completos.sql` | Nao diretamente | Nao aplicavel | Nao | Alias deprecated mantido para compatibilidade. |
| tarefas_rpc_auditor_criar_plano_aprovador | `supabase/migrations/20260521113000_tarefas_rpc_fluxo_aliases_completos.sql` | Sim | `id`, `status`, `updated_at` | Nao | Sem fantasma detectado na ultima definicao local. |
| tarefas_rpc_auditor_aprovar_auditoria | `supabase/migrations/20260522001500_tarefas_rpc_auditor_aprovar_auditoria_fim_em.sql` | Sim | `id`, `status`, `updated_at`, `fim_em`, `auditor_fim_em`, `auditado_em`, `auditado_por` | Nao | Ultima definicao local corrige `concluida_em` para colunas reais. |

## RPCs novas de resumo/notas

Nao foi encontrada RPC nova especifica para resumo/notas. O frontend atual passa `p_notas` para as RPCs existentes:

- `tarefas_rpc_aprovador_aprovar_para_auditoria`
- `tarefas_rpc_auditor_aprovar_auditoria`

Ponto importante: o erro `concluida_em` aparece ao confirmar auditoria, portanto o caminho provavel e `tarefas_rpc_auditor_aprovar_auditoria`, nao um calculo visual do modal.

## Definicoes antigas que ainda aparecem em migrations

| RPC | Migration antiga | Coluna fantasma |
| --- | --- | --- |
| tarefas_rpc_executor_enviar_respostas | `20260521000000_rebuild_tarefas_fluxo_executor_aprovador_auditor.sql` | `finalizado_em` |
| tarefas_rpc_executor_enviar_respostas | `20260521003000_tarefas_bloquear_reenvio_r0_fluxo.sql` | `finalizado_em` |
| tarefas_rpc_executor_enviar_respostas | `20260521021218_d0e93c72-ff3f-42db-94d2-19daf5537995.sql` | `finalizado_em` |
| tarefas_rpc_executor_enviar_respostas | `20260521053500_tarefas_rpc_executor_enviar_respostas_aliases.sql` | `finalizado_em` |
| tarefas_rpc_executor_enviar_respostas | `20260521112908_5aec25b8-d6da-4324-b6f2-21d973aecbfc.sql` | `finalizado_em` |
| tarefas_rpc_executor_enviar_respostas | `20260521113000_tarefas_rpc_fluxo_aliases_completos.sql` | `finalizado_em` |
| tarefas_rpc_auditor_aprovar_auditoria | `20260521000000_rebuild_tarefas_fluxo_executor_aprovador_auditor.sql` | `concluida_em` |
| tarefas_rpc_auditor_aprovar_auditoria | `20260521021218_d0e93c72-ff3f-42db-94d2-19daf5537995.sql` | `concluida_em` |
| tarefas_rpc_auditor_aprovar_auditoria | `20260521112908_5aec25b8-d6da-4324-b6f2-21d973aecbfc.sql` | `concluida_em` |
| tarefas_rpc_auditor_aprovar_auditoria | `20260521113000_tarefas_rpc_fluxo_aliases_completos.sql` | `concluida_em` |
