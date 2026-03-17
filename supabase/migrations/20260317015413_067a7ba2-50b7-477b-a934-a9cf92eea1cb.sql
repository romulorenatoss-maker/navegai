
-- Tabela de cidades
CREATE TABLE public.cidades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.cidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage cidades" ON public.cidades FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view cidades" ON public.cidades FOR SELECT TO authenticated USING (true);
CREATE POLICY "Avaliadores can insert cidades" ON public.cidades FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'avaliador') OR is_admin(auth.uid()));

-- Tabela de bairros (linked to cidade)
CREATE TABLE public.bairros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cidade_id UUID NOT NULL REFERENCES public.cidades(id) ON DELETE CASCADE,
  cep TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(nome, cidade_id)
);
ALTER TABLE public.bairros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage bairros" ON public.bairros FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view bairros" ON public.bairros FOR SELECT TO authenticated USING (true);
CREATE POLICY "Avaliadores can insert bairros" ON public.bairros FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'avaliador') OR is_admin(auth.uid()));

-- Tabela de ruas (linked to bairro)
CREATE TABLE public.ruas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  bairro_id UUID NOT NULL REFERENCES public.bairros(id) ON DELETE CASCADE,
  cep TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(nome, bairro_id)
);
ALTER TABLE public.ruas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage ruas" ON public.ruas FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view ruas" ON public.ruas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Avaliadores can insert ruas" ON public.ruas FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'avaliador') OR is_admin(auth.uid()));

-- Add address columns to leads
ALTER TABLE public.leads ADD COLUMN cidade_id UUID REFERENCES public.cidades(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN bairro_id UUID REFERENCES public.bairros(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN rua_id UUID REFERENCES public.ruas(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN numero_endereco TEXT;

-- Add update policies for avaliadores on address tables
CREATE POLICY "Avaliadores can update cidades" ON public.cidades FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'avaliador') OR is_admin(auth.uid()));
CREATE POLICY "Avaliadores can update bairros" ON public.bairros FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'avaliador') OR is_admin(auth.uid()));
CREATE POLICY "Avaliadores can update ruas" ON public.ruas FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'avaliador') OR is_admin(auth.uid()));

-- Admin delete policies
CREATE POLICY "Admins can delete cidades" ON public.cidades FOR DELETE USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete bairros" ON public.bairros FOR DELETE USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete ruas" ON public.ruas FOR DELETE USING (is_admin(auth.uid()));
