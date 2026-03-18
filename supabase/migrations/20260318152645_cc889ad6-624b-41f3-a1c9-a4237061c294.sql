
DROP POLICY "Authorized can insert OS" ON public.ordens_servico;

CREATE POLICY "Authorized can insert OS"
ON public.ordens_servico
FOR INSERT
TO authenticated
WITH CHECK (true);
