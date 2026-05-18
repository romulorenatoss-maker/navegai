ALTER TABLE public.operational_field_reviews
  ADD COLUMN IF NOT EXISTS anexo_orientacao_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS anexo_orientacao_anexo_id UUID REFERENCES public.tarefas_anexos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS anexo_orientacao_mime_type TEXT DEFAULT NULL;