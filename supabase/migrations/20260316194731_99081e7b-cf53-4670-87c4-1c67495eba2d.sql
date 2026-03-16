
-- =============================================
-- MÓDULO: GESTÃO DE LEADS
-- Novas tabelas (não altera módulos existentes)
-- =============================================

-- 1. Tabela de planos (referenciada por leads)
CREATE TABLE public.planos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_plano TEXT NOT NULL,
  velocidade TEXT,
  descricao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage planos" ON public.planos FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view planos" ON public.planos FOR SELECT TO authenticated USING (true);

-- 2. Tabela principal de leads
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  status_lead TEXT NOT NULL DEFAULT 'novo',
  responsavel_id UUID REFERENCES public.profiles(id),
  plano_id UUID REFERENCES public.planos(id),
  data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage leads" ON public.leads FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view leads" ON public.leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert leads" ON public.leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Responsavel can update own leads" ON public.leads FOR UPDATE TO authenticated
  USING (responsavel_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR is_admin(auth.uid()));

-- 3. Contatos do lead
CREATE TABLE public.lead_contatos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tipo_contato TEXT NOT NULL CHECK (tipo_contato IN ('telefone', 'email')),
  valor TEXT NOT NULL,
  tem_whatsapp BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage lead_contatos" ON public.lead_contatos FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view lead_contatos" ON public.lead_contatos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert lead_contatos" ON public.lead_contatos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update lead_contatos" ON public.lead_contatos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete lead_contatos" ON public.lead_contatos FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- 4. Interações com o lead
CREATE TABLE public.lead_interacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES public.profiles(id),
  tipo_contato TEXT NOT NULL CHECK (tipo_contato IN ('telefone', 'whatsapp')),
  numero_utilizado TEXT,
  data_interacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resultado TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_interacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage lead_interacoes" ON public.lead_interacoes FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view lead_interacoes" ON public.lead_interacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Colaborador can insert own interacoes" ON public.lead_interacoes FOR INSERT TO authenticated
  WITH CHECK (colaborador_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR is_admin(auth.uid()));

-- 5. Histórico do lead
CREATE TABLE public.lead_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.profiles(id),
  tipo_evento TEXT NOT NULL,
  descricao TEXT,
  data_evento TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage lead_historico" ON public.lead_historico FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view lead_historico" ON public.lead_historico FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert lead_historico" ON public.lead_historico FOR INSERT TO authenticated WITH CHECK (true);

-- 6. Cadência de tentativas (configuração global)
CREATE TABLE public.cadencia_tentativas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_tentativa INTEGER NOT NULL,
  dias_apos INTEGER NOT NULL DEFAULT 0,
  periodo TEXT NOT NULL CHECK (periodo IN ('manha', 'tarde', 'noite')),
  prioridade INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.cadencia_tentativas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage cadencia_tentativas" ON public.cadencia_tentativas FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view cadencia_tentativas" ON public.cadencia_tentativas FOR SELECT TO authenticated USING (true);

-- 7. Registro de atraso de tentativa
CREATE TABLE public.registro_atraso_tentativa (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES public.profiles(id),
  tentativa INTEGER NOT NULL,
  data_programada TIMESTAMP WITH TIME ZONE NOT NULL,
  periodo TEXT NOT NULL CHECK (periodo IN ('manha', 'tarde', 'noite')),
  data_registro TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.registro_atraso_tentativa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage registro_atraso_tentativa" ON public.registro_atraso_tentativa FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view registro_atraso_tentativa" ON public.registro_atraso_tentativa FOR SELECT TO authenticated USING (true);
CREATE POLICY "Colaborador can insert own registro_atraso" ON public.registro_atraso_tentativa FOR INSERT TO authenticated
  WITH CHECK (colaborador_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR is_admin(auth.uid()));

-- 8. Contatos do cliente (extensão do módulo Clientes, sem alterar tabela clientes)
CREATE TABLE public.cliente_contatos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('fixo', 'movel', 'email')),
  valor TEXT NOT NULL,
  tem_whatsapp BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.cliente_contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage cliente_contatos" ON public.cliente_contatos FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view cliente_contatos" ON public.cliente_contatos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Avaliadores can insert cliente_contatos" ON public.cliente_contatos FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'avaliador'::app_role) OR is_admin(auth.uid()));
CREATE POLICY "Avaliadores can update cliente_contatos" ON public.cliente_contatos FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'avaliador'::app_role) OR is_admin(auth.uid()));

-- Trigger para updated_at em leads
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
