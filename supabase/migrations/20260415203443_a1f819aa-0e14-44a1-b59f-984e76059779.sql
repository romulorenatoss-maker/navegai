ALTER TABLE public.operational_template_fields
ADD COLUMN IF NOT EXISTS aprovador_pergunta text DEFAULT '',
ADD COLUMN IF NOT EXISTS aprovador_tipo_resposta text DEFAULT 'conforme',
ADD COLUMN IF NOT EXISTS aprovador_peso numeric DEFAULT 1,
ADD COLUMN IF NOT EXISTS aprovador_obriga_observacao_nao boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS aprovador_exige_evidencia_nao boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS aprovador_tipos_evidencia jsonb DEFAULT '["foto"]'::jsonb;