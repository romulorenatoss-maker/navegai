ALTER TABLE public.tarefas_storage_config
  ADD COLUMN IF NOT EXISTS limite_upload_mb integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS tipos_permitidos text[] NOT NULL DEFAULT ARRAY['image/*','video/*','application/pdf']::text[],
  ADD COLUMN IF NOT EXISTS usar_proxy_visualizacao boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bloquear_link_direto boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS permitir_download boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS permitir_preview boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS status_conexao text,
  ADD COLUMN IF NOT EXISTS observacoes text,
  ADD COLUMN IF NOT EXISTS root_folder_link text,
  ADD COLUMN IF NOT EXISTS ultima_validacao_em timestamptz;