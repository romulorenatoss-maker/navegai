-- =============================================================
-- Fix 1: FK template_id ON DELETE CASCADE → SET NULL
-- Deletar uma rotina NÃO deve apagar tarefas concluídas.
-- =============================================================
ALTER TABLE public.operational_assignments
  DROP CONSTRAINT IF EXISTS operational_assignments_template_id_fkey;

ALTER TABLE public.operational_assignments
  ADD CONSTRAINT operational_assignments_template_id_fkey
  FOREIGN KEY (template_id)
  REFERENCES public.operational_templates(id)
  ON DELETE SET NULL;

-- =============================================================
-- Fix 2: Adicionar coluna origem em operational_assignments
-- Identifica se a tarefa veio de uma rotina ou foi avulsa (ad_hoc).
-- =============================================================
ALTER TABLE public.operational_assignments
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'rotina'
  CHECK (origem IN ('rotina', 'ad_hoc'));
