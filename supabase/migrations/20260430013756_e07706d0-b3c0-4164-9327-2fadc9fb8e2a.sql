-- 1) Adicionar gera_contexto em perguntas
ALTER TABLE public.propostas_perguntas_produtos
  ADD COLUMN IF NOT EXISTS gera_contexto boolean NOT NULL DEFAULT false;

-- 2) Tabela de vínculo direto pergunta -> produto
CREATE TABLE IF NOT EXISTS public.propostas_pergunta_produto_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pergunta_id uuid NOT NULL REFERENCES public.propostas_perguntas_produtos(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.propostas_produtos(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pergunta_id, produto_id)
);

CREATE INDEX IF NOT EXISTS idx_pergunta_produto_link_pergunta ON public.propostas_pergunta_produto_link(pergunta_id);
CREATE INDEX IF NOT EXISTS idx_pergunta_produto_link_produto ON public.propostas_pergunta_produto_link(produto_id);

ALTER TABLE public.propostas_pergunta_produto_link ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Propostas users can view links"
ON public.propostas_pergunta_produto_link FOR SELECT
USING (public.propostas_user_has_access(auth.uid()));

CREATE POLICY "Propostas users can insert links"
ON public.propostas_pergunta_produto_link FOR INSERT
WITH CHECK (public.propostas_user_has_access(auth.uid()));

CREATE POLICY "Propostas users can update links"
ON public.propostas_pergunta_produto_link FOR UPDATE
USING (public.propostas_user_has_access(auth.uid()));

CREATE POLICY "Propostas users can delete links"
ON public.propostas_pergunta_produto_link FOR DELETE
USING (public.propostas_user_has_access(auth.uid()));

-- 3) Remover trigger de validação rígida de categoria_produto para permitir categorias customizadas
-- (já existe propostas_perguntas_validate_tipo, mas valida só quando NOT NULL — ok)
-- Para perguntas_produtos.categoria, não há trigger restritivo, ok.

-- 4) Função auxiliar: contar vínculos de uma categoria (para bloquear exclusão)
CREATE OR REPLACE FUNCTION public.propostas_categoria_em_uso(_codigo text)
RETURNS TABLE(total_perguntas bigint, total_produtos bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*) FROM public.propostas_perguntas_produtos WHERE categoria = _codigo),
    (SELECT COUNT(*) FROM public.propostas_produtos WHERE categoria = _codigo);
$$;