CREATE TABLE IF NOT EXISTS public.tarefas_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'google_drive',
  path_relativo text NOT NULL,
  provider_file_id text,
  nome_original text NOT NULL,
  mime_type text,
  tamanho_bytes bigint,
  checksum text,
  contexto_tipo text NOT NULL,
  contexto_ref_id uuid,
  assignment_id uuid REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.operational_templates(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadados jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT tarefas_anexos_provider_chk
    CHECK (provider IN ('google_drive','onedrive','s3','r2','supabase')),
  CONSTRAINT tarefas_anexos_contexto_chk
    CHECK (contexto_tipo IN (
      'instrucao_etapa','instrucao_pergunta','resposta_executor',
      'evidencia','plano_acao','devolucao','aprovacao'
    ))
);

CREATE INDEX IF NOT EXISTS idx_tarefas_anexos_contexto
  ON public.tarefas_anexos (contexto_tipo, contexto_ref_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tarefas_anexos_assignment
  ON public.tarefas_anexos (assignment_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tarefas_anexos_template
  ON public.tarefas_anexos (template_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tarefas_anexos_uploaded_by
  ON public.tarefas_anexos (uploaded_by) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_tarefas_anexos_updated_at
  BEFORE UPDATE ON public.tarefas_anexos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tarefas_anexos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tarefas_anexos_select"
ON public.tarefas_anexos
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND (
    public.is_admin(auth.uid())
    OR uploaded_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR (
      assignment_id IS NOT NULL
      AND assignment_id IN (
        SELECT a.id FROM public.operational_assignments a
        WHERE a.responsavel_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
           OR a.avaliador_id   IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
           OR a.avaliado_id    IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
           OR a.aprovador_id   IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
           OR a.created_by     IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      )
    )
    OR (template_id IS NOT NULL AND assignment_id IS NULL)
  )
);

CREATE POLICY "tarefas_anexos_insert_self"
ON public.tarefas_anexos
FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "tarefas_anexos_update"
ON public.tarefas_anexos
FOR UPDATE
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR uploaded_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "tarefas_anexos_delete_admin"
ON public.tarefas_anexos
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

COMMENT ON TABLE public.tarefas_anexos IS
  'Anexos modulares de tarefas. Storage-agnostic: provider+path_relativo+provider_file_id. Acesso obrigatório via tarefas_storage_service.';
COMMENT ON COLUMN public.tarefas_anexos.path_relativo IS
  'Caminho lógico oficial: tarefas/{MM-YYYY}/{DD}/{tipo}/{codigo}-{slug}/{contexto}/{arquivo}';
COMMENT ON COLUMN public.tarefas_anexos.provider_file_id IS
  'ID físico no provider (Drive fileId, S3 key real, etc). Nunca usado como fonte primária na app.';