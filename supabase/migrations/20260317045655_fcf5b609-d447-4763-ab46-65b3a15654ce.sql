
-- Allow avaliado role to insert leads
DROP POLICY IF EXISTS "Avaliadores can insert leads" ON public.leads;
CREATE POLICY "Authenticated can insert leads"
  ON public.leads FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow avaliado to insert lead_contatos
DROP POLICY IF EXISTS "Avaliadores can insert lead_contatos" ON public.lead_contatos;
CREATE POLICY "Authenticated can insert lead_contatos"
  ON public.lead_contatos FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow avaliado to insert lead_historico
DROP POLICY IF EXISTS "Avaliadores can insert lead_historico" ON public.lead_historico;
CREATE POLICY "Authenticated can insert lead_historico"
  ON public.lead_historico FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow avaliado to insert lead_tarefas_contato
DROP POLICY IF EXISTS "Avaliadores can insert lead_tarefas_contato" ON public.lead_tarefas_contato;
CREATE POLICY "Authenticated can insert lead_tarefas_contato"
  ON public.lead_tarefas_contato FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow avaliado to update leads (for transfer)
DROP POLICY IF EXISTS "Responsavel can update own leads" ON public.leads;
CREATE POLICY "Authenticated can update leads"
  ON public.leads FOR UPDATE
  TO authenticated
  USING (true);

-- Allow avaliado to update lead_contatos
DROP POLICY IF EXISTS "Avaliadores can update lead_contatos" ON public.lead_contatos;
CREATE POLICY "Authenticated can update lead_contatos"
  ON public.lead_contatos FOR UPDATE
  TO authenticated
  USING (true);

-- Allow avaliado to update lead_tarefas_contato
DROP POLICY IF EXISTS "Avaliadores can update lead_tarefas_contato" ON public.lead_tarefas_contato;
CREATE POLICY "Authenticated can update lead_tarefas_contato"
  ON public.lead_tarefas_contato FOR UPDATE
  TO authenticated
  USING (true);
