CREATE TABLE IF NOT EXISTS public.tarefas_pontuacao_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true,
  penalidade_fora_prazo integer NOT NULL DEFAULT 20,
  penalidade_contingencia integer NOT NULL DEFAULT 10,
  penalidade_sla_contingencia integer NOT NULL DEFAULT 15,
  nota_minima integer NOT NULL DEFAULT 0,
  nota_maxima integer NOT NULL DEFAULT 100,
  penalidade_reprovacao integer NOT NULL DEFAULT 100,
  pontuacao_automatica_padrao boolean NOT NULL DEFAULT true,
  descricao text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tarefas_pontuacao_config_singleton_uniq UNIQUE (singleton)
);

ALTER TABLE public.tarefas_pontuacao_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pontuacao config"
ON public.tarefas_pontuacao_config FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can insert pontuacao config"
ON public.tarefas_pontuacao_config FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update pontuacao config"
ON public.tarefas_pontuacao_config FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_tarefas_pontuacao_config_updated_at
BEFORE UPDATE ON public.tarefas_pontuacao_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.tarefas_pontuacao_config (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;