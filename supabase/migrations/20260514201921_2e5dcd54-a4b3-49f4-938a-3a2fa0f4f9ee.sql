ALTER TABLE public.operational_templates
ADD COLUMN IF NOT EXISTS ada_config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;