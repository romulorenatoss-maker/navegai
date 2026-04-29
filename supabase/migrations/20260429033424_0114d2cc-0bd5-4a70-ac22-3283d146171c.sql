ALTER TABLE public.propostas_rascunhos_conversa
  ADD COLUMN IF NOT EXISTS estado_proposta jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.propostas_rascunhos_conversa.estado_proposta IS
  'Fonte única do estado da conversa: { etapa_atual, itens[], perguntas_respondidas[], totais }. Enviado para a IA a cada turno.';