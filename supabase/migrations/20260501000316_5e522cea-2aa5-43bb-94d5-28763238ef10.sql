-- =====================================================
-- ETAPA A: Expandir tabela `clientes` (PF/PJ)
-- =====================================================
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS tipo_pessoa text NOT NULL DEFAULT 'PF',
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS razao_social text,
  ADD COLUMN IF NOT EXISTS nome_fantasia text,
  ADD COLUMN IF NOT EXISTS inscricao_estadual text,
  ADD COLUMN IF NOT EXISTS inscricao_municipal text;

-- Validação de tipo_pessoa via trigger (evita CHECK imutável problemático)
CREATE OR REPLACE FUNCTION public.clientes_validate_tipo_pessoa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tipo_pessoa NOT IN ('PF','PJ') THEN
    RAISE EXCEPTION 'tipo_pessoa inválido: % (esperado PF|PJ)', NEW.tipo_pessoa;
  END IF;
  -- Normaliza vazios para NULL
  IF NEW.cnpj IS NOT NULL AND length(trim(NEW.cnpj)) = 0 THEN NEW.cnpj := NULL; END IF;
  IF NEW.cpf IS NOT NULL AND length(trim(NEW.cpf)) = 0 THEN NEW.cpf := NULL; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_validate_tipo_pessoa ON public.clientes;
CREATE TRIGGER trg_clientes_validate_tipo_pessoa
BEFORE INSERT OR UPDATE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.clientes_validate_tipo_pessoa();

-- Índice único parcial para CNPJ (não bloqueia múltiplos NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_cnpj
  ON public.clientes (cnpj) WHERE cnpj IS NOT NULL;

-- =====================================================
-- ETAPA B: Tabela `cliente_responsaveis`
-- (não duplica email/telefone — FK para cliente_contatos)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.cliente_responsaveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  contato_telefone_id uuid REFERENCES public.cliente_contatos(id) ON DELETE SET NULL,
  contato_email_id uuid REFERENCES public.cliente_contatos(id) ON DELETE SET NULL,
  nome text NOT NULL,
  cargo text,
  cpf text,
  principal boolean NOT NULL DEFAULT false,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cliente_responsaveis_cliente
  ON public.cliente_responsaveis(cliente_id);

-- Garante apenas 1 responsável "principal" por cliente
CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_responsaveis_principal
  ON public.cliente_responsaveis(cliente_id)
  WHERE principal = true;

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_cliente_responsaveis_updated_at ON public.cliente_responsaveis;
CREATE TRIGGER trg_cliente_responsaveis_updated_at
BEFORE UPDATE ON public.cliente_responsaveis
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.cliente_responsaveis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view cliente_responsaveis" ON public.cliente_responsaveis;
CREATE POLICY "Authenticated users can view cliente_responsaveis"
ON public.cliente_responsaveis FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert cliente_responsaveis" ON public.cliente_responsaveis;
CREATE POLICY "Authenticated users can insert cliente_responsaveis"
ON public.cliente_responsaveis FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update cliente_responsaveis" ON public.cliente_responsaveis;
CREATE POLICY "Authenticated users can update cliente_responsaveis"
ON public.cliente_responsaveis FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete cliente_responsaveis" ON public.cliente_responsaveis;
CREATE POLICY "Authenticated users can delete cliente_responsaveis"
ON public.cliente_responsaveis FOR DELETE
TO authenticated USING (true);

-- =====================================================
-- ETAPA C: FK responsavel_id em propostas_propostas
-- (necessário pra anexar responsável escolhido na proposta)
-- =====================================================
ALTER TABLE public.propostas_propostas
  ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES public.cliente_responsaveis(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_propostas_responsavel
  ON public.propostas_propostas(responsavel_id);