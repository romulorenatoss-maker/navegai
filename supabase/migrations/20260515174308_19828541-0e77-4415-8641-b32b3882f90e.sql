-- Fix: 'resolvida' não deve bloquear transição de assignment
-- O aprovador avalia a qualidade da resolução quando a tarefa chegar a ele
CREATE OR REPLACE FUNCTION public.check_contingency_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bloquear boolean;
  v_abertas integer;
BEGIN
  IF NEW.status IN ('concluida', 'aguardando_aprovacao')
     AND OLD.status NOT IN ('concluida', 'aguardando_aprovacao') THEN

    SELECT COALESCE(t.bloquear_fechamento_com_contingencia, false) INTO v_bloquear
    FROM operational_templates t WHERE t.id = NEW.template_id;

    IF v_bloquear THEN
      SELECT COUNT(*) INTO v_abertas
      FROM operational_contingencies
      WHERE assignment_id = NEW.id
        AND status NOT IN ('validada', 'descartada', 'resolvida');

      IF v_abertas > 0 THEN
        RAISE EXCEPTION 'Não é possível concluir: existem % contingência(s) pendente(s)', v_abertas;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;