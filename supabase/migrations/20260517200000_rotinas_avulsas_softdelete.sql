-- =============================================================
-- Rotinas: campos para controle de criador, destino de aba,
-- soft delete, exceto fds e geração avulsa
-- =============================================================

-- Criador da rotina
ALTER TABLE public.operational_templates
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Destino da aba: 'padrao' (admin) ou 'minhas' (user/avulso)
ALTER TABLE public.operational_templates
  ADD COLUMN IF NOT EXISTS destino_aba TEXT NOT NULL DEFAULT 'padrao'
  CHECK (destino_aba IN ('padrao', 'minhas'));

-- Soft delete
ALTER TABLE public.operational_templates
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Exceto sábado e domingo
ALTER TABLE public.operational_templates
  ADD COLUMN IF NOT EXISTS exceto_fds BOOLEAN NOT NULL DEFAULT false;

-- =============================================================
-- RLS: atualizar políticas para respeitar soft delete e destino
-- =============================================================

-- Remove políticas antigas
DROP POLICY IF EXISTS "Admins can manage operational_templates" ON public.operational_templates;
DROP POLICY IF EXISTS "Authenticated can view operational_templates" ON public.operational_templates;

-- Admin vê tudo (incluindo excluídos para aba Excluídas)
CREATE POLICY "Admins can manage operational_templates"
  ON public.operational_templates FOR ALL
  USING (is_admin(auth.uid()));

-- User vê: rotinas padrão ativas OU as próprias (minhas) ativas
CREATE POLICY "Users can view templates"
  ON public.operational_templates FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL AND (
      (destino_aba = 'padrao' AND ativo = true)
      OR
      (created_by = auth.uid())
    )
  );

-- User pode inserir rotina com destino 'minhas' (criada por ele)
CREATE POLICY "Users can insert own templates"
  ON public.operational_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND destino_aba = 'minhas'
  );

-- User pode atualizar/deletar apenas as próprias
CREATE POLICY "Users can update own templates"
  ON public.operational_templates FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() AND NOT is_admin(auth.uid()));

CREATE POLICY "Users can delete own templates"
  ON public.operational_templates FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() AND NOT is_admin(auth.uid()));
