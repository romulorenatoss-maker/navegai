CREATE POLICY "Users can insert own ad-hoc assignments"
ON public.operational_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  created_by IN (
    SELECT p.id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
  )
  AND responsavel_id IN (
    SELECT p.id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
  )
  AND COALESCE(avaliado_id, responsavel_id) IN (
    SELECT p.id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
  )
  AND template_id IN (
    SELECT t.id
    FROM public.operational_templates t
    WHERE t.origem = 'ad_hoc'
      AND t.responsavel_id IN (
        SELECT p.id
        FROM public.profiles p
        WHERE p.user_id = auth.uid()
      )
  )
);