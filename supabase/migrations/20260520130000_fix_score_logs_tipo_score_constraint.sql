-- =============================================================================
-- Fix: operational_score_logs constraint estava em conflito com trigger
-- =============================================================================
-- O constraint adicionado em 20260514051025 aceita só ('executor','avaliado','auditor').
-- Mas a função de trigger em 20260514183227 (recalcular_score_assignment) insere
-- linhas com tipo_score='aprovador' quando score_aprovador IS NOT NULL.
-- Resultado: ao confirmar auditoria, o trigger viola o constraint.
--
-- Fix: adicionar 'aprovador' ao CHECK constraint. Mantem compat com codigo e trigger.
-- =============================================================================

ALTER TABLE public.operational_score_logs
  DROP CONSTRAINT IF EXISTS operational_score_logs_tipo_score_check;

ALTER TABLE public.operational_score_logs
  ADD CONSTRAINT operational_score_logs_tipo_score_check
  CHECK (tipo_score IN ('executor', 'avaliado', 'auditor', 'aprovador'));

COMMENT ON CONSTRAINT operational_score_logs_tipo_score_check
  ON public.operational_score_logs IS
  'Valores válidos de tipo_score. ''aprovador'' adicionado para suportar score_aprovador inserido pelo trigger recalcular_score_assignment.';
