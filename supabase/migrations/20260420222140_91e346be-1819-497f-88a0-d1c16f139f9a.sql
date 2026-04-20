
-- 1. clientes: drop open SELECT
DROP POLICY IF EXISTS "Authenticated can view clientes" ON public.clientes;

-- 2. leads: restrict UPDATE to owner/admin
DROP POLICY IF EXISTS "Authenticated can update leads" ON public.leads;
CREATE POLICY "Owner or admin can update leads"
ON public.leads FOR UPDATE TO authenticated
USING (
  responsavel_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'avaliador'::app_role)
)
WITH CHECK (
  responsavel_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'avaliador'::app_role)
);

-- 3. lead_historico: restrict UPDATE
DROP POLICY IF EXISTS "Authenticated can update ciencia on lead_historico" ON public.lead_historico;
CREATE POLICY "Author or admin can update lead_historico"
ON public.lead_historico FOR UPDATE TO authenticated
USING (
  usuario_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR public.is_admin(auth.uid())
)
WITH CHECK (
  usuario_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR public.is_admin(auth.uid())
);

-- 4. lead_tarefas_contato: restrict UPDATE to responsavel/admin
DROP POLICY IF EXISTS "Authenticated can update lead_tarefas_contato" ON public.lead_tarefas_contato;
CREATE POLICY "Owner or admin can update lead_tarefas_contato"
ON public.lead_tarefas_contato FOR UPDATE TO authenticated
USING (
  responsavel_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'avaliador'::app_role)
)
WITH CHECK (
  responsavel_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'avaliador'::app_role)
);

-- 5. Make evidencias bucket private
UPDATE storage.buckets SET public = false WHERE id = 'evidencias';

-- 6. Storage policies for evidencias (authenticated only)
DROP POLICY IF EXISTS "Public read evidencias" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read evidencias" ON storage.objects;
CREATE POLICY "Authenticated read evidencias"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'evidencias');

DROP POLICY IF EXISTS "Authenticated upload evidencias" ON storage.objects;
CREATE POLICY "Authenticated upload evidencias"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'evidencias');

-- 7. Harden get_user_effective_permissions
CREATE OR REPLACE FUNCTION public.get_user_effective_permissions(_profile_id uuid)
 RETURNS TABLE(resource_code text, resource_path text, can_view boolean, can_create boolean, can_edit boolean, can_delete boolean, can_assign boolean, can_export boolean, data_scope data_scope)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _profile_id NOT IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
     AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
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
  FROM public.permission_resources r
  LEFT JOIN public.group_permissions gp ON gp.resource_id = r.id
    AND gp.group_id IN (SELECT group_id FROM public.user_group_assignments WHERE profile_id = _profile_id)
  LEFT JOIN public.user_permission_overrides o ON o.resource_id = r.id AND o.profile_id = _profile_id
  GROUP BY r.code, r.path, o.can_view, o.can_create, o.can_edit, o.can_delete, o.can_assign, o.can_export, o.data_scope;
END;
$function$;

-- 8. Fix mutable search_path on normalize_cpf
CREATE OR REPLACE FUNCTION public.normalize_cpf(cpf_input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT regexp_replace(COALESCE(cpf_input, ''), '\D', '', 'g');
$function$;
