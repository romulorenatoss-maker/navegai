
-- Add reservation columns to leads table
ALTER TABLE public.leads ADD COLUMN reserved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN reserved_at timestamp with time zone;
