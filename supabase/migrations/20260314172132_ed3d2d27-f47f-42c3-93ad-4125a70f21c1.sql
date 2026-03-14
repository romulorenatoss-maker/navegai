
-- Table for linked question inconsistencies (answer_A != answer_B within same OS)
CREATE TABLE public.inconsistencias_vinculadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ordem_servico_id UUID NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  pergunta_a_id UUID NOT NULL REFERENCES public.perguntas_avaliacao(id) ON DELETE CASCADE,
  pergunta_b_id UUID NOT NULL REFERENCES public.perguntas_avaliacao(id) ON DELETE CASCADE,
  resposta_a TEXT NOT NULL,
  resposta_b TEXT NOT NULL,
  avaliacao_id UUID REFERENCES public.avaliacoes(id) ON DELETE CASCADE,
  detectada_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.inconsistencias_vinculadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view inconsistencias_vinculadas" ON public.inconsistencias_vinculadas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Avaliadores can insert inconsistencias_vinculadas" ON public.inconsistencias_vinculadas
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'avaliador'::app_role) OR is_admin(auth.uid()));

CREATE POLICY "Admins can manage inconsistencias_vinculadas" ON public.inconsistencias_vinculadas
  FOR ALL TO public USING (is_admin(auth.uid()));
