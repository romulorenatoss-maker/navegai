-- Coluna para anexo de evidência do aprovador
ALTER TABLE public.operational_approval_answers
  ADD COLUMN IF NOT EXISTS evidencia_url text;

-- Flag por campo: se aprovador deve anexar evidência mesmo quando responde "Conforme"
ALTER TABLE public.operational_template_fields
  ADD COLUMN IF NOT EXISTS aprovador_exige_evidencia boolean NOT NULL DEFAULT false;