
ALTER TABLE public.operational_contingencies 
ADD COLUMN IF NOT EXISTS plano_acao text,
ADD COLUMN IF NOT EXISTS tipos_evidencia_requeridos jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS observacao_tratamento text,
ADD COLUMN IF NOT EXISTS justificativa_rejeicao text;
