
-- Add new nullable columns to clientes table for lead conversion
-- These are optional so the OS client creation flow (nome + cpf only) remains untouched
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS rg TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS nome_mae TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS cidade TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS referencia TEXT;

-- Add lead_id to track which lead originated this client (nullable)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id);
