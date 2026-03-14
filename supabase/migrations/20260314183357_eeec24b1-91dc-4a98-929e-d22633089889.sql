
CREATE POLICY "Avaliadores can view respostas on same OS"
ON public.respostas_avaliacao
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM avaliacoes a1
    JOIN avaliacoes a2 ON a2.ordem_servico_id = a1.ordem_servico_id
    JOIN profiles p ON p.id = a2.avaliador_id AND p.user_id = auth.uid()
    WHERE a1.id = respostas_avaliacao.avaliacao_id
  )
);
