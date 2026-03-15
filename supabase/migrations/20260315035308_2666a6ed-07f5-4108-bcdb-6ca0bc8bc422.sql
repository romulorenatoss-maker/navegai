
-- ═══════════════════════════════════════════════════════════
-- PERFORMANCE INDEXES - Most used filter/join columns
-- ═══════════════════════════════════════════════════════════

-- ordens_servico: heavily filtered by status, data_abertura, numero_os, cliente_id
CREATE INDEX IF NOT EXISTS idx_os_status ON public.ordens_servico (status);
CREATE INDEX IF NOT EXISTS idx_os_data_abertura ON public.ordens_servico (data_abertura DESC);
CREATE INDEX IF NOT EXISTS idx_os_numero_os ON public.ordens_servico (numero_os);
CREATE INDEX IF NOT EXISTS idx_os_cliente_id ON public.ordens_servico (cliente_id);
CREATE INDEX IF NOT EXISTS idx_os_tipo_servico_id ON public.ordens_servico (tipo_servico_id);
CREATE INDEX IF NOT EXISTS idx_os_atendente_id ON public.ordens_servico (atendente_id);
CREATE INDEX IF NOT EXISTS idx_os_tecnico_id ON public.ordens_servico (tecnico_id);
CREATE INDEX IF NOT EXISTS idx_os_status_data ON public.ordens_servico (status, data_abertura DESC);

-- avaliacoes: joined by ordem_servico_id, filtered by avaliador_id, concluida
CREATE INDEX IF NOT EXISTS idx_aval_os_id ON public.avaliacoes (ordem_servico_id);
CREATE INDEX IF NOT EXISTS idx_aval_avaliador_id ON public.avaliacoes (avaliador_id);
CREATE INDEX IF NOT EXISTS idx_aval_concluida ON public.avaliacoes (concluida);
CREATE INDEX IF NOT EXISTS idx_aval_os_avaliador ON public.avaliacoes (ordem_servico_id, avaliador_id);

-- respostas_avaliacao: heavily queried by ordem_servico_id, pergunta_id, avaliacao_id
CREATE INDEX IF NOT EXISTS idx_resp_os_id ON public.respostas_avaliacao (ordem_servico_id);
CREATE INDEX IF NOT EXISTS idx_resp_avaliacao_id ON public.respostas_avaliacao (avaliacao_id);
CREATE INDEX IF NOT EXISTS idx_resp_pergunta_id ON public.respostas_avaliacao (pergunta_id);
CREATE INDEX IF NOT EXISTS idx_resp_avaliador_id ON public.respostas_avaliacao (avaliador_id);
CREATE INDEX IF NOT EXISTS idx_resp_os_pergunta ON public.respostas_avaliacao (ordem_servico_id, pergunta_id);

-- os_perguntas: always joined by os_id
CREATE INDEX IF NOT EXISTS idx_osp_os_id ON public.os_perguntas (os_id);
CREATE INDEX IF NOT EXISTS idx_osp_pergunta_id ON public.os_perguntas (pergunta_id);

-- perguntas_avaliacao: filtered by ativo, tipo_servico_id, checklist_id, setor_avaliado_id
CREATE INDEX IF NOT EXISTS idx_perg_ativo ON public.perguntas_avaliacao (ativo);
CREATE INDEX IF NOT EXISTS idx_perg_tipo_servico ON public.perguntas_avaliacao (tipo_servico_id);
CREATE INDEX IF NOT EXISTS idx_perg_checklist ON public.perguntas_avaliacao (checklist_id);
CREATE INDEX IF NOT EXISTS idx_perg_setor_avaliado ON public.perguntas_avaliacao (setor_avaliado_id);

-- profiles: filtered by user_id, ativo, setor_id
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_ativo ON public.profiles (ativo);
CREATE INDEX IF NOT EXISTS idx_profiles_setor_id ON public.profiles (setor_id);

-- colaborador_setores: joined by profile_id, setor_id
CREATE INDEX IF NOT EXISTS idx_colset_profile_id ON public.colaborador_setores (profile_id);
CREATE INDEX IF NOT EXISTS idx_colset_setor_id ON public.colaborador_setores (setor_id);

-- clientes: searched by cpf
CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON public.clientes (cpf);

-- permissoes_tela: filtered by profile_id
CREATE INDEX IF NOT EXISTS idx_perm_profile_id ON public.permissoes_tela (profile_id);

-- user_roles: filtered by user_id
CREATE INDEX IF NOT EXISTS idx_userroles_user_id ON public.user_roles (user_id);

-- sessoes_usuario: filtered by user_id, profile_id
CREATE INDEX IF NOT EXISTS idx_sessoes_user_id ON public.sessoes_usuario (user_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_profile_id ON public.sessoes_usuario (profile_id);
