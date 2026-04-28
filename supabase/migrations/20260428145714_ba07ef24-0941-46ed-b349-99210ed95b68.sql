ALTER TABLE public.respostas_eventos
  ADD CONSTRAINT respostas_eventos_ordem_servico_id_fkey
  FOREIGN KEY (ordem_servico_id)
  REFERENCES public.ordens_servico(id)
  ON DELETE CASCADE;