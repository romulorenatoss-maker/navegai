
-- Create data scope enum
CREATE TYPE public.data_scope AS ENUM ('none', 'own', 'team', 'all');

-- Add data_scope to group_permissions (default 'own')
ALTER TABLE public.group_permissions ADD COLUMN data_scope data_scope NOT NULL DEFAULT 'own';

-- Add data_scope to user_permission_overrides (null = inherit from group)
ALTER TABLE public.user_permission_overrides ADD COLUMN data_scope data_scope;

-- Update Administrador: all data
UPDATE public.group_permissions SET data_scope = 'all'
WHERE group_id = (SELECT id FROM permission_groups WHERE name = 'Administrador');

-- Update Avaliador: team scope
UPDATE public.group_permissions SET data_scope = 'team'
WHERE group_id = (SELECT id FROM permission_groups WHERE name = 'Avaliador');

-- Update Avaliado: own data only
UPDATE public.group_permissions SET data_scope = 'own'
WHERE group_id = (SELECT id FROM permission_groups WHERE name = 'Avaliado');

-- Recreate function with data_scope
DROP FUNCTION IF EXISTS public.get_user_effective_permissions(uuid);

CREATE FUNCTION public.get_user_effective_permissions(_profile_id uuid)
RETURNS TABLE (
  resource_code text,
  resource_path text,
  can_view boolean,
  can_create boolean,
  can_edit boolean,
  can_delete boolean,
  can_assign boolean,
  can_export boolean,
  data_scope data_scope
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.code AS resource_code,
    r.path AS resource_path,
    COALESCE(o.can_view, MAX(gp.can_view::int)::boolean, false) AS can_view,
    COALESCE(o.can_create, MAX(gp.can_create::int)::boolean, false) AS can_create,
    COALESCE(o.can_edit, MAX(gp.can_edit::int)::boolean, false) AS can_edit,
    COALESCE(o.can_delete, MAX(gp.can_delete::int)::boolean, false) AS can_delete,
    COALESCE(o.can_assign, MAX(gp.can_assign::int)::boolean, false) AS can_assign,
    COALESCE(o.can_export, MAX(gp.can_export::int)::boolean, false) AS can_export,
    COALESCE(
      o.data_scope,
      (ARRAY['none','own','team','all'])[1 + MAX(
        CASE gp.data_scope
          WHEN 'all' THEN 3
          WHEN 'team' THEN 2
          WHEN 'own' THEN 1
          ELSE 0
        END
      )]::data_scope,
      'none'::data_scope
    ) AS data_scope
  FROM permission_resources r
  LEFT JOIN group_permissions gp ON gp.resource_id = r.id
    AND gp.group_id IN (SELECT group_id FROM user_group_assignments WHERE profile_id = _profile_id)
  LEFT JOIN user_permission_overrides o ON o.resource_id = r.id AND o.profile_id = _profile_id
  GROUP BY r.code, r.path, o.can_view, o.can_create, o.can_edit, o.can_delete, o.can_assign, o.can_export, o.data_scope;
$$;
