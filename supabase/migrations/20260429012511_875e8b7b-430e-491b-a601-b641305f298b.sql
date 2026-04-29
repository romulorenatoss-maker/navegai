ALTER TABLE public.propostas_produtos
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS revisado boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'propostas_produtos_origem_check'
  ) THEN
    ALTER TABLE public.propostas_produtos
      ADD CONSTRAINT propostas_produtos_origem_check
      CHECK (origem IN ('manual','ia_sugerido'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_propostas_produtos_revisado
  ON public.propostas_produtos (revisado) WHERE revisado = false;