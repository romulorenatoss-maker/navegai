
-- Add origem_lead to leads table
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS origem_lead text DEFAULT 'manual';

-- Create lead_objecoes table
CREATE TABLE IF NOT EXISTS public.lead_objecoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_objecoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage lead_objecoes" ON public.lead_objecoes FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view lead_objecoes" ON public.lead_objecoes FOR SELECT TO authenticated USING (true);

-- Create registro_objecao_lead table
CREATE TABLE IF NOT EXISTS public.registro_objecao_lead (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  objecao_id uuid NOT NULL REFERENCES public.lead_objecoes(id),
  colaborador_id uuid NOT NULL REFERENCES public.profiles(id),
  data_registro timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.registro_objecao_lead ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage registro_objecao_lead" ON public.registro_objecao_lead FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view registro_objecao_lead" ON public.registro_objecao_lead FOR SELECT TO authenticated USING (true);
CREATE POLICY "Avaliadores can insert registro_objecao_lead" ON public.registro_objecao_lead FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'avaliador'::app_role) OR is_admin(auth.uid()));
