CREATE POLICY "Avaliadores can view all respostas"
ON public.respostas_avaliacao
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'avaliador'::app_role) OR is_admin(auth.uid())
);