
-- =====================================================
-- MÓDULO OPERACIONAL COMPLETO
-- =====================================================

-- 1. Templates de Rotinas Operacionais
CREATE TABLE public.operational_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo_execucao TEXT NOT NULL DEFAULT 'simples' CHECK (tipo_execucao IN ('simples', 'etapas', 'checklist_inspecao')),
  setor_id UUID REFERENCES public.setores(id),
  responsavel_id UUID REFERENCES public.profiles(id),
  recorrencia_tipo TEXT NOT NULL DEFAULT 'unica' CHECK (recorrencia_tipo IN ('unica', 'diaria', 'semanal', 'mensal', 'personalizada')),
  dias_da_semana INTEGER[] DEFAULT '{}',
  intervalo_dias INTEGER DEFAULT 1,
  pular_semanas INTEGER DEFAULT 0,
  dia_fixo_mes INTEGER,
  data_inicio DATE DEFAULT CURRENT_DATE,
  data_fim DATE,
  horario_inicio_previsto TIME,
  horario_limite_execucao TIME,
  tolerancia_minutos INTEGER DEFAULT 0,
  exigir_foto BOOLEAN DEFAULT false,
  exigir_video BOOLEAN DEFAULT false,
  exigir_observacao BOOLEAN DEFAULT false,
  gerar_contingencia_automatica BOOLEAN DEFAULT false,
  prazo_sla_correcao_horas INTEGER DEFAULT 24,
  responsavel_contingencia_id UUID REFERENCES public.profiles(id),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage operational_templates" ON public.operational_templates FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view operational_templates" ON public.operational_templates FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_operational_templates_updated_at BEFORE UPDATE ON public.operational_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Etapas de Templates
CREATE TABLE public.operational_template_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.operational_templates(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  horario_previsto TIME,
  prazo_limite_minutos INTEGER DEFAULT 60,
  exige_foto BOOLEAN DEFAULT false,
  exige_video BOOLEAN DEFAULT false,
  exige_observacao BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_template_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage operational_template_steps" ON public.operational_template_steps FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view operational_template_steps" ON public.operational_template_steps FOR SELECT TO authenticated USING (true);

-- 3. Itens de Checklist de Inspeção
CREATE TABLE public.operational_template_check_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.operational_templates(id) ON DELETE CASCADE,
  pergunta TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  tipo_resposta TEXT NOT NULL DEFAULT 'conforme_nao_conforme' CHECK (tipo_resposta IN ('conforme_nao_conforme', 'sim_nao', 'texto', 'numero')),
  exige_foto BOOLEAN DEFAULT false,
  exige_observacao BOOLEAN DEFAULT false,
  gera_contingencia_se_reprovado BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_template_check_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage operational_template_check_items" ON public.operational_template_check_items FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view operational_template_check_items" ON public.operational_template_check_items FOR SELECT TO authenticated USING (true);

-- 4. Atribuições (assignments)
CREATE TABLE public.operational_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.operational_templates(id) ON DELETE CASCADE,
  responsavel_id UUID REFERENCES public.profiles(id),
  data_prevista DATE NOT NULL DEFAULT CURRENT_DATE,
  horario_inicio_previsto TIME,
  horario_limite TIME,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'atrasada', 'nao_executada', 'bloqueada')),
  inicio_em TIMESTAMPTZ,
  fim_em TIMESTAMPTZ,
  tempo_gasto_minutos INTEGER,
  observacao TEXT,
  evidencia_url TEXT,
  pontuacao_obtida NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage operational_assignments" ON public.operational_assignments FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view operational_assignments" ON public.operational_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Responsavel can update own assignments" ON public.operational_assignments FOR UPDATE TO authenticated USING (
  responsavel_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Admins can insert operational_assignments" ON public.operational_assignments FOR INSERT TO authenticated WITH CHECK (
  is_admin(auth.uid()) OR has_role(auth.uid(), 'avaliador'::app_role)
);

CREATE TRIGGER update_operational_assignments_updated_at BEFORE UPDATE ON public.operational_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Logs de Execução
CREATE TABLE public.operational_execution_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  acao TEXT NOT NULL,
  detalhes JSONB,
  executado_por UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_execution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage operational_execution_logs" ON public.operational_execution_logs FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view operational_execution_logs" ON public.operational_execution_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own execution logs" ON public.operational_execution_logs FOR INSERT TO authenticated WITH CHECK (
  executado_por IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR is_admin(auth.uid())
);

-- 6. Logs de Execução por Etapa
CREATE TABLE public.operational_execution_step_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.operational_template_steps(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'atrasada')),
  inicio_em TIMESTAMPTZ,
  fim_em TIMESTAMPTZ,
  observacao TEXT,
  evidencia_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_execution_step_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage operational_execution_step_logs" ON public.operational_execution_step_logs FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view operational_execution_step_logs" ON public.operational_execution_step_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own step logs" ON public.operational_execution_step_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update own step logs" ON public.operational_execution_step_logs FOR UPDATE TO authenticated USING (true);

-- 7. Respostas de Checklist de Inspeção
CREATE TABLE public.operational_execution_check_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  check_item_id UUID NOT NULL REFERENCES public.operational_template_check_items(id) ON DELETE CASCADE,
  resposta TEXT,
  conforme BOOLEAN,
  observacao TEXT,
  evidencia_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_execution_check_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage operational_execution_check_answers" ON public.operational_execution_check_answers FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view operational_execution_check_answers" ON public.operational_execution_check_answers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert check answers" ON public.operational_execution_check_answers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update check answers" ON public.operational_execution_check_answers FOR UPDATE TO authenticated USING (true);

-- 8. Contingências
CREATE TABLE public.operational_contingencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  check_answer_id UUID REFERENCES public.operational_execution_check_answers(id),
  step_log_id UUID REFERENCES public.operational_execution_step_logs(id),
  descricao TEXT NOT NULL,
  responsavel_id UUID REFERENCES public.profiles(id),
  prazo_sla TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'em_andamento', 'resolvida', 'vencida', 'validada')),
  resolvida_em TIMESTAMPTZ,
  validada_por UUID REFERENCES public.profiles(id),
  validada_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_contingencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage operational_contingencies" ON public.operational_contingencies FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view operational_contingencies" ON public.operational_contingencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Responsavel can update own contingencies" ON public.operational_contingencies FOR UPDATE TO authenticated USING (
  responsavel_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR is_admin(auth.uid())
);
CREATE POLICY "System can insert contingencies" ON public.operational_contingencies FOR INSERT TO authenticated WITH CHECK (true);

CREATE TRIGGER update_operational_contingencies_updated_at BEFORE UPDATE ON public.operational_contingencies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Logs de Resolução de Contingência
CREATE TABLE public.operational_contingency_resolution_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contingency_id UUID NOT NULL REFERENCES public.operational_contingencies(id) ON DELETE CASCADE,
  acao TEXT NOT NULL,
  observacao TEXT,
  evidencia_url TEXT,
  executado_por UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_contingency_resolution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage operational_contingency_resolution_logs" ON public.operational_contingency_resolution_logs FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view operational_contingency_resolution_logs" ON public.operational_contingency_resolution_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert resolution logs" ON public.operational_contingency_resolution_logs FOR INSERT TO authenticated WITH CHECK (true);

-- 10. Score Logs
CREATE TABLE public.operational_score_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  pontualidade NUMERIC(5,2) DEFAULT 0,
  conformidade NUMERIC(5,2) DEFAULT 0,
  qualidade_evidencia NUMERIC(5,2) DEFAULT 0,
  sla_correcoes NUMERIC(5,2) DEFAULT 0,
  score_final NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_score_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage operational_score_logs" ON public.operational_score_logs FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view operational_score_logs" ON public.operational_score_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert score logs" ON public.operational_score_logs FOR INSERT TO authenticated WITH CHECK (true);

-- 11. Rankings
CREATE TABLE public.operational_rankings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  periodo_tipo TEXT NOT NULL CHECK (periodo_tipo IN ('diario', 'semanal', 'mensal')),
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,
  score_medio NUMERIC(5,2) DEFAULT 0,
  total_rotinas INTEGER DEFAULT 0,
  rotinas_no_prazo INTEGER DEFAULT 0,
  rotinas_atrasadas INTEGER DEFAULT 0,
  contingencias_abertas INTEGER DEFAULT 0,
  contingencias_resolvidas INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, periodo_tipo, periodo_inicio)
);

ALTER TABLE public.operational_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage operational_rankings" ON public.operational_rankings FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view operational_rankings" ON public.operational_rankings FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert rankings" ON public.operational_rankings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "System can update rankings" ON public.operational_rankings FOR UPDATE TO authenticated USING (true);
