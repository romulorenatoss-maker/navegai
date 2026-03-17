
-- ============================================
-- SISTEMA DE PERMISSÕES RBAC COMPLETO
-- ============================================

-- 1. Resources (módulos do sistema)
CREATE TABLE public.permission_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  module text NOT NULL,
  path text, -- rota associada (para compatibilidade com sidebar)
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.permission_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view resources" ON public.permission_resources
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage resources" ON public.permission_resources
  FOR ALL USING (public.is_admin(auth.uid()));

-- 2. Permission Groups (grupos customizáveis)
CREATE TABLE public.permission_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.permission_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view groups" ON public.permission_groups
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage groups" ON public.permission_groups
  FOR ALL USING (public.is_admin(auth.uid()));

-- 3. Group Permissions (ações por resource por grupo)
CREATE TABLE public.group_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.permission_groups(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.permission_resources(id) ON DELETE CASCADE,
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, resource_id)
);

ALTER TABLE public.group_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view group_permissions" ON public.group_permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage group_permissions" ON public.group_permissions
  FOR ALL USING (public.is_admin(auth.uid()));

-- 4. User → Group assignments
CREATE TABLE public.user_group_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.permission_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, group_id)
);

ALTER TABLE public.user_group_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assignments" ON public.user_group_assignments
  FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage assignments" ON public.user_group_assignments
  FOR ALL USING (public.is_admin(auth.uid()));

-- 5. User Permission Overrides (null = herdar do grupo)
CREATE TABLE public.user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.permission_resources(id) ON DELETE CASCADE,
  can_view boolean,
  can_create boolean,
  can_edit boolean,
  can_delete boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, resource_id)
);

ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own overrides" ON public.user_permission_overrides
  FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage overrides" ON public.user_permission_overrides
  FOR ALL USING (public.is_admin(auth.uid()));

-- ============================================
-- SEED: Resources (todos os módulos do sistema)
-- ============================================
INSERT INTO public.permission_resources (code, label, module, path) VALUES
  ('dashboard_os', 'Dashboard OS', 'Principal', '/'),
  ('dashboard_leads', 'Dashboard de Leads', 'Principal', '/leads/dashboard'),
  ('os_pesquisa', 'Criar OS / Buscar', 'Avaliações', '/avaliacoes/pesquisa'),
  ('minhas_avaliacoes', 'Minhas Avaliações', 'Avaliações', '/avaliacoes/minhas'),
  ('meus_leads', 'Meus Leads', 'Avaliações', '/leads'),
  ('checklists_cadastro', 'Cadastro de Checklists', 'Checklists', '/checklists/cadastro'),
  ('checklists_execucao', 'Execução', 'Checklists', '/checklists/execucao'),
  ('checklists_gestao', 'Gestão', 'Checklists', '/checklists/gestao'),
  ('setores', 'Setores', 'Cadastros', '/cadastros/setores'),
  ('tipos_servico', 'Tipos de Serviço', 'Cadastros', '/cadastros/servicos'),
  ('perguntas', 'Perguntas', 'Cadastros', '/avaliacoes/perguntas'),
  ('objecoes', 'Objeções', 'Cadastros', '/leads/objecoes'),
  ('clientes', 'Clientes', 'Cadastros', '/cadastros/clientes'),
  ('enderecos', 'Endereços', 'Cadastros', '/cadastros/enderecos'),
  ('gerenciador_leads', 'Gerenciador de Leads', 'Leads', '/leads/fila'),
  ('leads_arquivados', 'Leads Arquivados', 'Leads', '/leads/arquivados'),
  ('importador_leads', 'Importador de Leads', 'Leads', '/leads/importador'),
  ('colaboradores', 'Colaboradores', 'Configurações', '/cadastros/colaboradores'),
  ('rotina_tentativas', 'Rotina de Tentativas', 'Configurações', '/leads/rotina'),
  ('relatorios_os', 'Relatórios de OS', 'Relatórios Gerais', '/relatorios'),
  ('relatorios_leads', 'Relatórios de Leads', 'Relatórios Gerais', '/leads/relatorios'),
  ('desempenho', 'Desempenho', 'Relatórios Gerais', '/desempenho'),
  ('auditoria', 'Auditoria', 'Relatórios Gerais', '/auditoria'),
  ('configuracoes', 'Configurações', 'Relatórios Gerais', '/configuracoes');

-- ============================================
-- SEED: Default permission groups
-- ============================================
INSERT INTO public.permission_groups (name, description, is_system) VALUES
  ('Administrador', 'Acesso total ao sistema', true),
  ('Avaliador', 'Realiza avaliações de OS e gestão de leads', true),
  ('Avaliado', 'Visualiza próprio desempenho e avaliações', true);

-- ============================================
-- SEED: Group permissions
-- Administrador = tudo
-- Avaliador = visão + criação/edição na maioria
-- Avaliado = apenas visualização limitada
-- ============================================

-- Administrador: CRUD total em todos os resources
INSERT INTO public.group_permissions (group_id, resource_id, can_view, can_create, can_edit, can_delete)
SELECT g.id, r.id, true, true, true, true
FROM public.permission_groups g, public.permission_resources r
WHERE g.name = 'Administrador';

-- Avaliador: ver + criar + editar na maioria, sem excluir
INSERT INTO public.group_permissions (group_id, resource_id, can_view, can_create, can_edit, can_delete)
SELECT g.id, r.id,
  true,
  r.code NOT IN ('auditoria', 'configuracoes', 'desempenho', 'relatorios_os', 'relatorios_leads', 'dashboard_os', 'dashboard_leads'),
  r.code NOT IN ('auditoria', 'configuracoes', 'desempenho', 'relatorios_os', 'relatorios_leads', 'dashboard_os', 'dashboard_leads', 'colaboradores'),
  false
FROM public.permission_groups g, public.permission_resources r
WHERE g.name = 'Avaliador';

-- Avaliado: apenas visualização de telas específicas
INSERT INTO public.group_permissions (group_id, resource_id, can_view, can_create, can_edit, can_delete)
SELECT g.id, r.id,
  r.code IN ('minhas_avaliacoes', 'desempenho', 'meus_leads'),
  false,
  r.code IN ('meus_leads'),
  false
FROM public.permission_groups g, public.permission_resources r
WHERE g.name = 'Avaliado';

-- ============================================
-- Function: get effective permissions for a user
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_effective_permissions(_profile_id uuid)
RETURNS TABLE (
  resource_code text,
  resource_path text,
  can_view boolean,
  can_create boolean,
  can_edit boolean,
  can_delete boolean
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
    COALESCE(o.can_delete, MAX(gp.can_delete::int)::boolean, false) AS can_delete
  FROM permission_resources r
  LEFT JOIN group_permissions gp ON gp.resource_id = r.id
    AND gp.group_id IN (SELECT group_id FROM user_group_assignments WHERE profile_id = _profile_id)
  LEFT JOIN user_permission_overrides o ON o.resource_id = r.id AND o.profile_id = _profile_id
  GROUP BY r.code, r.path, o.can_view, o.can_create, o.can_edit, o.can_delete;
$$;
