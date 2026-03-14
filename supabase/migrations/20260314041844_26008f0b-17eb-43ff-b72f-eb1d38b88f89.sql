
-- Recurrence type enum
CREATE TYPE public.recorrencia_tipo AS ENUM ('diaria', 'semanal', 'mensal', 'personalizada');

-- Checklists table
CREATE TABLE public.checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  tipo_servico_id uuid REFERENCES public.tipos_servico(id) ON DELETE SET NULL,
  setor_id uuid REFERENCES public.setores(id) ON DELETE SET NULL,
  recorrencia recorrencia_tipo NOT NULL DEFAULT 'diaria',
  recorrencia_dias integer[] DEFAULT '{}',
  prazo_horas integer DEFAULT 24,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Checklist items table
CREATE TABLE public.checklist_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  obrigatorio boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_itens ENABLE ROW LEVEL SECURITY;

-- RLS: Admins can manage
CREATE POLICY "Admins can manage checklists" ON public.checklists FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Admins can manage checklist_itens" ON public.checklist_itens FOR ALL USING (is_admin(auth.uid()));

-- RLS: Authenticated can view
CREATE POLICY "Authenticated can view checklists" ON public.checklists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can view checklist_itens" ON public.checklist_itens FOR SELECT TO authenticated USING (true);

-- Updated_at triggers
CREATE TRIGGER update_checklists_updated_at BEFORE UPDATE ON public.checklists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
