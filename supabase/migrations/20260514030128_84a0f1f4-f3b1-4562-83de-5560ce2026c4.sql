ALTER TABLE public.tarefas_pontuacao_config
  ADD COLUMN IF NOT EXISTS aprovador_pacote_padrao jsonb NOT NULL DEFAULT '[]'::jsonb;