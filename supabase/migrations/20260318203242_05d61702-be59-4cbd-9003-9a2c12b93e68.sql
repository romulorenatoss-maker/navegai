
ALTER TABLE public.lead_historico
ADD COLUMN ciencia_em timestamp with time zone DEFAULT NULL,
ADD COLUMN ciencia_por uuid DEFAULT NULL;
