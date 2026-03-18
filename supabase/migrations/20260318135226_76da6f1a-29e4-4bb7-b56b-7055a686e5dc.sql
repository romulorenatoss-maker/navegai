CREATE POLICY "Authenticated can insert bairros"
ON public.bairros
FOR INSERT
TO authenticated
WITH CHECK (true);