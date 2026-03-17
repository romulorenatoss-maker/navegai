
CREATE TABLE public.resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL
);

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage resources"
ON public.resources FOR ALL
USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated can view resources"
ON public.resources FOR SELECT TO authenticated
USING (true);
