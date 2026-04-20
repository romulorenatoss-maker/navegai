-- 1) Trigger function: avaliador != avaliado/executor (templates)
CREATE OR REPLACE FUNCTION public.enforce_template_avaliador_distinto_avaliado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Avaliador vs Avaliado
  IF NEW.avaliador_profile_id IS NOT NULL
     AND NEW.avaliado_profile_id IS NOT NULL
     AND NEW.avaliador_profile_id = NEW.avaliado_profile_id THEN
    RAISE EXCEPTION 'O avaliador não pode ser a mesma pessoa que o avaliado.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Avaliador vs Executor (quem recebe a nota)
  IF NEW.avaliador_profile_id IS NOT NULL
     AND NEW.executor_profile_id IS NOT NULL
     AND NEW.avaliador_profile_id = NEW.executor_profile_id THEN
    RAISE EXCEPTION 'O avaliador não pode ser a mesma pessoa que recebe a nota (executor).'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_template_avaliador_distinto ON public.operational_templates;
CREATE TRIGGER trg_enforce_template_avaliador_distinto
BEFORE INSERT OR UPDATE ON public.operational_templates
FOR EACH ROW
EXECUTE FUNCTION public.enforce_template_avaliador_distinto_avaliado();

-- 2) Trigger function: avaliador != avaliado/responsavel (assignments)
CREATE OR REPLACE FUNCTION public.enforce_assignment_avaliador_distinto_avaliado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Avaliador vs Avaliado
  IF NEW.avaliador_id IS NOT NULL
     AND NEW.avaliado_id IS NOT NULL
     AND NEW.avaliador_id = NEW.avaliado_id THEN
    RAISE EXCEPTION 'O avaliador não pode ser a mesma pessoa que o avaliado.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Avaliador vs Responsavel (executor que recebe a nota)
  IF NEW.avaliador_id IS NOT NULL
     AND NEW.responsavel_id IS NOT NULL
     AND NEW.avaliador_id = NEW.responsavel_id THEN
    RAISE EXCEPTION 'O avaliador não pode ser a mesma pessoa que o responsável (executor que recebe a nota).'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_assignment_avaliador_distinto ON public.operational_assignments;
CREATE TRIGGER trg_enforce_assignment_avaliador_distinto
BEFORE INSERT OR UPDATE ON public.operational_assignments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_assignment_avaliador_distinto_avaliado();

-- 3) Garantir que os triggers existentes de aprovador != avaliado também estão ativos
DROP TRIGGER IF EXISTS trg_enforce_template_aprovador_distinto ON public.operational_templates;
CREATE TRIGGER trg_enforce_template_aprovador_distinto
BEFORE INSERT OR UPDATE ON public.operational_templates
FOR EACH ROW
EXECUTE FUNCTION public.enforce_template_aprovador_distinto_avaliado();

DROP TRIGGER IF EXISTS trg_enforce_assignment_aprovador_distinto ON public.operational_assignments;
CREATE TRIGGER trg_enforce_assignment_aprovador_distinto
BEFORE INSERT OR UPDATE ON public.operational_assignments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_aprovador_distinto_avaliado();