
-- Table to log OS reopenings for editing
CREATE TABLE public.os_reaberturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_servico_id uuid NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  reaberta_por uuid NOT NULL REFERENCES public.profiles(id),
  motivo text DEFAULT 'edicao_admin',
  campos_alterados text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.os_reaberturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage os_reaberturas" ON public.os_reaberturas FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view os_reaberturas" ON public.os_reaberturas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert os_reaberturas" ON public.os_reaberturas FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
