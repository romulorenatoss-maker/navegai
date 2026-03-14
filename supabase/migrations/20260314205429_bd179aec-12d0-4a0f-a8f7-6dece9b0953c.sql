
-- Indexes for fast filtering on ordens_servico
CREATE INDEX IF NOT EXISTS idx_ordens_servico_status ON public.ordens_servico(status);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_created_at ON public.ordens_servico(created_at);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_tipo_servico_id ON public.ordens_servico(tipo_servico_id);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_cliente_nome ON public.ordens_servico(cliente_nome);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_colaborador_avaliado_id ON public.ordens_servico(colaborador_avaliado_id);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_atendente_id ON public.ordens_servico(atendente_id);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_tecnico_id ON public.ordens_servico(tecnico_id);

-- Indexes for avaliacoes
CREATE INDEX IF NOT EXISTS idx_avaliacoes_ordem_servico_id ON public.avaliacoes(ordem_servico_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_avaliador_id ON public.avaliacoes(avaliador_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_concluida ON public.avaliacoes(concluida);

-- Indexes for respostas
CREATE INDEX IF NOT EXISTS idx_respostas_ordem_servico_id ON public.respostas_avaliacao(ordem_servico_id);
CREATE INDEX IF NOT EXISTS idx_respostas_pergunta_id ON public.respostas_avaliacao(pergunta_id);
