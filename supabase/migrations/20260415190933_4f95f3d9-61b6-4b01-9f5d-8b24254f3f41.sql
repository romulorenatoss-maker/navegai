
CREATE TABLE public.operational_approval_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.operational_template_fields(id) ON DELETE CASCADE,
  resposta TEXT NOT NULL DEFAULT 'conforme',
  observacao TEXT,
  peso NUMERIC NOT NULL DEFAULT 1,
  respondido_por UUID NOT NULL REFERENCES public.profiles(id),
  respondido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, field_id)
);

ALTER TABLE public.operational_approval_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage operational_approval_answers"
  ON public.operational_approval_answers FOR ALL
  TO public USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated can view operational_approval_answers"
  ON public.operational_approval_answers FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Aprovador can insert approval answers"
  ON public.operational_approval_answers FOR INSERT
  TO authenticated
  WITH CHECK (
    respondido_por IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR is_admin(auth.uid())
  );

CREATE POLICY "Aprovador can update own approval answers"
  ON public.operational_approval_answers FOR UPDATE
  TO authenticated
  USING (
    respondido_por IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR is_admin(auth.uid())
  );
