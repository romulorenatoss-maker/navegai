ALTER TABLE public.configuracao_fluxo_leads 
ADD COLUMN tempo_expiracao_captura_segundos integer NOT NULL DEFAULT 120;