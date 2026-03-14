
-- Table to store screen permissions per profile
CREATE TABLE public.permissoes_tela (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tela_path text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (profile_id, tela_path)
);

ALTER TABLE public.permissoes_tela ENABLE ROW LEVEL SECURITY;

-- Admins can manage all permissions
CREATE POLICY "Admins can manage permissoes_tela" ON public.permissoes_tela
  FOR ALL TO public
  USING (is_admin(auth.uid()));

-- Users can view their own permissions
CREATE POLICY "Users can view own permissoes_tela" ON public.permissoes_tela
  FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
