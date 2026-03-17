
-- Add relational address columns to clientes
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS cidade_id uuid REFERENCES public.cidades(id);
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS bairro_id uuid REFERENCES public.bairros(id);
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS rua_id uuid REFERENCES public.ruas(id);

CREATE INDEX IF NOT EXISTS idx_clientes_cidade_id ON public.clientes(cidade_id);
CREATE INDEX IF NOT EXISTS idx_clientes_bairro_id ON public.clientes(bairro_id);
CREATE INDEX IF NOT EXISTS idx_clientes_rua_id ON public.clientes(rua_id);
