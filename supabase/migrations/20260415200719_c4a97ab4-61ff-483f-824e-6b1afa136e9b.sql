ALTER TABLE public.operational_template_fields
ADD COLUMN IF NOT EXISTS aprovador_verificar boolean NOT NULL DEFAULT false;