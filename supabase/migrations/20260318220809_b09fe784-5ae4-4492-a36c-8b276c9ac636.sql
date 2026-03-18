CREATE POLICY "Authenticated can delete own registro_objecao_lead"
ON public.registro_objecao_lead
FOR DELETE
TO authenticated
USING (
  colaborador_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  )
  OR is_admin(auth.uid())
);