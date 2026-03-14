
CREATE TABLE public.sessoes_usuario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  login_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  logout_at TIMESTAMP WITH TIME ZONE,
  logout_reason TEXT DEFAULT 'manual',
  duracao_segundos INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sessoes_usuario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sessoes" ON public.sessoes_usuario
  FOR ALL TO public USING (is_admin(auth.uid()));

CREATE POLICY "Users can insert own sessoes" ON public.sessoes_usuario
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessoes" ON public.sessoes_usuario
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can view own sessoes" ON public.sessoes_usuario
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE INDEX idx_sessoes_usuario_user_id ON public.sessoes_usuario(user_id);
CREATE INDEX idx_sessoes_usuario_profile_id ON public.sessoes_usuario(profile_id);
