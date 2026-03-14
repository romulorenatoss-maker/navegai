
-- Tabela de clientes
CREATE TABLE public.clientes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cpf TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(cpf)
);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage clientes" ON public.clientes
  FOR ALL TO public USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated can view clientes" ON public.clientes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Avaliadores can insert clientes" ON public.clientes
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'avaliador'::app_role) OR is_admin(auth.uid()));

-- Add cliente_id to ordens_servico
ALTER TABLE public.ordens_servico ADD COLUMN cliente_id UUID REFERENCES public.clientes(id);

-- Trigger for updated_at
CREATE TRIGGER update_clientes_updated_at
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migrate existing client data from ordens_servico into clientes table
INSERT INTO public.clientes (nome, cpf)
SELECT DISTINCT cliente_nome, cliente_cpf
FROM public.ordens_servico
WHERE cliente_nome IS NOT NULL
ON CONFLICT (cpf) DO NOTHING;

-- Link existing OS to the new clientes records
UPDATE public.ordens_servico os
SET cliente_id = c.id
FROM public.clientes c
WHERE os.cliente_nome = c.nome AND (os.cliente_cpf = c.cpf OR (os.cliente_cpf IS NULL AND c.cpf IS NULL));
