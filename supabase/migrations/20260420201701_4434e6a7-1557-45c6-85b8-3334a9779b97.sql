-- 1. Adicionar coluna created_by (nullable, sem backfill — tarefas antigas ficam sem criador)
ALTER TABLE public.operational_assignments
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Índice para consultas frequentes nas abas de "Designadas" e "Validação"
CREATE INDEX IF NOT EXISTS idx_operational_assignments_created_by
  ON public.operational_assignments(created_by)
  WHERE created_by IS NOT NULL;

-- 3. RLS: criador pode ver suas tarefas designadas
CREATE POLICY "Creator can view own designated assignments"
  ON public.operational_assignments
  FOR SELECT
  TO authenticated
  USING (
    created_by IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- 4. RLS: criador pode atualizar (validar/devolver) suas tarefas designadas
CREATE POLICY "Creator can update own designated assignments"
  ON public.operational_assignments
  FOR UPDATE
  TO authenticated
  USING (
    created_by IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()
    )
  );