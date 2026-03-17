
-- Remove cep column from bairros (no longer needed)
ALTER TABLE public.bairros DROP COLUMN IF EXISTS cep;

-- Change rua cep from single text to array of texts to support multiple CEPs
ALTER TABLE public.ruas ALTER COLUMN cep TYPE text[] USING CASE WHEN cep IS NOT NULL THEN ARRAY[cep] ELSE NULL END;
