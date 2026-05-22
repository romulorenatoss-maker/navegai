# Mapa de colunas reais - operational_assignments

Data: 2026-05-22T00:28:27-03:00

Escopo: diagnostico apenas. Nenhuma tabela, RPC, trigger, migration ou frontend foi alterado nesta etapa.

## Fonte consultada

- `src/integrations/supabase/types.ts`, tabela `operational_assignments`
- `supabase/migrations/20260514051025_efe6405f-8d6a-40ed-8990-4aac6f482137.sql`
- `supabase/migrations/20260521114645_9ba0776f-3680-41d5-a3c8-7be17ab046f2.sql`
- `supabase/migrations/20260522001500_tarefas_rpc_auditor_aprovar_auditoria_fim_em.sql`

Observacao: este diagnostico nao teve conexao direta ao banco vivo do Lovable/Supabase. A fonte local mais confiavel e o type gerado do Supabase no repo, cruzado com migrations. Para confirmar o banco vivo, usar a consulta SQL indicada em `sugestao_correcao_sem_aplicar.md`.

## Colunas reais no type atual

| Coluna |
| --- |
| aprovado_em |
| aprovado_por |
| aprovador_id |
| auditado_em |
| auditado_por |
| auditor_fim_em |
| auditor_id |
| auditor_inicio_em |
| avaliado_id |
| cancelada_em |
| cancelada_por |
| created_at |
| created_by |
| data_prevista |
| evidencia_url |
| excluir_da_media |
| fim_em |
| flag_atraso_plano_acao |
| flag_reincidencia_atraso |
| flag_sla_etapa_estourado |
| horario_inicio_previsto |
| horario_limite |
| id |
| inicio_em |
| justificativa_sla_etapa |
| justificativa_sla_etapa_anexo_url |
| motivo_cancelamento |
| motivo_exclusao_media |
| numero_tarefa |
| observacao |
| origem |
| parent_assignment_id |
| pausa_iniciada_em |
| pontuacao_obtida |
| prazo_pausado_ms |
| reagendamentos_count |
| responsavel_id |
| rodada_atual |
| score_aprovador |
| score_auditor |
| score_avaliado |
| score_executor |
| score_final_ajustado |
| setor_aprovador_id |
| setor_auditor_id |
| setor_avaliado_id |
| setor_executor_id |
| status |
| template_id |
| template_snapshot |
| template_versao |
| tempo_gasto_minutos |
| tipo_assignment |
| ultimo_motivo_reagendamento |
| updated_at |
| validador_contingencia_id |

## Colunas de fim/conclusao/status

| Campo solicitado | Existe em `operational_assignments`? | Observacao |
| --- | --- | --- |
| finalizado_em | Nao | Campo fantasma no fluxo Tarefas atual. Coluna real provavel para fim da execucao/conclusao: `fim_em`. |
| fim_em | Sim | Coluna real para fim/conclusao geral da assignment. |
| concluida_em | Nao | Campo fantasma para `operational_assignments`. A tabela usa `status = 'concluida'` e `fim_em`; para auditoria tambem existem `auditado_em` e `auditor_fim_em`. |
| aprovado_em | Sim | Marco real de aprovacao. |
| auditado_em | Sim | Marco real de auditoria. |
| auditor_fim_em | Sim | Marco real de fim da etapa do auditor. |
| avaliador_fim_em | Nao | Removida por migration de saneamento. |
| avaliador_inicio_em | Nao | Removida por migration de saneamento. |
| aprovador_fim_em | Nao | Nao consta no schema atual. O equivalente de marco aprovado e `aprovado_em`. |
| aprovador_inicio_em | Nao | Nao consta no schema atual. |

## Diagnostico

- A coluna real para o erro anterior `finalizado_em` e `fim_em`.
- A coluna real para o erro atual `concluida_em` nao e uma nova coluna; a conclusao deve ser representada por `status = 'concluida'` + `fim_em`.
- No fluxo de auditoria, tambem existem marcadores reais: `auditado_em`, `auditado_por` e `auditor_fim_em`.
- Criar coluna `concluida_em` seria duplicar sem necessidade o conceito ja coberto por `fim_em` e marcadores de auditoria.
