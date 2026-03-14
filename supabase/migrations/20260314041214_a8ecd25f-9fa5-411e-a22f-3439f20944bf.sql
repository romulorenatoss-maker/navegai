
-- Function to sync user roles based on cargo
CREATE OR REPLACE FUNCTION public.sync_user_role(
  _user_id uuid,
  _cargo text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role app_role;
BEGIN
  -- Map cargo to role
  _role := CASE _cargo
    WHEN 'administrador' THEN 'admin'::app_role
    WHEN 'avaliador' THEN 'avaliador'::app_role
    WHEN 'executor' THEN 'executor'::app_role
    WHEN 'gestor' THEN 'gestor'::app_role
    ELSE NULL
  END;

  -- Remove all existing roles for this user
  DELETE FROM public.user_roles WHERE user_id = _user_id;

  -- Insert the new role
  IF _role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  -- If admin, also add avaliador role for full access
  IF _cargo = 'administrador' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'avaliador'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END;
$$;
