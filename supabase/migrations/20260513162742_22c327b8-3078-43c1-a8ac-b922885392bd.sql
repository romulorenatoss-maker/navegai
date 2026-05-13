ALTER TABLE public.setores
ADD COLUMN IF NOT EXISTS responsavel_padrao_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_setores_responsavel_padrao_id ON public.setores(responsavel_padrao_id);