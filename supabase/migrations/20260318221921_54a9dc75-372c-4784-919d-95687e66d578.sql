
DROP POLICY "Avaliadores can insert registro_objecao_lead" ON public.registro_objecao_lead;

CREATE POLICY "Authenticated can insert registro_objecao_lead"
ON public.registro_objecao_lead
FOR INSERT
TO authenticated
WITH CHECK (
  colaborador_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  )
  OR is_admin(auth.uid())
);
