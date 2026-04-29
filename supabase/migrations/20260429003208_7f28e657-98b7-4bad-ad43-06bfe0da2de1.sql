-- ============================================
-- MÓDULO PROPOSTAS — FASE 1 (FUNDAÇÃO)
-- Prefixo obrigatório: propostas_
-- Isolado: não altera nenhuma tabela existente
-- ============================================

-- ENUM tipo_calculo
DO $$ BEGIN
  CREATE TYPE public.propostas_tipo_calculo AS ENUM ('quantidade', 'gb_total', 'gb_por_unidade');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ENUM status proposta
DO $$ BEGIN
  CREATE TYPE public.propostas_status AS ENUM ('rascunho', 'aprovado', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ENUM tipo template
DO $$ BEGIN
  CREATE TYPE public.propostas_tipo_template AS ENUM ('proposta', 'contrato');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ENUM tipo histórico
DO $$ BEGIN
  CREATE TYPE public.propostas_tipo_historico AS ENUM ('gerado', 'editado', 'aprovado', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- 1. propostas_produtos
-- ============================================
CREATE TABLE IF NOT EXISTS public.propostas_produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao_padrao text,
  valor_minimo numeric(14,2) NOT NULL DEFAULT 0,
  tipo_calculo public.propostas_tipo_calculo NOT NULL DEFAULT 'quantidade',
  unidade text NOT NULL DEFAULT 'un',
  regra_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.propostas_produtos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_propostas_produtos_ativo ON public.propostas_produtos(ativo);

-- ============================================
-- 2. propostas_templates
-- ============================================
CREATE TABLE IF NOT EXISTS public.propostas_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo public.propostas_tipo_template NOT NULL DEFAULT 'proposta',
  conteudo_html text NOT NULL DEFAULT '',
  campos_detectados jsonb NOT NULL DEFAULT '[]'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.propostas_templates ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. propostas_propostas
-- ============================================
CREATE TABLE IF NOT EXISTS public.propostas_propostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  usuario_id uuid NOT NULL,
  template_id uuid REFERENCES public.propostas_templates(id) ON DELETE SET NULL,
  conteudo_original text,
  conteudo_editado text,
  status public.propostas_status NOT NULL DEFAULT 'rascunho',
  valor_total numeric(14,2) NOT NULL DEFAULT 0,
  validade date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.propostas_propostas ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_propostas_propostas_cliente ON public.propostas_propostas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_propostas_propostas_usuario ON public.propostas_propostas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_propostas_propostas_status ON public.propostas_propostas(status);

-- ============================================
-- 4. propostas_itens
-- ============================================
CREATE TABLE IF NOT EXISTS public.propostas_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id uuid NOT NULL REFERENCES public.propostas_propostas(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.propostas_produtos(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  quantidade numeric(14,3) NOT NULL DEFAULT 1,
  unidade text NOT NULL DEFAULT 'un',
  valor_unitario numeric(14,2) NOT NULL DEFAULT 0,
  valor_total numeric(14,2) NOT NULL DEFAULT 0,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.propostas_itens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_propostas_itens_proposta ON public.propostas_itens(proposta_id);

-- ============================================
-- 5. propostas_historico
-- ============================================
CREATE TABLE IF NOT EXISTS public.propostas_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id uuid NOT NULL REFERENCES public.propostas_propostas(id) ON DELETE CASCADE,
  conteudo text,
  tipo public.propostas_tipo_historico NOT NULL,
  usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.propostas_historico ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_propostas_historico_proposta ON public.propostas_historico(proposta_id);

-- ============================================
-- 6. propostas_ajustes_ia (memória de aprendizado)
-- ============================================
CREATE TABLE IF NOT EXISTS public.propostas_ajustes_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trecho_original text NOT NULL,
  trecho_editado text NOT NULL,
  contexto text,
  frequencia int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.propostas_ajustes_ia ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TRIGGERS de updated_at
-- ============================================
CREATE TRIGGER trg_propostas_produtos_updated_at
  BEFORE UPDATE ON public.propostas_produtos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_propostas_templates_updated_at
  BEFORE UPDATE ON public.propostas_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_propostas_propostas_updated_at
  BEFORE UPDATE ON public.propostas_propostas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_propostas_ajustes_ia_updated_at
  BEFORE UPDATE ON public.propostas_ajustes_ia
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- HELPER: usuário tem permissão de tela /propostas?
-- ============================================
CREATE OR REPLACE FUNCTION public.propostas_user_has_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin(_user_id) OR EXISTS (
    SELECT 1
    FROM public.permissoes_tela pt
    JOIN public.profiles p ON p.id = pt.profile_id
    WHERE p.user_id = _user_id
      AND pt.tela_path LIKE '/propostas%'
  );
$$;

-- ============================================
-- RLS POLICIES — propostas_produtos
-- ============================================
CREATE POLICY "propostas_produtos_select"
  ON public.propostas_produtos FOR SELECT TO authenticated
  USING (public.propostas_user_has_access(auth.uid()));

CREATE POLICY "propostas_produtos_admin_all"
  ON public.propostas_produtos FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============================================
-- RLS POLICIES — propostas_templates
-- ============================================
CREATE POLICY "propostas_templates_select"
  ON public.propostas_templates FOR SELECT TO authenticated
  USING (public.propostas_user_has_access(auth.uid()));

CREATE POLICY "propostas_templates_admin_all"
  ON public.propostas_templates FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============================================
-- RLS POLICIES — propostas_propostas
-- ============================================
CREATE POLICY "propostas_propostas_select_own_or_admin"
  ON public.propostas_propostas FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR usuario_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "propostas_propostas_insert_self"
  ON public.propostas_propostas FOR INSERT TO authenticated
  WITH CHECK (
    public.propostas_user_has_access(auth.uid())
    AND usuario_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "propostas_propostas_update_own_or_admin"
  ON public.propostas_propostas FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR usuario_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "propostas_propostas_delete_admin"
  ON public.propostas_propostas FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============================================
-- RLS POLICIES — propostas_itens (segue a proposta)
-- ============================================
CREATE POLICY "propostas_itens_select"
  ON public.propostas_itens FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.propostas_propostas pp
    WHERE pp.id = proposta_id
      AND (
        public.is_admin(auth.uid())
        OR pp.usuario_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      )
  ));

CREATE POLICY "propostas_itens_modify"
  ON public.propostas_itens FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.propostas_propostas pp
    WHERE pp.id = proposta_id
      AND (
        public.is_admin(auth.uid())
        OR pp.usuario_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.propostas_propostas pp
    WHERE pp.id = proposta_id
      AND (
        public.is_admin(auth.uid())
        OR pp.usuario_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      )
  ));

-- ============================================
-- RLS POLICIES — propostas_historico
-- ============================================
CREATE POLICY "propostas_historico_select"
  ON public.propostas_historico FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.propostas_propostas pp
    WHERE pp.id = proposta_id
      AND (
        public.is_admin(auth.uid())
        OR pp.usuario_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      )
  ));

CREATE POLICY "propostas_historico_insert"
  ON public.propostas_historico FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.propostas_propostas pp
    WHERE pp.id = proposta_id
      AND (
        public.is_admin(auth.uid())
        OR pp.usuario_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      )
  ));

-- ============================================
-- RLS POLICIES — propostas_ajustes_ia (apenas admin direto; usuários via função)
-- ============================================
CREATE POLICY "propostas_ajustes_ia_admin_all"
  ON public.propostas_ajustes_ia FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));