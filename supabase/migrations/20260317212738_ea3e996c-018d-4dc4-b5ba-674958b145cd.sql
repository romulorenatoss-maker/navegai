
-- Create a function to normalize CPF (digits only)
CREATE OR REPLACE FUNCTION public.normalize_cpf(cpf_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(COALESCE(cpf_input, ''), '\D', '', 'g');
$$;

-- Create unique index on normalized CPF (only for non-empty CPFs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_cpf_normalized 
ON public.clientes (normalize_cpf(cpf))
WHERE cpf IS NOT NULL AND cpf != '';

-- Also normalize existing CPF data in ordens_servico to match clientes
-- (no-op if already consistent)
