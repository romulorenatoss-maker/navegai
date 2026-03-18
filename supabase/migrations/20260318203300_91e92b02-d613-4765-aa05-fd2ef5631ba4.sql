
CREATE POLICY "Authenticated can update ciencia on lead_historico"
ON public.lead_historico
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
