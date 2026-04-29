-- Tabela de rascunhos de conversa do módulo Propostas
CREATE TABLE public.propostas_rascunhos_conversa (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  cliente_id UUID NOT NULL,
  cliente_nome TEXT NOT NULL,
  template_id UUID,
  mensagens JSONB NOT NULL DEFAULT '[]'::jsonb,
  itens JSONB NOT NULL DEFAULT '[]'::jsonb,
  respostas JSONB NOT NULL DEFAULT '{}'::jsonb,
  finalizado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT propostas_rascunhos_user_cliente_unique UNIQUE (user_id, cliente_id)
);

CREATE INDEX idx_propostas_rascunhos_user ON public.propostas_rascunhos_conversa(user_id, updated_at DESC);

ALTER TABLE public.propostas_rascunhos_conversa ENABLE ROW LEVEL SECURITY;

-- Policies: dono vê e administra; admin vê tudo
CREATE POLICY "rascunhos_select_own_or_admin"
ON public.propostas_rascunhos_conversa
FOR SELECT
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "rascunhos_insert_own"
ON public.propostas_rascunhos_conversa
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "rascunhos_update_own"
ON public.propostas_rascunhos_conversa
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "rascunhos_delete_own_or_admin"
ON public.propostas_rascunhos_conversa
FOR DELETE
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- Trigger updated_at
CREATE TRIGGER trg_propostas_rascunhos_updated_at
BEFORE UPDATE ON public.propostas_rascunhos_conversa
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();