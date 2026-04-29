
-- =====================================================
-- MÓDULO PROPOSTAS — Fluxo Conversacional v2
-- =====================================================

-- 1. CATEGORIAS DO SETUP (configuráveis)
CREATE TABLE IF NOT EXISTS public.propostas_categorias_setup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  ordem int NOT NULL DEFAULT 0,
  cobranca_padrao text NOT NULL DEFAULT 'mensal' CHECK (cobranca_padrao IN ('implantacao','mensal','informativo')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.propostas_categorias_setup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "propostas_cat_select" ON public.propostas_categorias_setup
  FOR SELECT USING (public.propostas_user_has_access(auth.uid()));
CREATE POLICY "propostas_cat_insert" ON public.propostas_categorias_setup
  FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "propostas_cat_update" ON public.propostas_categorias_setup
  FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "propostas_cat_delete" ON public.propostas_categorias_setup
  FOR DELETE USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_propostas_cat_updated
  BEFORE UPDATE ON public.propostas_categorias_setup
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. PERGUNTAS DO SETUP (configuráveis)
CREATE TABLE IF NOT EXISTS public.propostas_perguntas_setup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id uuid NOT NULL REFERENCES public.propostas_categorias_setup(id) ON DELETE CASCADE,
  ordem int NOT NULL DEFAULT 0,
  pergunta text NOT NULL,
  tipo text NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto','numero','escolha','sim_nao')),
  opcoes jsonb,
  campo_token text,
  obrigatoria boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_propostas_perg_cat ON public.propostas_perguntas_setup(categoria_id, ordem);

ALTER TABLE public.propostas_perguntas_setup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "propostas_perg_select" ON public.propostas_perguntas_setup
  FOR SELECT USING (public.propostas_user_has_access(auth.uid()));
CREATE POLICY "propostas_perg_insert" ON public.propostas_perguntas_setup
  FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "propostas_perg_update" ON public.propostas_perguntas_setup
  FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "propostas_perg_delete" ON public.propostas_perguntas_setup
  FOR DELETE USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_propostas_perg_updated
  BEFORE UPDATE ON public.propostas_perguntas_setup
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. ITENS: classificação financeira
ALTER TABLE public.propostas_itens
  ADD COLUMN IF NOT EXISTS cobranca text NOT NULL DEFAULT 'mensal'
  CHECK (cobranca IN ('implantacao','mensal','informativo'));

ALTER TABLE public.propostas_itens
  ADD COLUMN IF NOT EXISTS categoria text;

-- 4. PRODUTOS: categoria para agrupamento automático
ALTER TABLE public.propostas_produtos
  ADD COLUMN IF NOT EXISTS categoria text;

ALTER TABLE public.propostas_produtos
  ADD COLUMN IF NOT EXISTS cobranca_padrao text NOT NULL DEFAULT 'mensal'
  CHECK (cobranca_padrao IN ('implantacao','mensal','informativo'));

-- 5. SEED CATEGORIAS PADRÃO (sem Cloud)
INSERT INTO public.propostas_categorias_setup (codigo, nome, ordem, cobranca_padrao) VALUES
  ('contexto',       'Contexto do Cliente', 10, 'informativo'),
  ('infraestrutura', 'Infraestrutura',      20, 'implantacao'),
  ('dados',          'Dados',               30, 'mensal'),
  ('seguranca',      'Segurança',           40, 'mensal'),
  ('telefonia',      'Telefonia',           50, 'mensal'),
  ('financeiro',     'Financeiro',          60, 'informativo')
ON CONFLICT (codigo) DO NOTHING;

-- 6. SEED PERGUNTAS BÁSICAS
INSERT INTO public.propostas_perguntas_setup (categoria_id, ordem, pergunta, tipo, campo_token, obrigatoria)
SELECT c.id, 10, 'Qual o segmento/atividade do cliente?', 'texto', 'segmento', true
FROM public.propostas_categorias_setup c WHERE c.codigo = 'contexto'
ON CONFLICT DO NOTHING;

INSERT INTO public.propostas_perguntas_setup (categoria_id, ordem, pergunta, tipo, campo_token, obrigatoria)
SELECT c.id, 20, 'Quantos usuários/colaboradores?', 'numero', 'usuarios', true
FROM public.propostas_categorias_setup c WHERE c.codigo = 'contexto'
ON CONFLICT DO NOTHING;

INSERT INTO public.propostas_perguntas_setup (categoria_id, ordem, pergunta, tipo, campo_token, obrigatoria)
SELECT c.id, 10, 'Qual a metragem aproximada do local? (em m²)', 'numero', 'metragem', false
FROM public.propostas_categorias_setup c WHERE c.codigo = 'infraestrutura'
ON CONFLICT DO NOTHING;

INSERT INTO public.propostas_perguntas_setup (categoria_id, ordem, pergunta, tipo, campo_token, obrigatoria)
SELECT c.id, 10, 'Volume estimado de dados (GB) ou crescimento mensal?', 'texto', 'volume_dados', false
FROM public.propostas_categorias_setup c WHERE c.codigo = 'dados'
ON CONFLICT DO NOTHING;

INSERT INTO public.propostas_perguntas_setup (categoria_id, ordem, pergunta, tipo, campo_token, obrigatoria)
SELECT c.id, 10, 'Necessita de monitoramento por câmeras / controle de acesso?', 'sim_nao', 'seguranca_fisica', false
FROM public.propostas_categorias_setup c WHERE c.codigo = 'seguranca'
ON CONFLICT DO NOTHING;

INSERT INTO public.propostas_perguntas_setup (categoria_id, ordem, pergunta, tipo, campo_token, obrigatoria)
SELECT c.id, 10, 'Quantos ramais/linhas de telefonia?', 'numero', 'ramais', false
FROM public.propostas_categorias_setup c WHERE c.codigo = 'telefonia'
ON CONFLICT DO NOTHING;

INSERT INTO public.propostas_perguntas_setup (categoria_id, ordem, pergunta, tipo, campo_token, obrigatoria)
SELECT c.id, 10, 'Forma de pagamento preferencial?', 'escolha', 'forma_pagamento', false
FROM public.propostas_categorias_setup c WHERE c.codigo = 'financeiro'
ON CONFLICT DO NOTHING;

UPDATE public.propostas_perguntas_setup
SET opcoes = '["Boleto","PIX","Cartão","Transferência"]'::jsonb
WHERE campo_token = 'forma_pagamento';
