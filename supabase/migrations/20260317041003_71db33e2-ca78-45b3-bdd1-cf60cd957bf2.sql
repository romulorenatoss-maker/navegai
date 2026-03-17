
CREATE TABLE public.actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL
);

ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage actions" ON public.actions FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view actions" ON public.actions FOR SELECT TO authenticated USING (true);

CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID REFERENCES public.resources(id),
  action_id UUID REFERENCES public.actions(id),
  scope TEXT DEFAULT 'none'
);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage permissions" ON public.permissions FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated can view permissions" ON public.permissions FOR SELECT TO authenticated USING (true);
