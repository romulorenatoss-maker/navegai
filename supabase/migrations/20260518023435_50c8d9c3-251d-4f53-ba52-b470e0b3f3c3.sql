ALTER TABLE public.operational_field_answers
  ADD COLUMN IF NOT EXISTS evidencia_anexo_id UUID REFERENCES public.tarefas_anexos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evidencia_mime_type TEXT DEFAULT NULL;