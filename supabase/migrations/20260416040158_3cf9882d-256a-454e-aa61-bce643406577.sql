ALTER TABLE public.operational_contingencies DROP CONSTRAINT IF EXISTS operational_contingencies_status_check;

ALTER TABLE public.operational_contingencies ADD CONSTRAINT operational_contingencies_status_check CHECK (status IN ('aberta', 'em_andamento', 'resolvida', 'validada', 'descartada'));