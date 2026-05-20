ALTER TABLE public.operational_score_logs
  DROP CONSTRAINT IF EXISTS operational_score_logs_tipo_score_check;

ALTER TABLE public.operational_score_logs
  ADD CONSTRAINT operational_score_logs_tipo_score_check
  CHECK (tipo_score IN ('executor', 'avaliado', 'auditor', 'aprovador'));