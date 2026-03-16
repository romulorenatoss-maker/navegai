
-- Add scheduled return column to leads for priority queue scheduling
ALTER TABLE public.leads ADD COLUMN agendamento_retorno timestamp with time zone DEFAULT NULL;

-- Index for sorting by scheduled return
CREATE INDEX idx_leads_agendamento_retorno ON public.leads (agendamento_retorno) WHERE agendamento_retorno IS NOT NULL;
