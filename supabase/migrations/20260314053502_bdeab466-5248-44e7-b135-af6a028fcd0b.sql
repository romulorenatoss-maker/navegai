
-- Ensure no duplicate OS numbers
CREATE UNIQUE INDEX IF NOT EXISTS ordens_servico_numero_os_unique ON public.ordens_servico (numero_os);
