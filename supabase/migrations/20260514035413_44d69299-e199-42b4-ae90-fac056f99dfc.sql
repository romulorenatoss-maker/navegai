ALTER TABLE public.tarefas_pontuacao_config
ADD COLUMN IF NOT EXISTS validador_pacote_padrao jsonb NOT NULL DEFAULT '[]'::jsonb;