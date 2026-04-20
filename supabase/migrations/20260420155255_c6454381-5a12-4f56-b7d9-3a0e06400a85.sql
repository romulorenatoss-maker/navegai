-- 1) system_logs table
CREATE TABLE IF NOT EXISTS public.system_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level TEXT NOT NULL CHECK (level IN ('INFO','WARNING','ERROR')),
  message TEXT NOT NULL,
  context JSONB,
  user_id UUID,
  module TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON public.system_logs (level);
CREATE INDEX IF NOT EXISTS idx_system_logs_user_id ON public.system_logs (user_id);

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view system_logs" ON public.system_logs;
CREATE POLICY "Admins can view system_logs"
ON public.system_logs FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can insert system_logs" ON public.system_logs;
CREATE POLICY "Authenticated can insert system_logs"
ON public.system_logs FOR INSERT
TO authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- 2) Operational permission resources (idempotent) — schema uses (code, label, module, path)
INSERT INTO public.permission_resources (code, label, module, path)
SELECT v.code, v.label, v.module, v.path
FROM (VALUES
  ('executar_tarefa','Executar tarefa operacional','operacional','/operacional/execucao'),
  ('avaliar_tarefa','Avaliar tarefa operacional','operacional','/operacional/avaliacao'),
  ('aprovar_tarefa','Aprovar tarefa operacional','operacional','/operacional/aprovacao'),
  ('gerenciar_contingencia','Gerenciar contingências','operacional','/operacional/contingencias'),
  ('ver_gestao_operacional','Ver gestão operacional','operacional','/operacional/gestao'),
  ('cadastrar_template_operacional','Cadastrar templates operacionais','operacional','/operacional/cadastro')
) AS v(code, label, module, path)
WHERE NOT EXISTS (
  SELECT 1 FROM public.permission_resources pr WHERE pr.code = v.code
);