
DROP POLICY "Avaliadores can update OS" ON public.ordens_servico;
CREATE POLICY "Authenticated can update OS" ON public.ordens_servico FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'avaliador') OR has_role(auth.uid(), 'admin'));
