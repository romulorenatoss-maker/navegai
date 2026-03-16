
-- Fix overly permissive INSERT policies on lead tables

-- leads: restrict insert to avaliadores/admins
DROP POLICY "Authenticated can insert leads" ON public.leads;
CREATE POLICY "Avaliadores can insert leads" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'avaliador'::app_role) OR is_admin(auth.uid()));

-- lead_contatos: restrict insert to avaliadores/admins
DROP POLICY "Authenticated can insert lead_contatos" ON public.lead_contatos;
CREATE POLICY "Avaliadores can insert lead_contatos" ON public.lead_contatos FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'avaliador'::app_role) OR is_admin(auth.uid()));

-- lead_contatos: restrict update to avaliadores/admins
DROP POLICY "Authenticated can update lead_contatos" ON public.lead_contatos;
CREATE POLICY "Avaliadores can update lead_contatos" ON public.lead_contatos FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'avaliador'::app_role) OR is_admin(auth.uid()));

-- lead_historico: restrict insert to avaliadores/admins
DROP POLICY "Authenticated can insert lead_historico" ON public.lead_historico;
CREATE POLICY "Avaliadores can insert lead_historico" ON public.lead_historico FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'avaliador'::app_role) OR is_admin(auth.uid()));
