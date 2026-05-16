ALTER TABLE operational_contingencies ADD COLUMN IF NOT EXISTS itens_plano jsonb DEFAULT '[]'::jsonb;
ALTER TABLE operational_approval_answers ADD COLUMN IF NOT EXISTS itens_plano jsonb DEFAULT '[]'::jsonb;
ALTER TABLE operational_field_reviews ADD COLUMN IF NOT EXISTS itens_plano jsonb DEFAULT '[]'::jsonb;