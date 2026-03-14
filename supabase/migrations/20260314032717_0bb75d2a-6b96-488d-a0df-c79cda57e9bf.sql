
DROP POLICY "Avaliadores can insert OS" ON public.ordens_servico;
CREATE POLICY "Avaliadores can insert OS" ON public.ordens_servico FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'avaliador') OR has_role(auth.uid(), 'admin'));
