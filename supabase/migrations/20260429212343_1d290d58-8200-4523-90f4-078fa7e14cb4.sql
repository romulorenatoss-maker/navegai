ALTER TABLE public.propostas_produtos
  ADD COLUMN IF NOT EXISTS placeholder_key text,
  ADD COLUMN IF NOT EXISTS placeholder_qtd text,
  ADD COLUMN IF NOT EXISTS placeholder_valor text,
  ADD COLUMN IF NOT EXISTS is_checkbox boolean NOT NULL DEFAULT false;