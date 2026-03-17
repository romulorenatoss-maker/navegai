
-- Allow all authenticated users to insert clientes (needed for lead conversion)
DROP POLICY IF EXISTS "Avaliadores can insert clientes" ON public.clientes;
CREATE POLICY "Authenticated can insert clientes"
ON public.clientes FOR INSERT TO authenticated
WITH CHECK (true);

-- Allow all authenticated users to insert cliente_contatos (needed for lead conversion)
DROP POLICY IF EXISTS "Avaliadores can insert cliente_contatos" ON public.cliente_contatos;
CREATE POLICY "Authenticated can insert cliente_contatos"
ON public.cliente_contatos FOR INSERT TO authenticated
WITH CHECK (true);

-- Allow all authenticated users to insert ordens_servico (needed for lead conversion)
DROP POLICY IF EXISTS "Avaliadores can insert OS" ON public.ordens_servico;
CREATE POLICY "Authenticated can insert OS"
ON public.ordens_servico FOR INSERT TO authenticated
WITH CHECK (true);
