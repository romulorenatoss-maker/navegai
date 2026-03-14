
-- Add column to track which sector receives the grade from a question
ALTER TABLE public.perguntas_avaliacao 
ADD COLUMN setor_nota_id UUID REFERENCES public.setores(id) ON DELETE SET NULL;

-- Comment for clarity
COMMENT ON COLUMN public.perguntas_avaliacao.setor_nota_id IS 'Setor que recebe a nota desta pergunta (ex: Técnico, Atendimento)';
