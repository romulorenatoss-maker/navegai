
-- =============================================
-- NEXUS OPS — Schema Completo (Módulos 1 e 2)
-- =============================================

-- 1. Enum de roles
CREATE TYPE public.app_role AS ENUM ('admin', 'avaliador', 'executor', 'gestor');

-- 2. Tabela de roles (separada, conforme boas práticas)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Security definer function para checar roles (evita recursão RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Helper: checar se é admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- 4. Função update_updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =============================================
-- MÓDULO 1 — CADASTROS
-- =============================================

-- 5. Setores
CREATE TABLE public.setores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.setores ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_setores_updated_at
  BEFORE UPDATE ON public.setores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Profiles (avaliadores + colaboradores usam auth.users + profile)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  setor_id UUID REFERENCES public.setores(id),
  cargo TEXT, -- 'atendente', 'tecnico', 'executor', 'avaliador'
  ativo BOOLEAN NOT NULL DEFAULT true,
  -- Permissões de avaliador
  pode_editar_avaliacoes BOOLEAN NOT NULL DEFAULT false,
  pode_excluir_avaliacoes BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para criar profile automaticamente no signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Tipos de Serviço
CREATE TABLE public.tipos_servico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  setor_id UUID REFERENCES public.setores(id),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tipos_servico ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_tipos_servico_updated_at
  BEFORE UPDATE ON public.tipos_servico
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- MÓDULO 2 — PERGUNTAS DE AVALIAÇÃO
-- =============================================

-- 8. Perguntas
CREATE TABLE public.perguntas_avaliacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pergunta TEXT NOT NULL,
  tipo_servico_id UUID REFERENCES public.tipos_servico(id),
  avaliador_id UUID REFERENCES public.profiles(id),
  tipo_avaliado TEXT NOT NULL DEFAULT 'atendente' CHECK (tipo_avaliado IN ('atendente', 'tecnico')),
  peso INTEGER NOT NULL DEFAULT 1 CHECK (peso >= 1 AND peso <= 10),
  ordem INTEGER NOT NULL DEFAULT 0,
  correlacao_pergunta_id UUID REFERENCES public.perguntas_avaliacao(id),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.perguntas_avaliacao ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_perguntas_avaliacao_updated_at
  BEFORE UPDATE ON public.perguntas_avaliacao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- AUDITORIA (Módulo 9 — base)
-- =============================================

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  acao TEXT NOT NULL,
  tabela TEXT NOT NULL,
  registro_id UUID,
  dados_anteriores JSONB,
  dados_novos JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES
-- =============================================

-- user_roles: admin pode tudo, usuários veem seus próprios roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL USING (public.is_admin(auth.uid()));

-- setores: todos autenticados leem, admin gerencia
CREATE POLICY "Authenticated users can view setores" ON public.setores
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage setores" ON public.setores
  FOR ALL USING (public.is_admin(auth.uid()));

-- profiles: todos autenticados leem, admin gerencia, usuário edita o próprio
CREATE POLICY "Authenticated users can view profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage profiles" ON public.profiles
  FOR ALL USING (public.is_admin(auth.uid()));

-- tipos_servico: todos autenticados leem, admin gerencia
CREATE POLICY "Authenticated users can view tipos_servico" ON public.tipos_servico
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage tipos_servico" ON public.tipos_servico
  FOR ALL USING (public.is_admin(auth.uid()));

-- perguntas_avaliacao: todos autenticados leem, admin gerencia
CREATE POLICY "Authenticated users can view perguntas" ON public.perguntas_avaliacao
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage perguntas" ON public.perguntas_avaliacao
  FOR ALL USING (public.is_admin(auth.uid()));

-- audit_logs: admin pode ler, sistema insere
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "System can insert audit logs" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- =============================================
-- Storage bucket para evidências
-- =============================================

INSERT INTO storage.buckets (id, name, public) VALUES ('evidencias', 'evidencias', true);

CREATE POLICY "Authenticated users can upload evidencias" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'evidencias');
CREATE POLICY "Authenticated users can view evidencias" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'evidencias');
