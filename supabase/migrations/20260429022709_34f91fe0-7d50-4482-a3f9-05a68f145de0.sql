-- ============================================
-- 1. ALTERAR propostas_produtos
-- ============================================
ALTER TABLE public.propostas_produtos
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS cobranca_padrao text DEFAULT 'mensal',
  ADD COLUMN IF NOT EXISTS valor_medio numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descricao_padrao_extendida text,
  ADD COLUMN IF NOT EXISTS origem text DEFAULT 'manual';

-- Validações via trigger (não check constraints, conforme orientação)
CREATE OR REPLACE FUNCTION public.propostas_produtos_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.categoria IS NOT NULL AND NEW.categoria NOT IN ('infraestrutura','dados','seguranca','telefonia','outros') THEN
    RAISE EXCEPTION 'categoria inválida: %', NEW.categoria;
  END IF;
  IF NEW.cobranca_padrao IS NOT NULL AND NEW.cobranca_padrao NOT IN ('implantacao','mensal','informativo') THEN
    RAISE EXCEPTION 'cobranca_padrao inválida: %', NEW.cobranca_padrao;
  END IF;
  IF NEW.origem IS NOT NULL AND NEW.origem NOT IN ('manual','ia_sugerido') THEN
    RAISE EXCEPTION 'origem inválida: %', NEW.origem;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propostas_produtos_validate ON public.propostas_produtos;
CREATE TRIGGER trg_propostas_produtos_validate
  BEFORE INSERT OR UPDATE ON public.propostas_produtos
  FOR EACH ROW EXECUTE FUNCTION public.propostas_produtos_validate();

-- ============================================
-- 2. NOVA TABELA: propostas_empresa_contexto (singleton)
-- ============================================
CREATE TABLE IF NOT EXISTS public.propostas_empresa_contexto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  nome_empresa text,
  descricao_operacional text,
  o_que_vendemos text[] DEFAULT '{}',
  o_que_nao_vendemos text[] DEFAULT '{}',
  tipo_ambiente text[] DEFAULT '{}',
  regras_tecnicas text[] DEFAULT '{}',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.propostas_empresa_contexto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ctx_select_users_with_access"
  ON public.propostas_empresa_contexto FOR SELECT
  TO authenticated
  USING (public.propostas_user_has_access(auth.uid()));

CREATE POLICY "ctx_insert_admin"
  ON public.propostas_empresa_contexto FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "ctx_update_admin"
  ON public.propostas_empresa_contexto FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "ctx_delete_admin"
  ON public.propostas_empresa_contexto FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_ctx_updated
  BEFORE UPDATE ON public.propostas_empresa_contexto
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 3. NOVA TABELA: propostas_perguntas_produtos
-- ============================================
CREATE TABLE IF NOT EXISTS public.propostas_perguntas_produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL,
  pergunta text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perguntas_prod_cat ON public.propostas_perguntas_produtos (categoria, ordem);

ALTER TABLE public.propostas_perguntas_produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pp_select_users_with_access"
  ON public.propostas_perguntas_produtos FOR SELECT
  TO authenticated
  USING (public.propostas_user_has_access(auth.uid()));

CREATE POLICY "pp_insert_admin"
  ON public.propostas_perguntas_produtos FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "pp_update_admin"
  ON public.propostas_perguntas_produtos FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "pp_delete_admin"
  ON public.propostas_perguntas_produtos FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_pp_updated
  BEFORE UPDATE ON public.propostas_perguntas_produtos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger validar categoria
CREATE OR REPLACE FUNCTION public.propostas_perguntas_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.categoria NOT IN ('infraestrutura','dados','seguranca','telefonia') THEN
    RAISE EXCEPTION 'categoria inválida: %', NEW.categoria;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pp_validate ON public.propostas_perguntas_produtos;
CREATE TRIGGER trg_pp_validate
  BEFORE INSERT OR UPDATE ON public.propostas_perguntas_produtos
  FOR EACH ROW EXECUTE FUNCTION public.propostas_perguntas_validate();

-- ============================================
-- 4. SEED inicial
-- ============================================
INSERT INTO public.propostas_empresa_contexto (
  singleton, nome_empresa, descricao_operacional,
  o_que_vendemos, o_que_nao_vendemos, tipo_ambiente, regras_tecnicas
) VALUES (
  true,
  'Empresa Modelo',
  'A empresa é especializada em infraestrutura de rede, conectividade, segurança eletrônica e comunicação corporativa, atuando em ambientes operacionais e industriais.',
  ARRAY['rede corporativa','internet','CFTV','telefonia'],
  ARRAY['computadores','suporte desktop'],
  ARRAY['industrial','agressivo','presença de resíduos'],
  ARRAY['equipamentos industriais','proteção contra corrosão','instalação adequada ao ambiente']
)
ON CONFLICT (singleton) DO NOTHING;

INSERT INTO public.propostas_perguntas_produtos (categoria, pergunta, ordem) VALUES
  ('infraestrutura','Quantos switches normalmente utiliza?',1),
  ('infraestrutura','Vai precisar de rack?',2),
  ('infraestrutura','Quantos pontos de rede serão instalados?',3),
  ('dados','Qual padrão de internet oferece (link dedicado/banda larga)?',1),
  ('dados','Qual a velocidade contratada?',2),
  ('dados','Necessita link redundante?',3),
  ('seguranca','Quantas câmeras serão instaladas?',1),
  ('seguranca','Resolução desejada (Full HD/4K)?',2),
  ('seguranca','Há necessidade de armazenamento (NVR/dias)?',3),
  ('telefonia','Quantos ramais serão utilizados?',1),
  ('telefonia','PABX em nuvem ou local?',2),
  ('telefonia','Necessita gravação de chamadas?',3)
ON CONFLICT DO NOTHING;