
-- Helper: verifica se o usuário atual é dono (responsável ou convertido_por) de algum lead vinculado ao cliente
CREATE OR REPLACE FUNCTION public.is_lead_owner_of_cliente(_cliente_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM leads l
    JOIN profiles p ON p.user_id = auth.uid()
    WHERE l.cliente_id = _cliente_id
      AND (l.responsavel_id = p.id OR l.convertido_por = p.id)
  );
$$;

-- clientes: UPDATE também para dono do lead
DROP POLICY IF EXISTS "Authorized can update clientes" ON public.clientes;
CREATE POLICY "Authorized can update clientes" ON public.clientes
FOR UPDATE TO authenticated
USING (is_admin(auth.uid()) OR has_role(auth.uid(),'avaliador'::app_role) OR public.is_lead_owner_of_cliente(id))
WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'avaliador'::app_role) OR public.is_lead_owner_of_cliente(id));

-- cliente_contatos: INSERT também para dono do lead
DROP POLICY IF EXISTS "Authorized can insert cliente_contatos" ON public.cliente_contatos;
CREATE POLICY "Authorized can insert cliente_contatos" ON public.cliente_contatos
FOR INSERT TO authenticated
WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'avaliador'::app_role) OR public.is_lead_owner_of_cliente(cliente_id));

-- cliente_contatos: UPDATE também para dono do lead
DROP POLICY IF EXISTS "Avaliadores can update cliente_contatos" ON public.cliente_contatos;
CREATE POLICY "Authorized can update cliente_contatos" ON public.cliente_contatos
FOR UPDATE TO authenticated
USING (is_admin(auth.uid()) OR has_role(auth.uid(),'avaliador'::app_role) OR public.is_lead_owner_of_cliente(cliente_id))
WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'avaliador'::app_role) OR public.is_lead_owner_of_cliente(cliente_id));
