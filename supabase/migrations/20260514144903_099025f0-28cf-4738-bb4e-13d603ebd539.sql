-- ============================================================
-- 1) Colunas Auditor em operational_template_fields
-- ============================================================
ALTER TABLE public.operational_template_fields
  ADD COLUMN IF NOT EXISTS auditor_verificar boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auditor_pergunta text DEFAULT '',
  ADD COLUMN IF NOT EXISTS auditor_tipo_resposta text DEFAULT 'conforme',
  ADD COLUMN IF NOT EXISTS auditor_peso numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS auditor_obriga_observacao_nao boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS auditor_exige_evidencia boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auditor_exige_evidencia_nao boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auditor_tipos_evidencia jsonb DEFAULT '["foto"]'::jsonb,
  ADD COLUMN IF NOT EXISTS aprovador_herdar_resposta boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auditor_herdar_resposta boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2) Tabela de respostas do Auditor
-- ============================================================
CREATE TABLE IF NOT EXISTS public.operational_audit_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.operational_template_fields(id) ON DELETE CASCADE,
  resposta text,
  observacao text,
  evidencia_url text,
  motivo_alteracao text,
  herdada boolean DEFAULT false,
  auditor_id uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_audit_answers_assignment ON public.operational_audit_answers(assignment_id);
CREATE INDEX IF NOT EXISTS idx_audit_answers_field ON public.operational_audit_answers(field_id);

ALTER TABLE public.operational_audit_answers ENABLE ROW LEVEL SECURITY;

-- Auditor da tarefa pode CRUD próprias respostas
CREATE POLICY "Auditor manages own audit answers"
ON public.operational_audit_answers
FOR ALL
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.operational_assignments a
    JOIN public.profiles p ON p.user_id = auth.uid()
    WHERE a.id = operational_audit_answers.assignment_id
      AND a.auditor_id = p.id
  )
)
WITH CHECK (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.operational_assignments a
    JOIN public.profiles p ON p.user_id = auth.uid()
    WHERE a.id = operational_audit_answers.assignment_id
      AND a.auditor_id = p.id
  )
);

-- Demais papéis (executor/aprovador/criador) podem ler para ver histórico
CREATE POLICY "Stakeholders can view audit answers"
ON public.operational_audit_answers
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.operational_assignments a
    JOIN public.profiles p ON p.user_id = auth.uid()
    WHERE a.id = operational_audit_answers.assignment_id
      AND (
        a.responsavel_id = p.id
        OR a.aprovador_id = p.id
        OR a.created_by = p.id
        OR a.avaliado_id = p.id
      )
  )
);

-- ============================================================
-- 3) Flags em operational_approval_answers
-- ============================================================
ALTER TABLE public.operational_approval_answers
  ADD COLUMN IF NOT EXISTS motivo_alteracao text,
  ADD COLUMN IF NOT EXISTS herdada boolean DEFAULT false;

-- ============================================================
-- 4) Trigger updated_at no audit_answers
-- ============================================================
CREATE TRIGGER trg_audit_answers_updated_at
  BEFORE UPDATE ON public.operational_audit_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();