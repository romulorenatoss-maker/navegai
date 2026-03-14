
-- Create junction table for many-to-many between tipos_servico and checklists
CREATE TABLE public.tipo_servico_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_servico_id uuid NOT NULL REFERENCES public.tipos_servico(id) ON DELETE CASCADE,
  checklist_id uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tipo_servico_id, checklist_id)
);

-- Enable RLS
ALTER TABLE public.tipo_servico_checklists ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can manage tipo_servico_checklists" ON public.tipo_servico_checklists FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view tipo_servico_checklists" ON public.tipo_servico_checklists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Avaliadores can manage tipo_servico_checklists" ON public.tipo_servico_checklists FOR ALL TO authenticated USING (has_role(auth.uid(), 'avaliador'::app_role) OR is_admin(auth.uid()));
