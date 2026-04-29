-- Etapa 3 — Fluxo sequencial da proposta (não altera tabelas existentes)
CREATE TABLE IF NOT EXISTS public.propostas_fluxo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  tipo text NOT NULL,         -- 'pergunta' | 'bloco'
  referencia text NOT NULL,   -- pergunta: campo_token | bloco: categoria
  label text,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fluxo_template_ordem
  ON public.propostas_fluxo (template_id, ordem);

-- Validação leve (idempotente)
CREATE OR REPLACE FUNCTION public.propostas_fluxo_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tipo NOT IN ('pergunta','bloco') THEN
    RAISE EXCEPTION 'tipo inválido em propostas_fluxo: % (esperado pergunta|bloco)', NEW.tipo;
  END IF;
  IF NEW.referencia IS NULL OR length(trim(NEW.referencia)) = 0 THEN
    RAISE EXCEPTION 'referencia é obrigatória em propostas_fluxo';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propostas_fluxo_validate ON public.propostas_fluxo;
CREATE TRIGGER trg_propostas_fluxo_validate
BEFORE INSERT OR UPDATE ON public.propostas_fluxo
FOR EACH ROW EXECUTE FUNCTION public.propostas_fluxo_validate();

-- RLS: mesmo padrão de acesso usado pelo módulo propostas
ALTER TABLE public.propostas_fluxo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "propostas_fluxo_select" ON public.propostas_fluxo;
CREATE POLICY "propostas_fluxo_select"
ON public.propostas_fluxo FOR SELECT
TO authenticated
USING (public.propostas_user_has_access(auth.uid()));

DROP POLICY IF EXISTS "propostas_fluxo_insert" ON public.propostas_fluxo;
CREATE POLICY "propostas_fluxo_insert"
ON public.propostas_fluxo FOR INSERT
TO authenticated
WITH CHECK (public.propostas_user_has_access(auth.uid()));

DROP POLICY IF EXISTS "propostas_fluxo_update" ON public.propostas_fluxo;
CREATE POLICY "propostas_fluxo_update"
ON public.propostas_fluxo FOR UPDATE
TO authenticated
USING (public.propostas_user_has_access(auth.uid()))
WITH CHECK (public.propostas_user_has_access(auth.uid()));

DROP POLICY IF EXISTS "propostas_fluxo_delete" ON public.propostas_fluxo;
CREATE POLICY "propostas_fluxo_delete"
ON public.propostas_fluxo FOR DELETE
TO authenticated
USING (public.propostas_user_has_access(auth.uid()));