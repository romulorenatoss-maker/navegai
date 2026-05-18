ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS criado_por uuid DEFAULT auth.uid();

CREATE POLICY "Creator can view own clientes"
ON public.clientes
FOR SELECT
TO authenticated
USING (criado_por = auth.uid());