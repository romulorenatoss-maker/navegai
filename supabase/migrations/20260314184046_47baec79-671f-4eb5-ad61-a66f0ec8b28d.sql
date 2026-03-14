
CREATE POLICY "Avaliadores can view avaliacoes on same OS"
ON public.avaliacoes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.avaliacoes a2
    JOIN public.profiles p ON p.id = a2.avaliador_id AND p.user_id = auth.uid()
    WHERE a2.ordem_servico_id = avaliacoes.ordem_servico_id
  )
);
