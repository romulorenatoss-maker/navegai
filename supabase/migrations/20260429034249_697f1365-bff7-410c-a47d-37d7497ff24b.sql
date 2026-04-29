
ALTER TABLE public.propostas_propostas
  ADD COLUMN IF NOT EXISTS snapshot_render jsonb,
  ADD COLUMN IF NOT EXISTS template_versao text,
  ADD COLUMN IF NOT EXISTS data_render timestamptz;

ALTER TABLE public.propostas_templates
  ADD COLUMN IF NOT EXISTS versao text NOT NULL DEFAULT '1';

CREATE INDEX IF NOT EXISTS idx_propostas_propostas_data_render
  ON public.propostas_propostas (data_render DESC)
  WHERE data_render IS NOT NULL;
