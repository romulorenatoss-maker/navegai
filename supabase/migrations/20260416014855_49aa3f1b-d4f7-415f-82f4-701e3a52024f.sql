DROP POLICY IF EXISTS "Authenticated can insert contingencies" ON public.operational_contingencies;

CREATE POLICY "Authenticated can insert contingencies"
ON public.operational_contingencies
FOR INSERT
TO authenticated
WITH CHECK (
  is_admin(auth.uid())
  OR responsavel_id IN (
    SELECT id
    FROM public.profiles
    WHERE user_id = auth.uid()
  )
  OR assignment_id IN (
    SELECT id
    FROM public.operational_assignments
    WHERE responsavel_id IN (
      SELECT id
      FROM public.profiles
      WHERE user_id = auth.uid()
    )
  )
  OR assignment_id IN (
    SELECT id
    FROM public.operational_assignments
    WHERE avaliador_id IN (
      SELECT id
      FROM public.profiles
      WHERE user_id = auth.uid()
    )
  )
);