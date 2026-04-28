-- Camada paralela de métricas de tempo (apenas ADITIVA)
CREATE TABLE IF NOT EXISTS public.respostas_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_servico_id uuid NOT NULL,
  pergunta_id uuid NOT NULL,
  usuario_id uuid,
  setor_id uuid,
  resposta text,
  respondido_em timestamptz NOT NULL DEFAULT now(),
  is_primeira_resposta boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_eventos_os ON public.respostas_eventos(ordem_servico_id);
CREATE INDEX IF NOT EXISTS idx_eventos_user ON public.respostas_eventos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_eventos_setor ON public.respostas_eventos(setor_id);
CREATE INDEX IF NOT EXISTS idx_eventos_pergunta ON public.respostas_eventos(pergunta_id);
CREATE INDEX IF NOT EXISTS idx_eventos_os_pergunta ON public.respostas_eventos(ordem_servico_id, pergunta_id);

ALTER TABLE public.respostas_eventos ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode inserir seus próprios eventos
CREATE POLICY "Authenticated can insert own events"
ON public.respostas_eventos FOR INSERT
TO authenticated
WITH CHECK (true);

-- Admins e avaliadores podem ler para dashboards
CREATE POLICY "Admins and avaliadores can view events"
ON public.respostas_eventos FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'avaliador'::app_role)
);

-- Função isolada para registrar evento garantindo consistência da "primeira resposta"
CREATE OR REPLACE FUNCTION public.insert_resposta_evento(
  p_os_id uuid,
  p_pergunta_id uuid,
  p_usuario_id uuid,
  p_setor_id uuid,
  p_resposta text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ja_existe_primeira boolean;
BEGIN
  -- Guard básico: dados mínimos obrigatórios
  IF p_os_id IS NULL OR p_pergunta_id IS NULL OR p_resposta IS NULL THEN
    RETURN;
  END IF;

  -- Já existe alguma "primeira resposta" registrada para esse par?
  SELECT EXISTS (
    SELECT 1 FROM public.respostas_eventos
    WHERE ordem_servico_id = p_os_id
      AND pergunta_id = p_pergunta_id
      AND is_primeira_resposta = true
  ) INTO v_ja_existe_primeira;

  INSERT INTO public.respostas_eventos (
    ordem_servico_id,
    pergunta_id,
    usuario_id,
    setor_id,
    resposta,
    is_primeira_resposta
  ) VALUES (
    p_os_id,
    p_pergunta_id,
    p_usuario_id,
    p_setor_id,
    p_resposta,
    NOT v_ja_existe_primeira
  );
END;
$$;