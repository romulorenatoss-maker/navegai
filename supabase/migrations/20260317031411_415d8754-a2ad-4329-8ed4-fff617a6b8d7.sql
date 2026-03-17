
-- Add column to track if evaluator has seen the notification
ALTER TABLE public.leads ADD COLUMN notificacao_vista boolean NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN notificacao_vista_em timestamp with time zone;
ALTER TABLE public.leads ADD COLUMN notificacao_vista_por uuid;
