-- Allow gestores to manage colaborador_setores
CREATE POLICY "Gestores can manage colaborador_setores" ON public.colaborador_setores
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'gestor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor'::app_role));