
-- Create campanhas (campaigns) table
CREATE TABLE public.campanhas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can manage campanhas"
  ON public.campanhas FOR ALL
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated can view campanhas"
  ON public.campanhas FOR SELECT TO authenticated
  USING (true);

-- Add campaign_id to leads table
ALTER TABLE public.leads ADD COLUMN campanha_id UUID REFERENCES public.campanhas(id) ON DELETE SET NULL DEFAULT NULL;

-- Trigger for updated_at
CREATE TRIGGER update_campanhas_updated_at
  BEFORE UPDATE ON public.campanhas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
