ALTER TABLE public.propostas_produtos
  ADD COLUMN IF NOT EXISTS valor_padrao numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_minimo numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.propostas_produtos_validate_precos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.valor_padrao IS NOT NULL AND NEW.valor_padrao < 0 THEN
    RAISE EXCEPTION 'valor_padrao não pode ser negativo';
  END IF;
  IF NEW.valor_minimo IS NOT NULL AND NEW.valor_minimo < 0 THEN
    RAISE EXCEPTION 'valor_minimo não pode ser negativo';
  END IF;
  IF NEW.valor_padrao IS NOT NULL AND NEW.valor_minimo IS NOT NULL
     AND NEW.valor_padrao > 0 AND NEW.valor_padrao < NEW.valor_minimo THEN
    RAISE EXCEPTION 'valor_padrao (%) não pode ser menor que valor_minimo (%)', NEW.valor_padrao, NEW.valor_minimo;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_propostas_produtos_validate_precos ON public.propostas_produtos;
CREATE TRIGGER trg_propostas_produtos_validate_precos
  BEFORE INSERT OR UPDATE ON public.propostas_produtos
  FOR EACH ROW EXECUTE FUNCTION public.propostas_produtos_validate_precos();