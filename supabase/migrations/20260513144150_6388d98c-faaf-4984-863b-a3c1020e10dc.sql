CREATE TABLE IF NOT EXISTS public.tarefas_storage_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'google_drive',
  root_folder_id text NOT NULL,
  root_folder_label text,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tarefas_storage_config_provider_chk
    CHECK (provider IN ('google_drive','onedrive','s3','r2','supabase'))
);

-- Garantia de singleton por provider
CREATE UNIQUE INDEX IF NOT EXISTS uq_tarefas_storage_config_provider
  ON public.tarefas_storage_config (provider);

CREATE TRIGGER trg_tarefas_storage_config_updated_at
  BEFORE UPDATE ON public.tarefas_storage_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tarefas_storage_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tarefas_storage_config_admin_select"
ON public.tarefas_storage_config FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "tarefas_storage_config_admin_insert"
ON public.tarefas_storage_config FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "tarefas_storage_config_admin_update"
ON public.tarefas_storage_config FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "tarefas_storage_config_admin_delete"
ON public.tarefas_storage_config FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

COMMENT ON TABLE public.tarefas_storage_config IS
  'Singleton por provider: ID da pasta-mãe no provider onde toda a árvore de anexos é criada.';