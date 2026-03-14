
-- 1. Create tipos_avaliacao table
CREATE TABLE public.tipos_avaliacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cargo_responsavel text,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tipos_avaliacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage tipos_avaliacao" ON public.tipos_avaliacao FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view tipos_avaliacao" ON public.tipos_avaliacao FOR SELECT TO authenticated USING (true);

-- 2. Junction: service type <-> evaluation types
CREATE TABLE public.tipo_servico_tipos_avaliacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_servico_id uuid NOT NULL REFERENCES public.tipos_servico(id) ON DELETE CASCADE,
  tipo_avaliacao_id uuid NOT NULL REFERENCES public.tipos_avaliacao(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tipo_servico_id, tipo_avaliacao_id)
);
ALTER TABLE public.tipo_servico_tipos_avaliacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage tsta" ON public.tipo_servico_tipos_avaliacao FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Auth can view tsta" ON public.tipo_servico_tipos_avaliacao FOR SELECT TO authenticated USING (true);

-- 3. Add atendente_id and tecnico_id to ordens_servico
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS atendente_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS tecnico_id uuid REFERENCES public.profiles(id);

-- 4. Add tipo_avaliacao_id to avaliacoes
ALTER TABLE public.avaliacoes ADD COLUMN IF NOT EXISTS tipo_avaliacao_id uuid REFERENCES public.tipos_avaliacao(id);

-- 5. Add tipo_avaliacao_id and target_employee_type to perguntas_avaliacao
ALTER TABLE public.perguntas_avaliacao ADD COLUMN IF NOT EXISTS tipo_avaliacao_id uuid REFERENCES public.tipos_avaliacao(id);
ALTER TABLE public.perguntas_avaliacao ADD COLUMN IF NOT EXISTS target_employee_type text NOT NULL DEFAULT 'geral';

-- 6. Clean existing evaluation data (starting fresh per user request)
DELETE FROM public.respostas_avaliacao;
DELETE FROM public.avaliacoes;
DELETE FROM public.ordens_servico;

-- 7. Insert default evaluation types
INSERT INTO public.tipos_avaliacao (nome, cargo_responsavel, descricao) VALUES 
  ('Atendimento', 'atendente', 'Avaliação do atendimento ao cliente'),
  ('Técnico', 'tecnico', 'Avaliação técnica do serviço'),
  ('Qualidade', 'qualidade', 'Avaliação geral de qualidade');

-- 8. Create triggers for automatic OS completion
DROP TRIGGER IF EXISTS on_avaliacao_update ON public.avaliacoes;
DROP TRIGGER IF EXISTS on_avaliacao_insert ON public.avaliacoes;

CREATE TRIGGER on_avaliacao_update
AFTER UPDATE ON public.avaliacoes
FOR EACH ROW
EXECUTE FUNCTION public.check_os_completion();

CREATE TRIGGER on_avaliacao_insert
AFTER INSERT ON public.avaliacoes
FOR EACH ROW
EXECUTE FUNCTION public.check_os_completion();
