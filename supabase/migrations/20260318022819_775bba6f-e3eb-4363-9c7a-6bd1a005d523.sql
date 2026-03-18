
-- Allow atendentes (avaliado role) to also insert clientes during lead conversion
DROP POLICY IF EXISTS "Authorized can insert clientes" ON public.clientes;
CREATE POLICY "Authorized can insert clientes" ON public.clientes
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- But restrict SELECT to admin/avaliador (sensitive PII)
-- Already done in previous migration

-- Allow atendentes to view clientes they are linked to via leads
DROP POLICY IF EXISTS "Authorized can view clientes" ON public.clientes;
CREATE POLICY "Authorized can view clientes" ON public.clientes
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'avaliador'::app_role)
    OR is_admin(auth.uid())
    OR id IN (
      SELECT cliente_id FROM leads 
      WHERE responsavel_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
      AND cliente_id IS NOT NULL
    )
  );
