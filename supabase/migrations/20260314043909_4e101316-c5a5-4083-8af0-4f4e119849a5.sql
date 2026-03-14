
-- Allow avaliadores to insert perguntas
CREATE POLICY "Avaliadores can insert perguntas"
ON public.perguntas_avaliacao
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'avaliador') OR public.is_admin(auth.uid())
);

-- Allow avaliadores to update perguntas
CREATE POLICY "Avaliadores can update perguntas"
ON public.perguntas_avaliacao
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'avaliador') OR public.is_admin(auth.uid())
);

-- Allow avaliadores to delete perguntas
CREATE POLICY "Avaliadores can delete perguntas"
ON public.perguntas_avaliacao
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'avaliador') OR public.is_admin(auth.uid())
);
