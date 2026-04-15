ALTER TABLE public.operational_templates 
ADD COLUMN IF NOT EXISTS tipo_atribuicao_avaliado text NOT NULL DEFAULT 'individual';