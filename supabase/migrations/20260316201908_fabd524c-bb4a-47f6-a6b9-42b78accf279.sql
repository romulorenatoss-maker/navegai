
-- Table: rotina_tentativas_leads
CREATE TABLE public.rotina_tentativas_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tentativa_numero integer NOT NULL,
  dias_apos_anterior integer NOT NULL DEFAULT 0,
  periodo_contato text NOT NULL DEFAULT 'manha',
  prioridade text NOT NULL DEFAULT 'media',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tentativa_numero)
);

ALTER TABLE public.rotina_tentativas_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage rotina_tentativas_leads" ON public.rotina_tentativas_leads FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view rotina_tentativas_leads" ON public.rotina_tentativas_leads FOR SELECT TO authenticated USING (true);

-- Table: configuracao_fluxo_leads
CREATE TABLE public.configuracao_fluxo_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quantidade_tentativas integer NOT NULL DEFAULT 7,
  acao_quando_atrasar text NOT NULL DEFAULT 'registrar_atraso',
  acao_apos_finalizar_tentativas text NOT NULL DEFAULT 'enviar_avaliador',
  permitir_reiniciar_rotina boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.configuracao_fluxo_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage configuracao_fluxo_leads" ON public.configuracao_fluxo_leads FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view configuracao_fluxo_leads" ON public.configuracao_fluxo_leads FOR SELECT TO authenticated USING (true);

-- Insert default config row
INSERT INTO public.configuracao_fluxo_leads (quantidade_tentativas, acao_quando_atrasar, acao_apos_finalizar_tentativas, permitir_reiniciar_rotina)
VALUES (7, 'registrar_atraso', 'enviar_avaliador', true);

-- Table: lead_tarefas_contato
CREATE TABLE public.lead_tarefas_contato (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tentativa integer NOT NULL DEFAULT 1,
  data_contato timestamptz NOT NULL DEFAULT now(),
  periodo text NOT NULL DEFAULT 'manha',
  status text NOT NULL DEFAULT 'pendente',
  responsavel_id uuid REFERENCES public.profiles(id),
  data_criacao timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_tarefas_contato ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage lead_tarefas_contato" ON public.lead_tarefas_contato FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view lead_tarefas_contato" ON public.lead_tarefas_contato FOR SELECT TO authenticated USING (true);
CREATE POLICY "Avaliadores can insert lead_tarefas_contato" ON public.lead_tarefas_contato FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'avaliador'::app_role) OR is_admin(auth.uid()));
CREATE POLICY "Avaliadores can update lead_tarefas_contato" ON public.lead_tarefas_contato FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'avaliador'::app_role) OR is_admin(auth.uid()));

CREATE INDEX idx_lead_tarefas_contato_lead_id ON public.lead_tarefas_contato(lead_id);
CREATE INDEX idx_lead_tarefas_contato_status ON public.lead_tarefas_contato(status);
CREATE INDEX idx_lead_tarefas_contato_data ON public.lead_tarefas_contato(data_contato);

-- Insert default rotina tentativas (7 tentativas)
INSERT INTO public.rotina_tentativas_leads (tentativa_numero, dias_apos_anterior, periodo_contato, prioridade) VALUES
  (1, 0, 'manha', 'alta'),
  (2, 0, 'tarde', 'alta'),
  (3, 1, 'manha', 'media'),
  (4, 1, 'noite', 'media'),
  (5, 2, 'manha', 'media'),
  (6, 3, 'tarde', 'baixa'),
  (7, 5, 'manha', 'baixa');
