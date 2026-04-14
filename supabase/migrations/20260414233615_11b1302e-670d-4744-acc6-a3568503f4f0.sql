
-- =============================================
-- TASK TEMPLATES
-- =============================================
CREATE TABLE public.task_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  setor_id UUID REFERENCES public.setores(id),
  tipo_recorrencia TEXT NOT NULL DEFAULT 'unica' CHECK (tipo_recorrencia IN ('unica','diaria','semanal','mensal')),
  dias_execucao INTEGER[] DEFAULT '{}',
  prazo_horas INTEGER NOT NULL DEFAULT 24,
  prioridade TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa','media','alta','critica')),
  dificuldade TEXT NOT NULL DEFAULT 'media' CHECK (dificuldade IN ('facil','media','dificil')),
  pontuacao_base INTEGER NOT NULL DEFAULT 80,
  bonus_antecipacao INTEGER NOT NULL DEFAULT 10,
  penalidade_atraso INTEGER NOT NULL DEFAULT 20,
  penalidade_nao_execucao INTEGER NOT NULL DEFAULT 40,
  meta_execucao_minutos INTEGER DEFAULT 60,
  obrigar_observacao BOOLEAN NOT NULL DEFAULT false,
  exigir_evidencia_foto BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage task_templates" ON public.task_templates FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Avaliadores can manage task_templates" ON public.task_templates FOR ALL USING (has_role(auth.uid(), 'avaliador') OR is_admin(auth.uid()));
CREATE POLICY "Authenticated can view task_templates" ON public.task_templates FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_task_templates_updated_at BEFORE UPDATE ON public.task_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- TASK ASSIGNMENTS
-- =============================================
CREATE TABLE public.task_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.task_templates(id) ON DELETE CASCADE,
  responsavel_id UUID REFERENCES public.profiles(id),
  data_prevista DATE NOT NULL DEFAULT CURRENT_DATE,
  prazo_limite TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluida','atrasada','bloqueada','nao_executada')),
  inicio_em TIMESTAMPTZ,
  fim_em TIMESTAMPTZ,
  tempo_gasto_minutos INTEGER,
  pontuacao_obtida INTEGER DEFAULT 0,
  observacao TEXT,
  evidencia_url TEXT,
  motivo_bloqueio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage task_assignments" ON public.task_assignments FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Avaliadores can view task_assignments" ON public.task_assignments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'avaliador') OR is_admin(auth.uid()));
CREATE POLICY "User can view own task_assignments" ON public.task_assignments FOR SELECT TO authenticated USING (responsavel_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "User can update own task_assignments" ON public.task_assignments FOR UPDATE TO authenticated USING (responsavel_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Avaliadores can insert task_assignments" ON public.task_assignments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'avaliador') OR is_admin(auth.uid()));
CREATE POLICY "Avaliadores can update task_assignments" ON public.task_assignments FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'avaliador') OR is_admin(auth.uid()));

CREATE TRIGGER update_task_assignments_updated_at BEFORE UPDATE ON public.task_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- TASK EXECUTION LOGS
-- =============================================
CREATE TABLE public.task_execution_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.task_assignments(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  acao TEXT NOT NULL,
  detalhes JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_execution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage task_execution_logs" ON public.task_execution_logs FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Avaliadores can view task_execution_logs" ON public.task_execution_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'avaliador') OR is_admin(auth.uid()));
CREATE POLICY "User can view own task_execution_logs" ON public.task_execution_logs FOR SELECT TO authenticated USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "User can insert own task_execution_logs" ON public.task_execution_logs FOR INSERT TO authenticated WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- =============================================
-- TASK SCORE LOGS
-- =============================================
CREATE TABLE public.task_score_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.task_assignments(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('base','bonus_antecipacao','bonus_meta_tempo','penalidade_atraso','penalidade_nao_execucao')),
  valor INTEGER NOT NULL DEFAULT 0,
  descricao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_score_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage task_score_logs" ON public.task_score_logs FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Avaliadores can view task_score_logs" ON public.task_score_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'avaliador') OR is_admin(auth.uid()));
CREATE POLICY "User can view own task_score_logs" ON public.task_score_logs FOR SELECT TO authenticated USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "User can insert own task_score_logs" ON public.task_score_logs FOR INSERT TO authenticated WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- =============================================
-- TASK USER STREAKS
-- =============================================
CREATE TABLE public.task_user_streaks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) UNIQUE,
  streak_atual INTEGER NOT NULL DEFAULT 0,
  streak_maximo INTEGER NOT NULL DEFAULT 0,
  ultima_execucao_no_prazo DATE,
  pontuacao_total INTEGER NOT NULL DEFAULT 0,
  nivel TEXT NOT NULL DEFAULT 'bronze' CHECK (nivel IN ('bronze','prata','ouro','platina','diamante')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_user_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage task_user_streaks" ON public.task_user_streaks FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view task_user_streaks" ON public.task_user_streaks FOR SELECT TO authenticated USING (true);
CREATE POLICY "User can update own streak" ON public.task_user_streaks FOR UPDATE TO authenticated USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "User can insert own streak" ON public.task_user_streaks FOR INSERT TO authenticated WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));
