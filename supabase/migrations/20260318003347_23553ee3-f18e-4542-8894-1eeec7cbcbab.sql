CREATE OR REPLACE FUNCTION public.atomic_reserve_lead(_lead_id uuid, _user_id uuid, _profile_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _updated_count int;
BEGIN
  UPDATE leads
  SET reserved_by = NULL,
      reserved_at = now(),
      responsavel_id = _profile_id,
      status_lead = 'em_atendimento'
  WHERE id = _lead_id
    AND reserved_by IS NULL
    AND responsavel_id IS NULL
    AND status_lead = 'fila_captura';

  GET DIAGNOSTICS _updated_count = ROW_COUNT;
  RETURN _updated_count > 0;
END;
$function$;