
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS convertido_por uuid REFERENCES public.profiles(id);

-- Fix existing data: set convertido_por = responsavel_id for all converted leads
UPDATE public.leads 
SET convertido_por = responsavel_id 
WHERE status_lead = 'convertido' AND convertido_por IS NULL AND responsavel_id IS NOT NULL;
