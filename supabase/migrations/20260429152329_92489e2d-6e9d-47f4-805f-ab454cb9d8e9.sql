-- Fase 1: Fluxo simples de propostas
ALTER TABLE public.propostas_perguntas_setup
  ADD COLUMN IF NOT EXISTS tipo_pergunta text DEFAULT 'input',
  ADD COLUMN IF NOT EXISTS categoria_produto text,
  ADD COLUMN IF NOT EXISTS gera_contexto boolean DEFAULT false;

ALTER TABLE public.propostas_produtos
  ADD COLUMN IF NOT EXISTS placeholder_template text;

-- Validação leve do tipo_pergunta (não quebra registros antigos)
CREATE OR REPLACE FUNCTION public.propostas_perguntas_validate_tipo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tipo_pergunta IS NOT NULL
     AND NEW.tipo_pergunta NOT IN ('contexto','produto','input') THEN
    RAISE EXCEPTION 'tipo_pergunta inválido: % (esperado contexto|produto|input)', NEW.tipo_pergunta;
  END IF;
  IF NEW.categoria_produto IS NOT NULL
     AND NEW.categoria_produto NOT IN ('infraestrutura','dados','seguranca','telefonia','outros') THEN
    RAISE EXCEPTION 'categoria_produto inválida: %', NEW.categoria_produto;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propostas_perguntas_validate_tipo ON public.propostas_perguntas_setup;
CREATE TRIGGER trg_propostas_perguntas_validate_tipo
BEFORE INSERT OR UPDATE ON public.propostas_perguntas_setup
FOR EACH ROW EXECUTE FUNCTION public.propostas_perguntas_validate_tipo();