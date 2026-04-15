
-- === TEMPLATE CHECK ITEMS: peso individual por item ===
ALTER TABLE public.operational_template_check_items
  ADD COLUMN IF NOT EXISTS peso numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS nota_maxima numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS penalidade_reprovacao numeric NOT NULL DEFAULT 100;

COMMENT ON COLUMN public.operational_template_check_items.peso IS 'Peso relativo deste item no cálculo de score do avaliado';
COMMENT ON COLUMN public.operational_template_check_items.nota_maxima IS 'Nota máxima possível para este item (default 100)';
COMMENT ON COLUMN public.operational_template_check_items.penalidade_reprovacao IS 'Percentual de perda se reprovado: 100=perda total, 50=perda parcial';

-- === TEMPLATE STEPS: peso individual por etapa ===
ALTER TABLE public.operational_template_steps
  ADD COLUMN IF NOT EXISTS peso numeric NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.operational_template_steps.peso IS 'Peso relativo desta etapa no cálculo de conformidade do executor';

-- === TEMPLATES: novos papéis aprovador e validador ===
ALTER TABLE public.operational_templates
  ADD COLUMN IF NOT EXISTS aprovador_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS aprovador_setor_id uuid REFERENCES public.setores(id),
  ADD COLUMN IF NOT EXISTS validador_contingencia_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS validador_contingencia_setor_id uuid REFERENCES public.setores(id);

-- === ASSIGNMENTS: copiar papéis e setores do template ===
ALTER TABLE public.operational_assignments
  ADD COLUMN IF NOT EXISTS aprovador_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS validador_contingencia_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS setor_executor_id uuid REFERENCES public.setores(id),
  ADD COLUMN IF NOT EXISTS setor_avaliador_id uuid REFERENCES public.setores(id),
  ADD COLUMN IF NOT EXISTS setor_avaliado_id uuid REFERENCES public.setores(id);

-- === SCORE LOGS: breakdown detalhado ===
ALTER TABLE public.operational_score_logs
  ADD COLUMN IF NOT EXISTS peso_item numeric,
  ADD COLUMN IF NOT EXISTS detalhe_calculo jsonb;

COMMENT ON COLUMN public.operational_score_logs.detalhe_calculo IS 'Breakdown completo: {itens: [{nome, peso, nota_maxima, conforme, penalidade, nota_obtida}], formula, resultado}';
