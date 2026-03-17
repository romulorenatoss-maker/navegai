ALTER TABLE public.configuracao_fluxo_leads
ADD COLUMN tipo_servico_conversao_id uuid REFERENCES public.tipos_servico(id) ON DELETE SET NULL DEFAULT NULL;