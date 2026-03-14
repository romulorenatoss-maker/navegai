
-- Create os_perguntas table to snapshot questions per OS
CREATE TABLE public.os_perguntas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  os_id UUID NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  pergunta_id UUID NOT NULL REFERENCES public.perguntas_avaliacao(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(os_id, pergunta_id)
);

-- Enable RLS
ALTER TABLE public.os_perguntas ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated can view os_perguntas" ON public.os_perguntas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Avaliadores can insert os_perguntas" ON public.os_perguntas FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'avaliador'::app_role) OR is_admin(auth.uid()));
CREATE POLICY "Admins can manage os_perguntas" ON public.os_perguntas FOR ALL TO public USING (is_admin(auth.uid()));

-- Create unique index on respostas_avaliacao for proper upsert
CREATE UNIQUE INDEX IF NOT EXISTS respostas_os_pergunta ON public.respostas_avaliacao(ordem_servico_id, pergunta_id);
