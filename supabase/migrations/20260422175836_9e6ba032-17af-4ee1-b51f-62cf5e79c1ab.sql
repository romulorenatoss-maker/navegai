-- Fix RLS policies for clientes to allow avaliadores/admins to create + read clients
-- The issue: after INSERT...SELECT, the row must be visible via SELECT policy.
-- Avaliadores need to view newly created clients for OS workflow.

DROP POLICY IF EXISTS "Authorized can view clientes" ON public.clientes;

CREATE POLICY "Authorized can view clientes"
ON public.clientes
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR has_role(auth.uid(), 'avaliador'::app_role)
  OR id IN (
    SELECT leads.cliente_id
    FROM leads
    WHERE leads.cliente_id IS NOT NULL
      AND (
        leads.responsavel_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
        OR leads.convertido_por IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
      )
  )
);

-- Ensure update is allowed for avaliadores/admins (was missing explicit UPDATE policy)
DROP POLICY IF EXISTS "Authorized can update clientes" ON public.clientes;

CREATE POLICY "Authorized can update clientes"
ON public.clientes
FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'avaliador'::app_role))
WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'avaliador'::app_role));