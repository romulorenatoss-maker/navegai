-- Adiciona colunas para rastrear o anexo vinculado à evidência
-- Permite buscar signed URL via tarefas_anexos ao invés de URL direta
ALTER TABLE public.operational_field_answers
  ADD COLUMN IF NOT EXISTS evidencia_anexo_id UUID REFERENCES public.tarefas_anexos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evidencia_mime_type TEXT DEFAULT NULL;
