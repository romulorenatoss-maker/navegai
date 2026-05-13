-- ============================================================
-- PR B — Avaliação do Avaliador (AdA): estrutura + trigger
-- Aditiva. Sem remoção de campos.
-- ============================================================

-- 1) Colunas em operational_templates -----------------------------------
ALTER TABLE public.operational_templates
  ADD COLUMN IF NOT EXISTS ada_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ada_config_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS ada_quem_avalia_tipo text,
  ADD COLUMN IF NOT EXISTS ada_quem_avalia_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS ada_quem_avalia_setor_id uuid REFERENCES public.setores(id),
  ADD COLUMN IF NOT EXISTS ada_gerar_em text;

ALTER TABLE public.operational_templates
  DROP CONSTRAINT IF EXISTS operational_templates_ada_quem_avalia_tipo_chk;
ALTER TABLE public.operational_templates
  ADD CONSTRAINT operational_templates_ada_quem_avalia_tipo_chk
  CHECK (ada_quem_avalia_tipo IS NULL OR ada_quem_avalia_tipo IN ('pessoa','setor','administrador','responsavel_padrao'));

ALTER TABLE public.operational_templates
  DROP CONSTRAINT IF EXISTS operational_templates_ada_gerar_em_chk;
ALTER TABLE public.operational_templates
  ADD CONSTRAINT operational_templates_ada_gerar_em_chk
  CHECK (ada_gerar_em IS NULL OR ada_gerar_em IN ('pos_avaliacao','pos_aprovacao','pos_plano_acao'));

-- 2) Colunas em operational_assignments ---------------------------------
ALTER TABLE public.operational_assignments
  ADD COLUMN IF NOT EXISTS tipo_assignment text NOT NULL DEFAULT 'principal',
  ADD COLUMN IF NOT EXISTS parent_assignment_id uuid REFERENCES public.operational_assignments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS ada_avaliador_avaliado_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS ada_responsavel_definido_id uuid REFERENCES public.profiles(id);

ALTER TABLE public.operational_assignments
  DROP CONSTRAINT IF EXISTS operational_assignments_tipo_assignment_chk;
ALTER TABLE public.operational_assignments
  ADD CONSTRAINT operational_assignments_tipo_assignment_chk
  CHECK (tipo_assignment IN ('principal','avaliacao_avaliador'));

CREATE INDEX IF NOT EXISTS idx_op_assignments_parent
  ON public.operational_assignments(parent_assignment_id)
  WHERE parent_assignment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_op_assignments_tipo
  ON public.operational_assignments(tipo_assignment);

-- 3) Liberar índice único para permitir filhos AdA no mesmo dia ---------
DROP INDEX IF EXISTS public.idx_op_assignments_unique;
CREATE UNIQUE INDEX idx_op_assignments_unique
  ON public.operational_assignments(template_id, data_prevista, responsavel_id)
  WHERE tipo_assignment = 'principal';

-- 4) Função de geração automática --------------------------------------
CREATE OR REPLACE FUNCTION public.fn_gerar_ada_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template     RECORD;
  v_should_fire  boolean := false;
  v_responsavel  uuid;
  v_prazo_horas  int := 24;
  v_data_prev    date;
  v_snapshot     jsonb;
  v_existing     int;
BEGIN
  -- Apenas tarefas principais geram AdA
  IF COALESCE(NEW.tipo_assignment, 'principal') <> 'principal' THEN
    RETURN NEW;
  END IF;

  -- Precisa ter avaliador (alguém pra avaliar)
  IF NEW.avaliador_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Carrega config AdA do template
  SELECT *
    INTO v_template
  FROM public.operational_templates
  WHERE id = NEW.template_id;

  IF NOT FOUND OR COALESCE(v_template.ada_enabled, false) = false THEN
    RETURN NEW;
  END IF;

  -- Ponto de gatilho conforme ada_gerar_em
  v_should_fire := CASE COALESCE(v_template.ada_gerar_em, 'pos_avaliacao')
    WHEN 'pos_avaliacao' THEN
      OLD.status IS DISTINCT FROM NEW.status
      AND NEW.status IN ('aguardando_aprovacao','aprovada','concluida')
    WHEN 'pos_aprovacao' THEN
      OLD.status IS DISTINCT FROM NEW.status
      AND NEW.status IN ('aprovada','concluida')
    WHEN 'pos_plano_acao' THEN
      OLD.status IS DISTINCT FROM NEW.status
      AND NEW.status IN ('concluida','aprovada')
    ELSE false
  END;

  IF NOT v_should_fire THEN
    RETURN NEW;
  END IF;

  -- Idempotência: se já existir filho AdA, não recria
  SELECT COUNT(*) INTO v_existing
  FROM public.operational_assignments
  WHERE parent_assignment_id = NEW.id
    AND tipo_assignment = 'avaliacao_avaliador';

  IF v_existing > 0 THEN
    RETURN NEW;
  END IF;

  -- Snapshot editável
  v_snapshot := COALESCE(v_template.ada_config_snapshot, '{}'::jsonb);
  v_prazo_horas := COALESCE((v_snapshot->>'prazo_horas')::int, 24);
  v_data_prev := (now() + make_interval(hours => v_prazo_horas))::date;

  -- Resolve quem avalia (responsável persistido no registro)
  v_responsavel := CASE COALESCE(v_template.ada_quem_avalia_tipo, 'responsavel_padrao')
    WHEN 'pessoa' THEN v_template.ada_quem_avalia_profile_id
    WHEN 'setor' THEN NULL                        -- fica vago: qualquer membro do setor pode atender
    WHEN 'administrador' THEN NULL                -- fica vago: qualquer admin pode atender
    WHEN 'responsavel_padrao' THEN COALESCE(NEW.aprovador_id, NEW.created_by)
    ELSE NULL
  END;

  INSERT INTO public.operational_assignments (
    template_id,
    template_snapshot,
    template_versao,
    data_prevista,
    status,
    responsavel_id,
    avaliado_id,
    setor_avaliado_id,
    setor_executor_id,
    tipo_assignment,
    parent_assignment_id,
    ada_avaliador_avaliado_id,
    ada_responsavel_definido_id,
    created_by,
    observacao
  ) VALUES (
    NEW.template_id,
    v_snapshot,
    NEW.template_versao,
    v_data_prev,
    'aguardando_avaliacao',
    v_responsavel,
    NEW.avaliador_id,
    NEW.setor_avaliador_id,
    CASE COALESCE(v_template.ada_quem_avalia_tipo, 'responsavel_padrao')
      WHEN 'setor' THEN v_template.ada_quem_avalia_setor_id
      ELSE NULL
    END,
    NEW.tipo_assignment,
    NEW.id,
    NEW.avaliador_id,
    v_responsavel,
    NEW.created_by,
    'Avaliação do Avaliador gerada automaticamente a partir da tarefa #' || NEW.numero_tarefa::text
  );

  -- History
  INSERT INTO public.operational_assignment_history (
    assignment_id, tipo_evento, etapa, detalhes_json, usuario_id
  ) VALUES (
    NEW.id,
    'GERADA_AVALIACAO_DO_AVALIADOR',
    'avaliacao_avaliador',
    jsonb_build_object(
      'parent_status', NEW.status,
      'gerar_em', v_template.ada_gerar_em,
      'avaliador_avaliado_id', NEW.avaliador_id,
      'responsavel_definido_id', v_responsavel
    ),
    NULL
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gerar_ada_assignment ON public.operational_assignments;
CREATE TRIGGER trg_gerar_ada_assignment
  AFTER UPDATE OF status ON public.operational_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_gerar_ada_assignment();

-- ============================================================
-- ROLLBACK (manual):
--   DROP TRIGGER IF EXISTS trg_gerar_ada_assignment ON public.operational_assignments;
--   DROP FUNCTION IF EXISTS public.fn_gerar_ada_assignment();
--   DROP INDEX IF EXISTS public.idx_op_assignments_unique;
--   CREATE UNIQUE INDEX idx_op_assignments_unique ON public.operational_assignments(template_id, data_prevista, responsavel_id);
--   ALTER TABLE public.operational_assignments
--     DROP COLUMN IF EXISTS ada_responsavel_definido_id,
--     DROP COLUMN IF EXISTS ada_avaliador_avaliado_id,
--     DROP COLUMN IF EXISTS parent_assignment_id,
--     DROP COLUMN IF EXISTS tipo_assignment;
--   ALTER TABLE public.operational_templates
--     DROP COLUMN IF EXISTS ada_gerar_em,
--     DROP COLUMN IF EXISTS ada_quem_avalia_setor_id,
--     DROP COLUMN IF EXISTS ada_quem_avalia_profile_id,
--     DROP COLUMN IF EXISTS ada_quem_avalia_tipo,
--     DROP COLUMN IF EXISTS ada_config_snapshot,
--     DROP COLUMN IF EXISTS ada_enabled;
-- ============================================================
