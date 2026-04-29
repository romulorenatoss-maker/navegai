-- =====================================================================
-- Propostas v2 — estrutura para render baseado em template DOCX
-- Apenas schema. Sem mexer em dados existentes.
-- =====================================================================

-- 1) PRODUTOS — novos campos
ALTER TABLE public.propostas_produtos
  ADD COLUMN IF NOT EXISTS campo_template text,
  ADD COLUMN IF NOT EXISTS tipo_input text NOT NULL DEFAULT 'quantidade';

-- Validação de tipo_input via trigger (mantendo padrão do projeto, sem CHECK)
CREATE OR REPLACE FUNCTION public.propostas_produtos_validate_v2()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tipo_input IS NOT NULL
     AND NEW.tipo_input NOT IN ('quantidade','boolean','lista') THEN
    RAISE EXCEPTION 'tipo_input inválido: % (esperado quantidade|boolean|lista)', NEW.tipo_input;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propostas_produtos_validate_v2 ON public.propostas_produtos;
CREATE TRIGGER trg_propostas_produtos_validate_v2
BEFORE INSERT OR UPDATE ON public.propostas_produtos
FOR EACH ROW EXECUTE FUNCTION public.propostas_produtos_validate_v2();

-- 2) ITENS — categoria restrita às 4 categorias canônicas (apenas para novos registros)
CREATE OR REPLACE FUNCTION public.propostas_itens_validate_categoria()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Só valida quando categoria é informada; nulos legados continuam permitidos
  IF NEW.categoria IS NOT NULL
     AND NEW.categoria NOT IN ('infraestrutura','dados','seguranca','telefonia') THEN
    RAISE EXCEPTION 'categoria inválida em propostas_itens: % (esperado infraestrutura|dados|seguranca|telefonia)', NEW.categoria;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propostas_itens_validate_categoria ON public.propostas_itens;
CREATE TRIGGER trg_propostas_itens_validate_categoria
BEFORE INSERT OR UPDATE ON public.propostas_itens
FOR EACH ROW EXECUTE FUNCTION public.propostas_itens_validate_categoria();

-- 3) TEMPLATES — origem .docx
ALTER TABLE public.propostas_templates
  ADD COLUMN IF NOT EXISTS arquivo_docx_path text,
  ADD COLUMN IF NOT EXISTS tipo_template text NOT NULL DEFAULT 'html';

CREATE OR REPLACE FUNCTION public.propostas_templates_validate_v2()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tipo_template IS NOT NULL
     AND NEW.tipo_template NOT IN ('html','docx') THEN
    RAISE EXCEPTION 'tipo_template inválido: % (esperado html|docx)', NEW.tipo_template;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propostas_templates_validate_v2 ON public.propostas_templates;
CREATE TRIGGER trg_propostas_templates_validate_v2
BEFORE INSERT OR UPDATE ON public.propostas_templates
FOR EACH ROW EXECUTE FUNCTION public.propostas_templates_validate_v2();

-- 4) Índice em campo_token de perguntas_setup (lookup rápido no render)
CREATE INDEX IF NOT EXISTS idx_propostas_perguntas_setup_campo_token
  ON public.propostas_perguntas_setup (campo_token)
  WHERE campo_token IS NOT NULL;

-- Índice auxiliar em produtos.campo_template
CREATE INDEX IF NOT EXISTS idx_propostas_produtos_campo_template
  ON public.propostas_produtos (campo_template)
  WHERE campo_template IS NOT NULL;

-- 5) BUCKET de storage para arquivos .docx dos templates
INSERT INTO storage.buckets (id, name, public)
VALUES ('propostas-templates', 'propostas-templates', false)
ON CONFLICT (id) DO NOTHING;

-- RLS no bucket: somente usuários com acesso ao módulo Propostas (função pré-existente)
DROP POLICY IF EXISTS "Propostas templates select" ON storage.objects;
CREATE POLICY "Propostas templates select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'propostas-templates'
  AND public.propostas_user_has_access(auth.uid())
);

DROP POLICY IF EXISTS "Propostas templates insert" ON storage.objects;
CREATE POLICY "Propostas templates insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'propostas-templates'
  AND public.propostas_user_has_access(auth.uid())
);

DROP POLICY IF EXISTS "Propostas templates update" ON storage.objects;
CREATE POLICY "Propostas templates update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'propostas-templates'
  AND public.propostas_user_has_access(auth.uid())
);

DROP POLICY IF EXISTS "Propostas templates delete" ON storage.objects;
CREATE POLICY "Propostas templates delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'propostas-templates'
  AND public.propostas_user_has_access(auth.uid())
);

-- 6) Comentários para documentar intenção dos novos campos
COMMENT ON COLUMN public.propostas_produtos.campo_template IS 'Token do placeholder no template DOCX (ex.: "switch_24p"). Usado pelo render v2.';
COMMENT ON COLUMN public.propostas_produtos.tipo_input IS 'Tipo de entrada: quantidade | boolean | lista. Define como o item preenche o template.';
COMMENT ON COLUMN public.propostas_templates.arquivo_docx_path IS 'Caminho do arquivo .docx no bucket propostas-templates. Usado quando tipo_template=docx.';
COMMENT ON COLUMN public.propostas_templates.tipo_template IS 'html (legado, conteudo_html) | docx (novo, arquivo_docx_path).';