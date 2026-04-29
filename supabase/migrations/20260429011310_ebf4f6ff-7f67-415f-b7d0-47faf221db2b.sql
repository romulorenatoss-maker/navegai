-- Fase 3 Propostas — Setup Engine (additivo, isolado)

-- 1) Templates: estrutura de blocos
ALTER TABLE public.propostas_templates
  ADD COLUMN IF NOT EXISTS estrutura_blocos JSONB;

COMMENT ON COLUMN public.propostas_templates.estrutura_blocos IS
  'Estrutura analisada pela IA: [{tipo:fixo|variavel|tabela, conteudo, campo, schema, locked}]';

-- 2) Produtos: tipo (produto|servico)
ALTER TABLE public.propostas_produtos
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'produto'
    CHECK (tipo IN ('produto','servico'));

CREATE INDEX IF NOT EXISTS idx_propostas_produtos_tipo
  ON public.propostas_produtos(tipo);

-- 3) Cache de respostas do modo Setup guiado
CREATE TABLE IF NOT EXISTS public.propostas_setup_respostas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.propostas_templates(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cliente_id UUID,
  nome_sessao TEXT,
  respostas JSONB NOT NULL DEFAULT '{}'::jsonb,
  finalizado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_propostas_setup_respostas_profile
  ON public.propostas_setup_respostas(profile_id);
CREATE INDEX IF NOT EXISTS idx_propostas_setup_respostas_template
  ON public.propostas_setup_respostas(template_id);

ALTER TABLE public.propostas_setup_respostas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "propostas_setup_select_own_or_admin"
  ON public.propostas_setup_respostas FOR SELECT
  USING (
    public.is_admin(auth.uid())
    OR profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "propostas_setup_insert_own"
  ON public.propostas_setup_respostas FOR INSERT
  WITH CHECK (
    profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND public.propostas_user_has_access(auth.uid())
  );

CREATE POLICY "propostas_setup_update_own_or_admin"
  ON public.propostas_setup_respostas FOR UPDATE
  USING (
    public.is_admin(auth.uid())
    OR profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "propostas_setup_delete_own_or_admin"
  ON public.propostas_setup_respostas FOR DELETE
  USING (
    public.is_admin(auth.uid())
    OR profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE TRIGGER trg_propostas_setup_respostas_updated_at
  BEFORE UPDATE ON public.propostas_setup_respostas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();