-- SLA pause/resume support for EM_PLANO_ACAO
-- Additive only; no triggers; no changes to existing columns.

ALTER TABLE public.operational_assignments
  ADD COLUMN IF NOT EXISTS prazo_pausado_ms bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pausa_iniciada_em timestamptz NULL;

COMMENT ON COLUMN public.operational_assignments.prazo_pausado_ms IS
  'Total acumulado de tempo (ms) em que o SLA esteve pausado por plano de ação. Não sobrescreve data_prevista/horario_limite.';
COMMENT ON COLUMN public.operational_assignments.pausa_iniciada_em IS
  'Timestamp de início da pausa atual (NULL = não pausado).';

-- Histórico auditável de pausas (1:N por assignment)
CREATE TABLE IF NOT EXISTS public.operational_sla_pausas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  motivo text NULL,
  status_origem text NULL,
  status_destino text NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NULL,
  duration_ms bigint NULL,
  iniciada_por uuid NULL,
  encerrada_por uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_op_sla_pausas_assignment ON public.operational_sla_pausas(assignment_id);
CREATE INDEX IF NOT EXISTS idx_op_sla_pausas_open
  ON public.operational_sla_pausas(assignment_id)
  WHERE ended_at IS NULL;

ALTER TABLE public.operational_sla_pausas ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer autenticado que enxergue o assignment (espelha RLS de operational_assignments via EXISTS)
CREATE POLICY "sla_pausas_select_authenticated"
  ON public.operational_sla_pausas FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.operational_assignments a
      WHERE a.id = operational_sla_pausas.assignment_id
    )
  );

-- Escrita: qualquer autenticado (transições já são validadas em código/RBAC)
CREATE POLICY "sla_pausas_insert_authenticated"
  ON public.operational_sla_pausas FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.operational_assignments a
      WHERE a.id = operational_sla_pausas.assignment_id
    )
  );

CREATE POLICY "sla_pausas_update_authenticated"
  ON public.operational_sla_pausas FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.operational_assignments a
      WHERE a.id = operational_sla_pausas.assignment_id
    )
  );

CREATE POLICY "sla_pausas_admin_delete"
  ON public.operational_sla_pausas FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));