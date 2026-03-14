
-- Add checklist_id to perguntas_avaliacao
ALTER TABLE public.perguntas_avaliacao 
ADD COLUMN checklist_id uuid REFERENCES public.checklists(id) ON DELETE SET NULL;

-- Add checklist_id to tipos_servico
ALTER TABLE public.tipos_servico 
ADD COLUMN checklist_id uuid REFERENCES public.checklists(id) ON DELETE SET NULL;
