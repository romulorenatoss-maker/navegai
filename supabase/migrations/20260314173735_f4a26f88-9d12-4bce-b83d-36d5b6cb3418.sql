
-- Migrate existing executor/gestor roles to avaliado
UPDATE public.user_roles SET role = 'avaliado'::app_role WHERE role IN ('executor'::app_role, 'gestor'::app_role);

-- Migrate cargo field on profiles
UPDATE public.profiles SET cargo = 'avaliado' WHERE cargo IN ('executor', 'atendente', 'tecnico');

-- Update sync_user_role to support the new simplified roles
CREATE OR REPLACE FUNCTION public.sync_user_role(_user_id uuid, _cargo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _role app_role;
BEGIN
  _role := CASE _cargo
    WHEN 'administrador' THEN 'admin'::app_role
    WHEN 'avaliador' THEN 'avaliador'::app_role
    WHEN 'avaliado' THEN 'avaliado'::app_role
    ELSE NULL
  END;

  DELETE FROM public.user_roles WHERE user_id = _user_id;

  IF _role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  IF _cargo = 'administrador' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'avaliador'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END;
$function$;
