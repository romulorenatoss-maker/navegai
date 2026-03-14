
-- Add is_audit_only flag to respostas_avaliacao
ALTER TABLE public.respostas_avaliacao ADD COLUMN IF NOT EXISTS is_audit_only BOOLEAN NOT NULL DEFAULT false;

-- Create inconsistencies table
CREATE TABLE public.avaliacoes_inconsistencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_servico_id UUID NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  pergunta_id UUID NOT NULL REFERENCES public.perguntas_avaliacao(id) ON DELETE CASCADE,
  respostas_por_avaliador JSONB NOT NULL DEFAULT '[]'::jsonb,
  setor_responsavel_id UUID REFERENCES public.setores(id),
  tipo_avaliacao_responsavel_id UUID REFERENCES public.tipos_avaliacao(id),
  detectada_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolvida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.avaliacoes_inconsistencias ENABLE ROW LEVEL SECURITY;

-- RLS policies for inconsistencies
CREATE POLICY "Admins can manage inconsistencias" ON public.avaliacoes_inconsistencias FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view inconsistencias" ON public.avaliacoes_inconsistencias FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert inconsistencias" ON public.avaliacoes_inconsistencias FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update inconsistencias" ON public.avaliacoes_inconsistencias FOR UPDATE TO authenticated USING (true);
