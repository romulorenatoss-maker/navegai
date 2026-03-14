
-- OS status enum
CREATE TYPE public.os_status AS ENUM ('aberta', 'em_andamento', 'concluida');

-- Ordens de Serviço table (unique by numero_os)
CREATE TABLE public.ordens_servico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_os TEXT NOT NULL UNIQUE,
  cliente_nome TEXT,
  cliente_cpf TEXT,
  tipo_servico_id UUID REFERENCES public.tipos_servico(id),
  colaborador_avaliado_id UUID REFERENCES public.profiles(id),
  status os_status NOT NULL DEFAULT 'aberta',
  data_abertura TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  data_conclusao TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Avaliacoes: one per evaluator per OS
CREATE TABLE public.avaliacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_servico_id UUID NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  avaliador_id UUID NOT NULL REFERENCES public.profiles(id),
  concluida BOOLEAN NOT NULL DEFAULT false,
  nota_final NUMERIC(5,2),
  observacao_geral TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(ordem_servico_id, avaliador_id)
);

-- Respostas: one per question per evaluation
CREATE TABLE public.respostas_avaliacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avaliacao_id UUID NOT NULL REFERENCES public.avaliacoes(id) ON DELETE CASCADE,
  pergunta_id UUID NOT NULL REFERENCES public.perguntas_avaliacao(id),
  resposta TEXT CHECK (resposta IN ('sim', 'nao', 'na')),
  observacao TEXT,
  evidencia_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(avaliacao_id, pergunta_id)
);

-- Enable RLS
ALTER TABLE public.ordens_servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avaliacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.respostas_avaliacao ENABLE ROW LEVEL SECURITY;

-- RLS: ordens_servico
CREATE POLICY "Admins can manage OS" ON public.ordens_servico FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Avaliadores can view OS" ON public.ordens_servico FOR SELECT TO authenticated USING (true);
CREATE POLICY "Avaliadores can insert OS" ON public.ordens_servico FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Avaliadores can update OS" ON public.ordens_servico FOR UPDATE TO authenticated USING (true);

-- RLS: avaliacoes
CREATE POLICY "Admins can manage avaliacoes" ON public.avaliacoes FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Avaliador can view own avaliacoes" ON public.avaliacoes FOR SELECT TO authenticated USING (
  avaliador_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Avaliador can insert own avaliacoes" ON public.avaliacoes FOR INSERT TO authenticated WITH CHECK (
  avaliador_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Avaliador can update own avaliacoes" ON public.avaliacoes FOR UPDATE TO authenticated USING (
  avaliador_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
-- Colaborador avaliado can view completed OS avaliacoes
CREATE POLICY "Avaliado can view completed avaliacoes" ON public.avaliacoes FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.ordens_servico os
    WHERE os.id = ordem_servico_id AND os.status = 'concluida'
    AND os.colaborador_avaliado_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
);

-- RLS: respostas_avaliacao
CREATE POLICY "Admins can manage respostas" ON public.respostas_avaliacao FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Avaliador can manage own respostas" ON public.respostas_avaliacao FOR ALL TO authenticated USING (
  avaliacao_id IN (
    SELECT a.id FROM public.avaliacoes a
    JOIN public.profiles p ON p.id = a.avaliador_id
    WHERE p.user_id = auth.uid()
  )
);
-- Avaliado can view respostas of completed OS
CREATE POLICY "Avaliado can view completed respostas" ON public.respostas_avaliacao FOR SELECT TO authenticated USING (
  avaliacao_id IN (
    SELECT a.id FROM public.avaliacoes a
    JOIN public.ordens_servico os ON os.id = a.ordem_servico_id
    WHERE os.status = 'concluida'
    AND os.colaborador_avaliado_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
);

-- Function to auto-update OS status when all avaliacoes are completed
CREATE OR REPLACE FUNCTION public.check_os_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_os_id UUID;
  v_total INT;
  v_completed INT;
BEGIN
  SELECT ordem_servico_id INTO v_os_id FROM public.avaliacoes WHERE id = NEW.id;
  
  SELECT COUNT(*), COUNT(*) FILTER (WHERE concluida = true)
  INTO v_total, v_completed
  FROM public.avaliacoes WHERE ordem_servico_id = v_os_id;
  
  IF v_total > 0 AND v_total = v_completed THEN
    UPDATE public.ordens_servico SET status = 'concluida', data_conclusao = now() WHERE id = v_os_id;
  ELSIF v_completed > 0 THEN
    UPDATE public.ordens_servico SET status = 'em_andamento' WHERE id = v_os_id AND status = 'aberta';
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_os_completion
AFTER UPDATE ON public.avaliacoes
FOR EACH ROW
WHEN (NEW.concluida = true)
EXECUTE FUNCTION public.check_os_completion();

-- Updated_at triggers
CREATE TRIGGER set_updated_at_ordens_servico BEFORE UPDATE ON public.ordens_servico FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_avaliacoes BEFORE UPDATE ON public.avaliacoes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
