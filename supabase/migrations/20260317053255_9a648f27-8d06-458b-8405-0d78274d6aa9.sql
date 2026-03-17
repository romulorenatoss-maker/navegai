-- Add fora_do_prazo column to track whether a task was completed on time or late
ALTER TABLE public.lead_tarefas_contato ADD COLUMN fora_do_prazo boolean NOT NULL DEFAULT false;