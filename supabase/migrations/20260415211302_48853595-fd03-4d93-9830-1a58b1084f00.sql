
ALTER TABLE public.operational_template_sections
ADD COLUMN IF NOT EXISTS horario_inicio time DEFAULT NULL,
ADD COLUMN IF NOT EXISTS horario_fim time DEFAULT NULL;
