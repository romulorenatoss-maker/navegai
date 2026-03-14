
-- Junction table: profile <-> setores (multi-setor support)
CREATE TABLE public.colaborador_setores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  setor_id UUID NOT NULL REFERENCES public.setores(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(profile_id, setor_id)
);

ALTER TABLE public.colaborador_setores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage colaborador_setores" ON public.colaborador_setores
  FOR ALL TO public USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated can view colaborador_setores" ON public.colaborador_setores
  FOR SELECT TO authenticated USING (true);

-- Migrate existing setor_id data
INSERT INTO public.colaborador_setores (profile_id, setor_id)
SELECT id, setor_id FROM public.profiles WHERE setor_id IS NOT NULL
ON CONFLICT DO NOTHING;
