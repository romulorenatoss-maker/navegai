
-- Indexes for relatórios filter optimization
CREATE INDEX IF NOT EXISTS idx_ordens_servico_data_abertura ON public.ordens_servico (data_abertura);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_status ON public.ordens_servico (status);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_cliente_id ON public.ordens_servico (cliente_id);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_atendente_id ON public.ordens_servico (atendente_id);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_tecnico_id ON public.ordens_servico (tecnico_id);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_colaborador_avaliado_id ON public.ordens_servico (colaborador_avaliado_id);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_tipo_servico_id ON public.ordens_servico (tipo_servico_id);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_numero_os ON public.ordens_servico (numero_os);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_ordem_servico_id ON public.avaliacoes (ordem_servico_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_avaliador_id ON public.avaliacoes (avaliador_id);
