ALTER TABLE public.operational_field_reviews
  ADD COLUMN IF NOT EXISTS criado_por_papel TEXT DEFAULT 'aprovador',
  ADD COLUMN IF NOT EXISTS destinatario_papel TEXT DEFAULT 'executor';