
-- Fix INSERT policy: only avaliadores and admins can insert
DROP POLICY "Authenticated can insert inconsistencias" ON public.avaliacoes_inconsistencias;
CREATE POLICY "Avaliadores can insert inconsistencias" ON public.avaliacoes_inconsistencias FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'avaliador'::app_role) OR is_admin(auth.uid()));

-- Fix UPDATE policy: only admins can update (resolve)
DROP POLICY "Authenticated can update inconsistencias" ON public.avaliacoes_inconsistencias;
CREATE POLICY "Admins can update inconsistencias" ON public.avaliacoes_inconsistencias FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
