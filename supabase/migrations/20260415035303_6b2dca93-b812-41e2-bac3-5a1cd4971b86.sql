
-- 1) Tighten INSERT policies that allow any authenticated user to insert without ownership check

-- operational_contingencies: restrict INSERT to owner of assignment or admin
DROP POLICY IF EXISTS "System can insert contingencies" ON public.operational_contingencies;
CREATE POLICY "Authenticated can insert contingencies" ON public.operational_contingencies
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin(auth.uid())
    OR responsavel_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR assignment_id IN (
      SELECT id FROM operational_assignments WHERE responsavel_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
  );

-- operational_contingency_resolution_logs: restrict to own logs or admin
DROP POLICY IF EXISTS "Users can insert resolution logs" ON public.operational_contingency_resolution_logs;
CREATE POLICY "Users can insert own resolution logs" ON public.operational_contingency_resolution_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    executado_por IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR is_admin(auth.uid())
  );

-- operational_execution_check_answers: restrict UPDATE to owner or admin
DROP POLICY IF EXISTS "Users can update check answers" ON public.operational_execution_check_answers;
CREATE POLICY "Users can update own check answers" ON public.operational_execution_check_answers
  FOR UPDATE TO authenticated
  USING (
    assignment_id IN (
      SELECT id FROM operational_assignments WHERE responsavel_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
    OR is_admin(auth.uid())
  );

-- operational_execution_step_logs: restrict INSERT and UPDATE  
DROP POLICY IF EXISTS "Users can insert own step logs" ON public.operational_execution_step_logs;
CREATE POLICY "Users can insert own step logs" ON public.operational_execution_step_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    assignment_id IN (
      SELECT id FROM operational_assignments WHERE responsavel_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
    OR is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own step logs" ON public.operational_execution_step_logs;
CREATE POLICY "Users can update own step logs" ON public.operational_execution_step_logs
  FOR UPDATE TO authenticated
  USING (
    assignment_id IN (
      SELECT id FROM operational_assignments WHERE responsavel_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
    OR is_admin(auth.uid())
  );

-- operational_rankings: restrict UPDATE to admin only
DROP POLICY IF EXISTS "System can update rankings" ON public.operational_rankings;
CREATE POLICY "Admin can update rankings" ON public.operational_rankings
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()));

-- operational_rankings: restrict INSERT to admin only  
DROP POLICY IF EXISTS "System can insert rankings" ON public.operational_rankings;
CREATE POLICY "Admin can insert rankings" ON public.operational_rankings
  FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()));

-- operational_audit_trail: restrict INSERT to own actions or admin
DROP POLICY IF EXISTS "Authenticated can insert audit trail" ON public.operational_audit_trail;
CREATE POLICY "Users can insert own audit trail" ON public.operational_audit_trail
  FOR INSERT TO authenticated
  WITH CHECK (
    executado_por IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR is_admin(auth.uid())
  );

-- 2) Add missing performance indexes
CREATE INDEX IF NOT EXISTS idx_op_score_logs_profile_tipo ON public.operational_score_logs (profile_id, tipo_score, created_at);
CREATE INDEX IF NOT EXISTS idx_op_score_logs_assignment ON public.operational_score_logs (assignment_id);
CREATE INDEX IF NOT EXISTS idx_op_contingencies_responsavel ON public.operational_contingencies (responsavel_id, status);
CREATE INDEX IF NOT EXISTS idx_op_field_reviews_conforme ON public.operational_field_reviews (conforme) WHERE conforme = false;
