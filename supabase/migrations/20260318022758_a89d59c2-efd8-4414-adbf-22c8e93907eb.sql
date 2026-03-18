
-- Fix remaining overly permissive INSERT policies

-- leads INSERT: scope to admin/avaliador or own profile
DROP POLICY IF EXISTS "Authenticated can insert leads" ON public.leads;
CREATE POLICY "Authorized can insert leads" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'avaliador'::app_role)
    OR is_admin(auth.uid())
    OR (responsavel_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  );

-- lead_contatos UPDATE: scope to responsavel or admin/avaliador
DROP POLICY IF EXISTS "Authenticated can update lead_contatos" ON public.lead_contatos;
CREATE POLICY "Authorized can update lead_contatos" ON public.lead_contatos
  FOR UPDATE TO authenticated
  USING (
    lead_id IN (SELECT id FROM leads WHERE responsavel_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
    OR has_role(auth.uid(), 'avaliador'::app_role)
    OR is_admin(auth.uid())
  );

-- lead_tarefas_contato INSERT: scope properly
DROP POLICY IF EXISTS "Authenticated can insert lead_tarefas_contato" ON public.lead_tarefas_contato;
CREATE POLICY "Authorized can insert lead_tarefas_contato" ON public.lead_tarefas_contato
  FOR INSERT TO authenticated
  WITH CHECK (
    responsavel_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR responsavel_id IS NULL
    OR has_role(auth.uid(), 'avaliador'::app_role)
    OR is_admin(auth.uid())
  );

-- OS INSERT: scope to admin/avaliador (standard users shouldn't create OS directly)
DROP POLICY IF EXISTS "Authenticated can insert OS" ON public.ordens_servico;
CREATE POLICY "Authorized can insert OS" ON public.ordens_servico
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'avaliador'::app_role)
    OR is_admin(auth.uid())
    OR (atendente_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  );

-- clientes INSERT: scope to admin/avaliador or own conversion flow
DROP POLICY IF EXISTS "Authenticated can insert clientes" ON public.clientes;
CREATE POLICY "Authorized can insert clientes" ON public.clientes
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'avaliador'::app_role)
    OR is_admin(auth.uid())
  );
