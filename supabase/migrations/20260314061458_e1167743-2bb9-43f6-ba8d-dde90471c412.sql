ALTER TABLE public.perguntas_avaliacao 
ADD COLUMN setor_avaliado_id uuid REFERENCES public.setores(id) ON DELETE SET NULL;