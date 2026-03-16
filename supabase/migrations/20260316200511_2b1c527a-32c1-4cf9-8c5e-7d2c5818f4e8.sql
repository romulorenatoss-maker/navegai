
-- Add 'aguardando_numero' to os_status enum
ALTER TYPE public.os_status ADD VALUE IF NOT EXISTS 'aguardando_numero';

-- Make numero_os nullable for OS created from lead conversion (aguardando_numero)
ALTER TABLE public.ordens_servico ALTER COLUMN numero_os DROP NOT NULL;
