ALTER TABLE public.operational_templates
  ADD COLUMN IF NOT EXISTS prazo_plano_acao_padrao_horas integer DEFAULT 24;

ALTER TABLE public.operational_approval_answers
  ADD COLUMN IF NOT EXISTS conforme boolean,
  ADD COLUMN IF NOT EXISTS plano_acao_descricao text,
  ADD COLUMN IF NOT EXISTS plano_acao_prazo timestamptz,
  ADD COLUMN IF NOT EXISTS plano_acao_anexo_url text,
  ADD COLUMN IF NOT EXISTS prazo_padrao_aplicado timestamptz,
  ADD COLUMN IF NOT EXISTS flag_prazo_alterado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS justificativa_alteracao_prazo text,
  ADD COLUMN IF NOT EXISTS resolvido_em timestamptz,
  ADD COLUMN IF NOT EXISTS resolucao_atrasada boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS justificativa_atraso text,
  ADD COLUMN IF NOT EXISTS justificativa_atraso_anexo_url text;

ALTER TABLE public.operational_assignments
  ADD COLUMN IF NOT EXISTS flag_atraso_plano_acao boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_reincidencia_atraso boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_sla_etapa_estourado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS justificativa_sla_etapa text,
  ADD COLUMN IF NOT EXISTS justificativa_sla_etapa_anexo_url text;