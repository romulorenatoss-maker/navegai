
-- Trigger: aprovador != avaliado em operational_assignments
CREATE OR REPLACE FUNCTION public.enforce_aprovador_distinto_avaliado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.aprovador_id IS NOT NULL
     AND NEW.avaliado_id IS NOT NULL
     AND NEW.aprovador_id = NEW.avaliado_id THEN
    RAISE EXCEPTION 'O aprovador não pode ser a mesma pessoa que o avaliado.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignments_aprovador_distinto ON public.operational_assignments;
CREATE TRIGGER trg_assignments_aprovador_distinto
BEFORE INSERT OR UPDATE OF aprovador_id, avaliado_id
ON public.operational_assignments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_aprovador_distinto_avaliado();

-- Mesma regra para templates (operational_templates)
CREATE OR REPLACE FUNCTION public.enforce_template_aprovador_distinto_avaliado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.aprovador_profile_id IS NOT NULL
     AND NEW.avaliado_profile_id IS NOT NULL
     AND NEW.aprovador_profile_id = NEW.avaliado_profile_id THEN
    RAISE EXCEPTION 'O aprovador do modelo não pode ser a mesma pessoa que o avaliado.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_templates_aprovador_distinto ON public.operational_templates;
CREATE TRIGGER trg_templates_aprovador_distinto
BEFORE INSERT OR UPDATE OF aprovador_profile_id, avaliado_profile_id
ON public.operational_templates
FOR EACH ROW
EXECUTE FUNCTION public.enforce_template_aprovador_distinto_avaliado();
