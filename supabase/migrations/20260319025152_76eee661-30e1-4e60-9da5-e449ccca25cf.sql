
ALTER TABLE public.respostas_avaliacao
  DROP CONSTRAINT respostas_avaliacao_ordem_servico_id_fkey,
  ADD CONSTRAINT respostas_avaliacao_ordem_servico_id_fkey
    FOREIGN KEY (ordem_servico_id) REFERENCES public.ordens_servico(id) ON DELETE CASCADE;
