
-- Atomic function to reserve a lead for capture
-- Returns true if reservation succeeded, false if already taken
CREATE OR REPLACE FUNCTION public.atomic_reserve_lead(_lead_id uuid, _user_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _updated_count int;
BEGIN
  UPDATE leads
  SET reserved_by = _profile_id,
      reserved_at = now(),
      status_lead = 'reservado'
  WHERE id = _lead_id
    AND reserved_by IS NULL
    AND responsavel_id IS NULL
    AND status_lead = 'aguardando_captura';

  GET DIAGNOSTICS _updated_count = ROW_COUNT;
  RETURN _updated_count > 0;
END;
$$;
