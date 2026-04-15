
-- Create sequence for task numbers
CREATE SEQUENCE IF NOT EXISTS operational_assignment_numero_seq START WITH 1 INCREMENT BY 1;

-- Add numero_tarefa column
ALTER TABLE public.operational_assignments
ADD COLUMN numero_tarefa integer NOT NULL DEFAULT nextval('operational_assignment_numero_seq');

-- Create unique index
CREATE UNIQUE INDEX idx_operational_assignments_numero_tarefa ON public.operational_assignments(numero_tarefa);

-- Backfill existing rows that got default values - they already have values from the sequence, so nothing extra needed
