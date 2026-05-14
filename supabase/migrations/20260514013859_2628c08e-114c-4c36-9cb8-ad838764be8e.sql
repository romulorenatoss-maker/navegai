-- Fase A: colunas SLA por camada (aditivo, sem drops) + tabela de overrides do auditor

ALTER TABLE public.tarefas_pontuacao_config
  ADD COLUMN IF NOT EXISTS sla_executor    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sla_aprovador   jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sla_plano_acao  jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sla_validador   jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Defaults idempotentes para singleton existente
UPDATE public.tarefas_pontuacao_config
SET
  sla_executor = COALESCE(NULLIF(sla_executor, '{}'::jsonb), jsonb_build_object(
    'nota_max',100,'nota_min',0,'sla_horas',24,
    'penalidade_atraso',20,'penalidade_nao_resposta',50,'penalidade_nao_conformidade',30,
    'permite_ponderacao',true,'exige_justificativa_ponderacao',true,
    'gera_plano_acao_auto',true,'permite_reabertura',true)),
  sla_aprovador = COALESCE(NULLIF(sla_aprovador, '{}'::jsonb), jsonb_build_object(
    'nota_max',100,'nota_min',0,'sla_horas',24,
    'penalidade_atraso',20,'penalidade_nao_resposta',50,'penalidade_nao_conformidade',30,
    'permite_ponderacao',true,'exige_justificativa_ponderacao',true,
    'gera_plano_acao_auto',true,'permite_reabertura',true)),
  sla_plano_acao = COALESCE(NULLIF(sla_plano_acao, '{}'::jsonb), jsonb_build_object(
    'nota_max',100,'nota_min',0,'sla_horas',48,
    'penalidade_atraso',15,'penalidade_nao_resposta',40,'penalidade_nao_conformidade',25,
    'permite_ponderacao',true,'exige_justificativa_ponderacao',true,
    'gera_plano_acao_auto',false,'permite_reabertura',true)),
  sla_validador = COALESCE(NULLIF(sla_validador, '{}'::jsonb), jsonb_build_object(
    'nota_max',100,'nota_min',0,'sla_horas',72,
    'penalidade_atraso',10,'penalidade_nao_resposta',30,'penalidade_nao_conformidade',20,
    'permite_ponderacao',true,'exige_justificativa_ponderacao',true,
    'gera_plano_acao_auto',false,'permite_reabertura',true))
WHERE singleton = true;

-- Tabela de overrides do auditor (nova, aditiva)
CREATE TABLE IF NOT EXISTS public.operational_audit_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid NOT NULL REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  camada          text NOT NULL CHECK (camada IN ('executor','avaliado','aprovador','plano_acao','validador')),
  nota_automatica numeric,
  nota_final      numeric NOT NULL,
  motivo          text NOT NULL,
  acao            text NOT NULL CHECK (acao IN ('manter','alterar','penalidade_parcial','remover_penalidade','zerar','aplicar_plano')),
  profile_id      uuid REFERENCES public.profiles(id),
  detalhes_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_overrides_assignment ON public.operational_audit_overrides(assignment_id);
CREATE INDEX IF NOT EXISTS idx_audit_overrides_camada ON public.operational_audit_overrides(camada);

ALTER TABLE public.operational_audit_overrides ENABLE ROW LEVEL SECURITY;

-- Leitura: admin, ou quem participa da tarefa (responsavel/avaliador/aprovador/avaliado/validador)
CREATE POLICY "audit_overrides_select" ON public.operational_audit_overrides
  FOR SELECT TO authenticated USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.operational_assignments a
      JOIN public.profiles p ON p.user_id = auth.uid()
      WHERE a.id = operational_audit_overrides.assignment_id
        AND p.id IN (a.responsavel_id, a.avaliador_id, a.aprovador_id, a.avaliado_id, a.validador_contingencia_id)
    )
  );

-- Insert: admin, aprovador ou validador da tarefa
CREATE POLICY "audit_overrides_insert" ON public.operational_audit_overrides
  FOR INSERT TO authenticated WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.operational_assignments a
      JOIN public.profiles p ON p.user_id = auth.uid()
      WHERE a.id = operational_audit_overrides.assignment_id
        AND p.id IN (a.aprovador_id, a.validador_contingencia_id)
    )
  );

-- Update/Delete: somente admin (auditoria histórica)
CREATE POLICY "audit_overrides_admin_modify" ON public.operational_audit_overrides
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "audit_overrides_admin_delete" ON public.operational_audit_overrides
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));