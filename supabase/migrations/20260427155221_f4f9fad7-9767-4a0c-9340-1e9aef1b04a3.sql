CREATE POLICY "Avaliados can view own lead clientes"
ON public.clientes
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'avaliado'::app_role)
  AND id IN (
    SELECT leads.cliente_id
    FROM leads
    WHERE leads.cliente_id IS NOT NULL
      AND (
        leads.responsavel_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
        OR leads.convertido_por IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
      )
  )
);