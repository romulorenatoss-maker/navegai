
-- The previous migration partially applied. Let's check and fix any remaining items.
-- Re-run only the statements that may not have applied due to the error.

-- Verify and recreate if needed (DROP IF EXISTS is idempotent)
DROP POLICY IF EXISTS "Authenticated can insert cliente_contatos" ON public.cliente_contatos;
CREATE POLICY "Authorized can insert cliente_contatos" ON public.cliente_contatos
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'avaliador'::app_role)
    OR is_admin(auth.uid())
  );
