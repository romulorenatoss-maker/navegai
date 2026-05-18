-- Corrige contingências abertas/em andamento já criadas sem responsável
UPDATE public.operational_contingencies c
SET responsavel_id = a.responsavel_id,
    updated_at = now()
FROM public.operational_assignments a
WHERE c.assignment_id = a.id
  AND c.responsavel_id IS NULL
  AND a.responsavel_id IS NOT NULL
  AND c.status IN ('aberta', 'em_andamento');

-- Garante responsável herdado da tarefa para novas contingências
CREATE OR REPLACE FUNCTION public.set_operational_contingency_responsavel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.responsavel_id IS NULL THEN
    SELECT a.responsavel_id
      INTO NEW.responsavel_id
    FROM public.operational_assignments a
    WHERE a.id = NEW.assignment_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_operational_contingency_responsavel ON public.operational_contingencies;
CREATE TRIGGER trg_set_operational_contingency_responsavel
BEFORE INSERT OR UPDATE OF assignment_id, responsavel_id
ON public.operational_contingencies
FOR EACH ROW
EXECUTE FUNCTION public.set_operational_contingency_responsavel();