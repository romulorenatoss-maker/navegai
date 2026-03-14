
-- 1. Add new columns to respostas_avaliacao
ALTER TABLE public.respostas_avaliacao 
  ADD COLUMN IF NOT EXISTS ordem_servico_id uuid REFERENCES public.ordens_servico(id),
  ADD COLUMN IF NOT EXISTS avaliador_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS avaliador_setor_id uuid REFERENCES public.setores(id);

-- 2. Migrate existing data: copy ordem_servico_id and avaliador_id from avaliacoes
UPDATE public.respostas_avaliacao r 
SET ordem_servico_id = a.ordem_servico_id,
    avaliador_id = a.avaliador_id
FROM public.avaliacoes a 
WHERE r.avaliacao_id = a.id 
  AND r.ordem_servico_id IS NULL;

-- 3. Make avaliacao_id nullable (responses now primarily linked to OS)
ALTER TABLE public.respostas_avaliacao ALTER COLUMN avaliacao_id DROP NOT NULL;

-- 4. Add unique constraint: one response per question per OS
ALTER TABLE public.respostas_avaliacao 
  ADD CONSTRAINT respostas_os_pergunta_unique UNIQUE (ordem_servico_id, pergunta_id);

-- 5. Drop old unique constraint on (avaliacao_id, pergunta_id) if it exists
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'respostas_avaliacao_avaliacao_id_pergunta_id_key'
  ) THEN
    ALTER TABLE public.respostas_avaliacao DROP CONSTRAINT respostas_avaliacao_avaliacao_id_pergunta_id_key;
  END IF;
END $$;

-- 6. Add RLS policies for new model
-- Allow avaliadores to manage respostas by OS
DROP POLICY IF EXISTS "Avaliador can manage own respostas" ON public.respostas_avaliacao;
CREATE POLICY "Avaliador can manage own respostas" ON public.respostas_avaliacao
  FOR ALL TO authenticated
  USING (
    avaliador_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR ordem_servico_id IN (
      SELECT a.ordem_servico_id FROM public.avaliacoes a 
      JOIN public.profiles p ON p.id = a.avaliador_id AND p.user_id = auth.uid()
    )
  );

-- Allow viewing all responses on same OS (for cross-sector visibility)
DROP POLICY IF EXISTS "Avaliadores can view respostas on same OS" ON public.respostas_avaliacao;
CREATE POLICY "Avaliadores can view respostas on same OS" ON public.respostas_avaliacao
  FOR SELECT TO authenticated
  USING (
    ordem_servico_id IN (
      SELECT a.ordem_servico_id FROM public.avaliacoes a
      JOIN public.profiles p ON p.id = a.avaliador_id AND p.user_id = auth.uid()
    )
  );

-- Allow inserting with os_id
DROP POLICY IF EXISTS "Avaliadores can insert respostas" ON public.respostas_avaliacao;
CREATE POLICY "Avaliadores can insert respostas" ON public.respostas_avaliacao
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'avaliador') OR is_admin(auth.uid())
  );
