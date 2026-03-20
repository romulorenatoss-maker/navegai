
ALTER TABLE public.configuracao_fluxo_leads
ADD COLUMN tempo_exibicao_leads_horas integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.configuracao_fluxo_leads.tempo_exibicao_leads_horas IS 'Tempo em horas que o lead precisa ter desde a última atualização para aparecer nas telas de fila e tarefas do dia';
