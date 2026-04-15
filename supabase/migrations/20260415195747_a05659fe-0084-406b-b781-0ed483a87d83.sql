ALTER TABLE public.operational_templates
ADD COLUMN IF NOT EXISTS penalidade_fora_prazo numeric NOT NULL DEFAULT 20;