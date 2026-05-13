-- ============================================================
-- PR A — Avaliação do Avaliador (AdA): configuração global
-- Aditiva. Não altera tabelas existentes.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tarefas_ada_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true,

  -- Perguntas padrão (lista editável)
  -- Estrutura sugerida por item:
  -- { id, pergunta, tipo, obrigatorio, gera_pontuacao, pontos, gera_plano_acao, bloqueia_conclusao, ordem }
  perguntas_padrao jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Anexos / evidências
  exige_anexo boolean NOT NULL DEFAULT false,
  anexo_tipo text NOT NULL DEFAULT 'qualquer',           -- 'foto'|'video'|'documento'|'qualquer'
  anexo_obrigatorio boolean NOT NULL DEFAULT false,
  anexo_quantidade_minima integer NOT NULL DEFAULT 0,
  anexo_instrucao text,

  -- SLA
  prazo_horas integer NOT NULL DEFAULT 24,
  penalidade_atraso numeric NOT NULL DEFAULT 10,
  prioridade text NOT NULL DEFAULT 'normal',             -- 'baixa'|'normal'|'alta'|'critica'

  -- Pontuação
  nota_minima numeric NOT NULL DEFAULT 0,
  nota_maxima numeric NOT NULL DEFAULT 100,

  descricao text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,

  CONSTRAINT tarefas_ada_config_singleton_uq UNIQUE (singleton),
  CONSTRAINT tarefas_ada_config_anexo_tipo_chk
    CHECK (anexo_tipo IN ('foto','video','documento','qualquer')),
  CONSTRAINT tarefas_ada_config_prioridade_chk
    CHECK (prioridade IN ('baixa','normal','alta','critica'))
);

-- Trigger updated_at (reusa função existente)
DROP TRIGGER IF EXISTS trg_tarefas_ada_config_touch ON public.tarefas_ada_config;
CREATE TRIGGER trg_tarefas_ada_config_touch
  BEFORE UPDATE ON public.tarefas_ada_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Linha singleton padrão
INSERT INTO public.tarefas_ada_config (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

-- RLS
ALTER TABLE public.tarefas_ada_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ada_config_select_authenticated" ON public.tarefas_ada_config;
CREATE POLICY "ada_config_select_authenticated"
  ON public.tarefas_ada_config
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ada_config_admin_manage" ON public.tarefas_ada_config;
CREATE POLICY "ada_config_admin_manage"
  ON public.tarefas_ada_config
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================
-- ROLLBACK (executar manualmente se necessário):
--   DROP TABLE IF EXISTS public.tarefas_ada_config CASCADE;
-- ============================================================
