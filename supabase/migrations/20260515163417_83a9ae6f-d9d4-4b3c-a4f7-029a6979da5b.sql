ALTER TABLE operational_field_reviews
  ADD COLUMN IF NOT EXISTS tipo_evidencia_exigida text DEFAULT 'nenhuma',
  ADD COLUMN IF NOT EXISTS instrucao_aprovador text;