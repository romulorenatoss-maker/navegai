
-- Add time window columns to operational_template_steps
ALTER TABLE public.operational_template_steps
  ADD COLUMN IF NOT EXISTS horario_inicio time DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS horario_fim time DEFAULT NULL;

-- Add delay tracking to operational_execution_step_logs
ALTER TABLE public.operational_execution_step_logs
  ADD COLUMN IF NOT EXISTS atrasado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS atraso_minutos integer DEFAULT NULL;

-- Add change history tracking to operational_field_answers
ALTER TABLE public.operational_field_answers
  ADD COLUMN IF NOT EXISTS historico_alteracoes jsonb DEFAULT '[]'::jsonb;
