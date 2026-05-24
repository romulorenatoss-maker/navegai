-- =========================================================
-- B) Storage: remove SELECT público no bucket instrucoes-campos
-- =========================================================
DROP POLICY IF EXISTS "Anyone can view instrucoes" ON storage.objects;

-- =========================================================
-- C1) clientes — restringir INSERT
-- =========================================================
DROP POLICY IF EXISTS "Authorized can insert clientes" ON public.clientes;

CREATE POLICY "Authorized can insert clientes"
ON public.clientes
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'avaliador'::app_role)
  OR criado_por = auth.uid()
);

-- =========================================================
-- C2) cliente_contatos — restringir SELECT
-- =========================================================
DROP POLICY IF EXISTS "Authenticated can view cliente_contatos" ON public.cliente_contatos;

CREATE POLICY "Authorized can view cliente_contatos"
ON public.cliente_contatos
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'avaliador'::app_role)
  OR public.is_lead_owner_of_cliente(cliente_id)
);

-- =========================================================
-- C3) cliente_responsaveis — restringir TODOS os comandos
-- =========================================================
DROP POLICY IF EXISTS "Authenticated users can view cliente_responsaveis" ON public.cliente_responsaveis;
DROP POLICY IF EXISTS "Authenticated users can insert cliente_responsaveis" ON public.cliente_responsaveis;
DROP POLICY IF EXISTS "Authenticated users can update cliente_responsaveis" ON public.cliente_responsaveis;
DROP POLICY IF EXISTS "Authenticated users can delete cliente_responsaveis" ON public.cliente_responsaveis;

CREATE POLICY "Authorized can view cliente_responsaveis"
ON public.cliente_responsaveis
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'avaliador'::app_role)
  OR public.is_lead_owner_of_cliente(cliente_id)
);

CREATE POLICY "Authorized can insert cliente_responsaveis"
ON public.cliente_responsaveis
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'avaliador'::app_role)
  OR public.is_lead_owner_of_cliente(cliente_id)
);

CREATE POLICY "Authorized can update cliente_responsaveis"
ON public.cliente_responsaveis
FOR UPDATE
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'avaliador'::app_role)
  OR public.is_lead_owner_of_cliente(cliente_id)
)
WITH CHECK (
  public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'avaliador'::app_role)
  OR public.is_lead_owner_of_cliente(cliente_id)
);

CREATE POLICY "Admins can delete cliente_responsaveis"
ON public.cliente_responsaveis
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));