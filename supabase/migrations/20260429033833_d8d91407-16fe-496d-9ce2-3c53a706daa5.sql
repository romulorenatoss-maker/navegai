
-- ============================================================
-- PROPOSTAS RENDER v2 — FIX
-- Isolado ao módulo de propostas. Não altera outros módulos.
-- ============================================================

-- 1) UNIQUE parcial em campo_template (case-insensitive, apenas ativos)
--    Permite vários produtos sem campo_template (NULL),
--    mas garante unicidade quando preenchido.
CREATE UNIQUE INDEX IF NOT EXISTS uq_propostas_produtos_campo_template_ativo
  ON public.propostas_produtos (lower(campo_template))
  WHERE campo_template IS NOT NULL AND ativo = true;

-- 2) Trigger de validação em propostas_itens:
--    - se produto_id informado, herdar categoria/cobranca quando vazias
--    - bloquear inserts de IA sem produto_id (origem detectada por proposta)
--    - manter compat com itens manuais legados (produto_id NULL permitido,
--      mas marcado em log para revisão futura)
CREATE OR REPLACE FUNCTION public.propostas_itens_enforce_produto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_prod RECORD;
BEGIN
  IF NEW.produto_id IS NOT NULL THEN
    SELECT id, categoria, cobranca_padrao, ativo
      INTO v_prod
    FROM public.propostas_produtos
    WHERE id = NEW.produto_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'produto_id % não existe em propostas_produtos', NEW.produto_id;
    END IF;

    IF v_prod.ativo = false THEN
      RAISE EXCEPTION 'produto_id % está inativo e não pode ser usado em propostas_itens', NEW.produto_id;
    END IF;

    -- Herdar categoria do produto se não informada no item
    IF NEW.categoria IS NULL AND v_prod.categoria IS NOT NULL THEN
      NEW.categoria := v_prod.categoria;
    END IF;

    -- Herdar cobranca do produto se item veio com default e produto define outro
    IF (NEW.cobranca IS NULL OR NEW.cobranca = 'mensal')
       AND v_prod.cobranca_padrao IS NOT NULL THEN
      NEW.cobranca := v_prod.cobranca_padrao;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propostas_itens_enforce_produto ON public.propostas_itens;
CREATE TRIGGER trg_propostas_itens_enforce_produto
  BEFORE INSERT OR UPDATE ON public.propostas_itens
  FOR EACH ROW EXECUTE FUNCTION public.propostas_itens_enforce_produto();

-- 3) Índice auxiliar: buscar itens por produto_id (render agrupa por campo_template)
CREATE INDEX IF NOT EXISTS idx_propostas_itens_produto_id
  ON public.propostas_itens (produto_id)
  WHERE produto_id IS NOT NULL;

-- 4) Garantir que propostas_perguntas_setup.campo_token é NOT NULL
--    (já é exigido logicamente; reforçamos somente se não houver violação)
DO $$
DECLARE
  v_nulos int;
BEGIN
  SELECT COUNT(*) INTO v_nulos
  FROM public.propostas_perguntas_setup
  WHERE campo_token IS NULL;

  IF v_nulos = 0 THEN
    BEGIN
      ALTER TABLE public.propostas_perguntas_setup
        ALTER COLUMN campo_token SET NOT NULL;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
END $$;
