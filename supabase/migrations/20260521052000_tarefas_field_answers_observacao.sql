-- ============================================================================
-- TAREFAS - OBSERVACAO NAS RESPOSTAS ORIGINAIS DO EXECUTOR
-- Data: 2026-05-21
-- Escopo: operational_field_answers + tarefas_rpc_executor_enviar_respostas
-- ============================================================================
-- A RPC tarefas_rpc_executor_enviar_respostas grava observacao no R0.
-- A tabela operational_field_answers ainda nao tinha a coluna no schema real,
-- causando erro: column "observacao" of relation "operational_field_answers"
-- does not exist.
-- ============================================================================

ALTER TABLE public.operational_field_answers
  ADD COLUMN IF NOT EXISTS observacao TEXT;

COMMENT ON COLUMN public.operational_field_answers.observacao IS
  'Observacao/justificativa enviada pelo executor junto da resposta original R0.';
