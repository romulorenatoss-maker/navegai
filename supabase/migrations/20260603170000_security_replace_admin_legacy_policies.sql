-- CODEX063: substitui policies legadas baseadas em is_admin/has_role
-- por verificacoes tenant-scoped, mantendo compatibilidade operacional.

CREATE OR REPLACE FUNCTION public.security_current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.security_is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(public.is_admin(auth.uid()), false)
$$;

CREATE OR REPLACE FUNCTION public.security_usuario_tem_tenant_estrito(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_tenant_id IS NOT NULL
    AND (
      public.security_is_platform_admin()
      OR EXISTS (
        SELECT 1
        FROM public.security_profile_tenants spt
        WHERE spt.profile_id = public.security_current_profile_id()
          AND spt.tenant_id = p_tenant_id
          AND spt.ativo = true
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.security_is_tenant_admin(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_tenant_id IS NOT NULL
    AND (
      public.security_is_platform_admin()
      OR EXISTS (
        SELECT 1
        FROM public.security_profile_tenants spt
        WHERE spt.profile_id = public.security_current_profile_id()
          AND spt.tenant_id = p_tenant_id
          AND spt.ativo = true
          AND spt.papel = 'tenant_admin'
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.security_is_tenant_manager(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_tenant_id IS NOT NULL
    AND (
      public.security_is_platform_admin()
      OR EXISTS (
        SELECT 1
        FROM public.security_profile_tenants spt
        WHERE spt.profile_id = public.security_current_profile_id()
          AND spt.tenant_id = p_tenant_id
          AND spt.ativo = true
          AND spt.papel IN ('tenant_admin', 'tenant_manager')
      )
    )
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads' AND policyname = 'Admins can manage leads') THEN
    EXECUTE 'DROP POLICY "Admins can manage leads" ON public.leads';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads' AND policyname = 'Authorized can insert leads') THEN
    EXECUTE 'DROP POLICY "Authorized can insert leads" ON public.leads';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads' AND policyname = 'Authorized can view leads') THEN
    EXECUTE 'DROP POLICY "Authorized can view leads" ON public.leads';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads' AND policyname = 'Owner or admin can update leads') THEN
    EXECUTE 'DROP POLICY "Owner or admin can update leads" ON public.leads';
  END IF;
END $$;

CREATE POLICY "leads_tenant_select"
  ON public.leads FOR SELECT TO authenticated
  USING (
    public.security_usuario_tem_tenant_estrito(tenant_id)
    OR public.security_is_platform_admin()
    OR responsavel_id = public.security_current_profile_id()
    OR convertido_por = public.security_current_profile_id()
  );

CREATE POLICY "leads_tenant_insert"
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (
    public.security_is_platform_admin()
    OR public.security_is_tenant_manager(tenant_id)
    OR responsavel_id = public.security_current_profile_id()
  );

CREATE POLICY "leads_tenant_update"
  ON public.leads FOR UPDATE TO authenticated
  USING (
    public.security_is_platform_admin()
    OR public.security_is_tenant_manager(tenant_id)
    OR responsavel_id = public.security_current_profile_id()
  )
  WITH CHECK (
    public.security_is_platform_admin()
    OR public.security_is_tenant_manager(tenant_id)
    OR responsavel_id = public.security_current_profile_id()
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clientes' AND policyname = 'Admins can manage clientes') THEN
    EXECUTE 'DROP POLICY "Admins can manage clientes" ON public.clientes';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clientes' AND policyname = 'Authorized can insert clientes') THEN
    EXECUTE 'DROP POLICY "Authorized can insert clientes" ON public.clientes';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clientes' AND policyname = 'Authorized can update clientes') THEN
    EXECUTE 'DROP POLICY "Authorized can update clientes" ON public.clientes';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clientes' AND policyname = 'Authorized can view clientes') THEN
    EXECUTE 'DROP POLICY "Authorized can view clientes" ON public.clientes';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clientes' AND policyname = 'Avaliados can view own lead clientes') THEN
    EXECUTE 'DROP POLICY "Avaliados can view own lead clientes" ON public.clientes';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clientes' AND policyname = 'Creator can view own clientes') THEN
    EXECUTE 'DROP POLICY "Creator can view own clientes" ON public.clientes';
  END IF;
END $$;

CREATE POLICY "clientes_tenant_select"
  ON public.clientes FOR SELECT TO authenticated
  USING (
    public.security_usuario_tem_tenant_estrito(tenant_id)
    OR public.security_is_platform_admin()
    OR criado_por = auth.uid()
    OR public.is_lead_owner_of_cliente(id)
  );

CREATE POLICY "clientes_tenant_insert"
  ON public.clientes FOR INSERT TO authenticated
  WITH CHECK (
    public.security_is_platform_admin()
    OR public.security_is_tenant_manager(tenant_id)
    OR criado_por = auth.uid()
  );

CREATE POLICY "clientes_tenant_update"
  ON public.clientes FOR UPDATE TO authenticated
  USING (
    public.security_is_platform_admin()
    OR public.security_is_tenant_manager(tenant_id)
    OR public.is_lead_owner_of_cliente(id)
  )
  WITH CHECK (
    public.security_is_platform_admin()
    OR public.security_is_tenant_manager(tenant_id)
    OR public.is_lead_owner_of_cliente(id)
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cliente_contatos' AND policyname = 'Admins can manage cliente_contatos') THEN
    EXECUTE 'DROP POLICY "Admins can manage cliente_contatos" ON public.cliente_contatos';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cliente_contatos' AND policyname = 'Authorized can insert cliente_contatos') THEN
    EXECUTE 'DROP POLICY "Authorized can insert cliente_contatos" ON public.cliente_contatos';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cliente_contatos' AND policyname = 'Authorized can update cliente_contatos') THEN
    EXECUTE 'DROP POLICY "Authorized can update cliente_contatos" ON public.cliente_contatos';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cliente_contatos' AND policyname = 'Authorized can view cliente_contatos') THEN
    EXECUTE 'DROP POLICY "Authorized can view cliente_contatos" ON public.cliente_contatos';
  END IF;
END $$;

CREATE POLICY "cliente_contatos_tenant_select"
  ON public.cliente_contatos FOR SELECT TO authenticated
  USING (
    public.security_is_platform_admin()
    OR public.is_lead_owner_of_cliente(cliente_id)
    OR EXISTS (
      SELECT 1
      FROM public.clientes c
      WHERE c.id = cliente_contatos.cliente_id
        AND public.security_usuario_tem_tenant_estrito(c.tenant_id)
    )
  );

CREATE POLICY "cliente_contatos_tenant_insert"
  ON public.cliente_contatos FOR INSERT TO authenticated
  WITH CHECK (
    public.security_is_platform_admin()
    OR public.is_lead_owner_of_cliente(cliente_id)
    OR EXISTS (
      SELECT 1
      FROM public.clientes c
      WHERE c.id = cliente_contatos.cliente_id
        AND public.security_is_tenant_manager(c.tenant_id)
    )
  );

CREATE POLICY "cliente_contatos_tenant_update"
  ON public.cliente_contatos FOR UPDATE TO authenticated
  USING (
    public.security_is_platform_admin()
    OR public.is_lead_owner_of_cliente(cliente_id)
    OR EXISTS (
      SELECT 1
      FROM public.clientes c
      WHERE c.id = cliente_contatos.cliente_id
        AND public.security_is_tenant_manager(c.tenant_id)
    )
  )
  WITH CHECK (
    public.security_is_platform_admin()
    OR public.is_lead_owner_of_cliente(cliente_id)
    OR EXISTS (
      SELECT 1
      FROM public.clientes c
      WHERE c.id = cliente_contatos.cliente_id
        AND public.security_is_tenant_manager(c.tenant_id)
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ordens_servico' AND policyname = 'Admins can manage OS') THEN
    EXECUTE 'DROP POLICY "Admins can manage OS" ON public.ordens_servico';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ordens_servico' AND policyname = 'Authenticated can update OS') THEN
    EXECUTE 'DROP POLICY "Authenticated can update OS" ON public.ordens_servico';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ordens_servico' AND policyname = 'Authorized can insert OS') THEN
    EXECUTE 'DROP POLICY "Authorized can insert OS" ON public.ordens_servico';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ordens_servico' AND policyname = 'Avaliadores can view OS') THEN
    EXECUTE 'DROP POLICY "Avaliadores can view OS" ON public.ordens_servico';
  END IF;
END $$;

CREATE POLICY "ordens_servico_tenant_select"
  ON public.ordens_servico FOR SELECT TO authenticated
  USING (
    public.security_usuario_tem_tenant_estrito(tenant_id)
    OR public.security_is_platform_admin()
    OR tecnico_id = public.security_current_profile_id()
    OR atendente_id = public.security_current_profile_id()
    OR colaborador_avaliado_id = public.security_current_profile_id()
  );

CREATE POLICY "ordens_servico_tenant_insert"
  ON public.ordens_servico FOR INSERT TO authenticated
  WITH CHECK (
    public.security_is_platform_admin()
    OR public.security_is_tenant_manager(tenant_id)
  );

CREATE POLICY "ordens_servico_tenant_update"
  ON public.ordens_servico FOR UPDATE TO authenticated
  USING (
    public.security_is_platform_admin()
    OR public.security_is_tenant_manager(tenant_id)
    OR tecnico_id = public.security_current_profile_id()
    OR atendente_id = public.security_current_profile_id()
  )
  WITH CHECK (
    public.security_is_platform_admin()
    OR public.security_is_tenant_manager(tenant_id)
    OR tecnico_id = public.security_current_profile_id()
    OR atendente_id = public.security_current_profile_id()
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'avaliacoes' AND policyname = 'Admins can manage avaliacoes') THEN
    EXECUTE 'DROP POLICY "Admins can manage avaliacoes" ON public.avaliacoes';
  END IF;
END $$;

CREATE POLICY "avaliacoes_tenant_manage"
  ON public.avaliacoes FOR ALL TO authenticated
  USING (
    public.security_is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.ordens_servico os
      WHERE os.id = avaliacoes.ordem_servico_id
        AND public.security_is_tenant_manager(os.tenant_id)
    )
  )
  WITH CHECK (
    public.security_is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.ordens_servico os
      WHERE os.id = avaliacoes.ordem_servico_id
        AND public.security_is_tenant_manager(os.tenant_id)
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'respostas_avaliacao' AND policyname = 'Admins can manage respostas') THEN
    EXECUTE 'DROP POLICY "Admins can manage respostas" ON public.respostas_avaliacao';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'respostas_avaliacao' AND policyname = 'Avaliadores can insert respostas') THEN
    EXECUTE 'DROP POLICY "Avaliadores can insert respostas" ON public.respostas_avaliacao';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'respostas_avaliacao' AND policyname = 'Avaliadores can view all respostas') THEN
    EXECUTE 'DROP POLICY "Avaliadores can view all respostas" ON public.respostas_avaliacao';
  END IF;
END $$;

CREATE POLICY "respostas_avaliacao_tenant_manage"
  ON public.respostas_avaliacao FOR ALL TO authenticated
  USING (
    public.security_is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.ordens_servico os
      WHERE os.id = respostas_avaliacao.ordem_servico_id
        AND public.security_is_tenant_manager(os.tenant_id)
    )
  )
  WITH CHECK (
    public.security_is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.ordens_servico os
      WHERE os.id = respostas_avaliacao.ordem_servico_id
        AND public.security_is_tenant_manager(os.tenant_id)
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'permission_groups' AND policyname = 'Authenticated can view groups') THEN
    EXECUTE 'DROP POLICY "Authenticated can view groups" ON public.permission_groups';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'permissoes_tela' AND policyname = 'Admins can view permissoes_tela') THEN
    EXECUTE 'DROP POLICY "Admins can view permissoes_tela" ON public.permissoes_tela';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_group_assignments' AND policyname = 'Users can view own assignments') THEN
    EXECUTE 'DROP POLICY "Users can view own assignments" ON public.user_group_assignments';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_permission_overrides' AND policyname = 'Users can view own overrides') THEN
    EXECUTE 'DROP POLICY "Users can view own overrides" ON public.user_permission_overrides';
  END IF;
END $$;

CREATE POLICY "permission_groups_tenant_select"
  ON public.permission_groups FOR SELECT TO authenticated
  USING (
    public.security_is_platform_admin()
    OR id IN (
      SELECT uga.group_id
      FROM public.user_group_assignments uga
      JOIN public.profiles p ON p.id = uga.profile_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "permissoes_tela_tenant_select"
  ON public.permissoes_tela FOR SELECT TO authenticated
  USING (
    public.security_is_platform_admin()
    OR profile_id = public.security_current_profile_id()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = permissoes_tela.profile_id
        AND public.security_is_tenant_admin(p.tenant_id)
    )
  );

CREATE POLICY "user_group_assignments_tenant_select"
  ON public.user_group_assignments FOR SELECT TO authenticated
  USING (
    public.security_is_platform_admin()
    OR profile_id = public.security_current_profile_id()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = user_group_assignments.profile_id
        AND public.security_is_tenant_admin(p.tenant_id)
    )
  );

CREATE POLICY "user_permission_overrides_tenant_select"
  ON public.user_permission_overrides FOR SELECT TO authenticated
  USING (
    public.security_is_platform_admin()
    OR profile_id = public.security_current_profile_id()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = user_permission_overrides.profile_id
        AND public.security_is_tenant_admin(p.tenant_id)
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'security_profile_tenants' AND policyname = 'security_profile_tenants_admin_manage') THEN
    EXECUTE 'DROP POLICY "security_profile_tenants_admin_manage" ON public.security_profile_tenants';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'security_profile_tenants' AND policyname = 'security_profile_tenants_member_select') THEN
    EXECUTE 'DROP POLICY "security_profile_tenants_member_select" ON public.security_profile_tenants';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'security_tenants' AND policyname = 'security_tenants_admin_manage') THEN
    EXECUTE 'DROP POLICY "security_tenants_admin_manage" ON public.security_tenants';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'security_tenants' AND policyname = 'security_tenants_member_select') THEN
    EXECUTE 'DROP POLICY "security_tenants_member_select" ON public.security_tenants';
  END IF;
END $$;

CREATE POLICY "security_profile_tenants_tenant_select"
  ON public.security_profile_tenants FOR SELECT TO authenticated
  USING (
    public.security_is_platform_admin()
    OR profile_id = public.security_current_profile_id()
    OR public.security_is_tenant_admin(tenant_id)
  );

CREATE POLICY "security_profile_tenants_tenant_manage"
  ON public.security_profile_tenants FOR ALL TO authenticated
  USING (
    public.security_is_platform_admin()
    OR public.security_is_tenant_admin(tenant_id)
  )
  WITH CHECK (
    public.security_is_platform_admin()
    OR public.security_is_tenant_admin(tenant_id)
  );

CREATE POLICY "security_tenants_tenant_select"
  ON public.security_tenants FOR SELECT TO authenticated
  USING (
    public.security_is_platform_admin()
    OR public.security_usuario_tem_tenant_estrito(id)
  );

CREATE POLICY "security_tenants_platform_manage"
  ON public.security_tenants FOR ALL TO authenticated
  USING (public.security_is_platform_admin())
  WITH CHECK (public.security_is_platform_admin());
