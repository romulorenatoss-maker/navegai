
-- Junction table: avaliador <-> tipos_servico
CREATE TABLE public.avaliador_tipos_servico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  avaliador_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tipo_servico_id UUID NOT NULL REFERENCES public.tipos_servico(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(avaliador_id, tipo_servico_id)
);

ALTER TABLE public.avaliador_tipos_servico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage avaliador_tipos_servico" ON public.avaliador_tipos_servico
  FOR ALL TO public USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated can view avaliador_tipos_servico" ON public.avaliador_tipos_servico
  FOR SELECT TO authenticated USING (true);

-- Migrate existing data: insert from perguntas_avaliacao where avaliador_id is set
INSERT INTO public.avaliador_tipos_servico (avaliador_id, tipo_servico_id)
SELECT DISTINCT avaliador_id, tipo_servico_id
FROM public.perguntas_avaliacao
WHERE avaliador_id IS NOT NULL AND tipo_servico_id IS NOT NULL
ON CONFLICT DO NOTHING;
