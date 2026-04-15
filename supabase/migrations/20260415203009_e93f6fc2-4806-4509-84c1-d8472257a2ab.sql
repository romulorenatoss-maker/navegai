ALTER TABLE public.operational_template_fields
ADD COLUMN IF NOT EXISTS opcoes_regras jsonb DEFAULT '[]'::jsonb;