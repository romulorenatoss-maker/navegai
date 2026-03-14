
CREATE TABLE public.checklist_perguntas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  pergunta_id uuid NOT NULL REFERENCES public.perguntas_avaliacao(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (checklist_id, pergunta_id)
);

ALTER TABLE public.checklist_perguntas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage checklist_perguntas" ON public.checklist_perguntas
  FOR ALL TO public USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated can view checklist_perguntas" ON public.checklist_perguntas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Avaliadores can manage checklist_perguntas" ON public.checklist_perguntas
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'avaliador'::app_role) OR is_admin(auth.uid()));
