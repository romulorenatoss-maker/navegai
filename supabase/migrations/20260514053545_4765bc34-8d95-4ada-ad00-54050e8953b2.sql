
-- D3: Add 'aprovador' to app_role enum (deprecate 'avaliador' but keep for history)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'aprovador';

-- D1 + D5: Missing columns on operational_assignments to align with 4 papéis
ALTER TABLE public.operational_assignments
  ADD COLUMN IF NOT EXISTS setor_aprovador_id uuid,
  ADD COLUMN IF NOT EXISTS score_aprovador numeric;

-- D4: Rewrite sync trigger — remove avaliador_*, setor_avaliador_id (já dropados);
-- adicionar aprovador_setor e auditor (profile + setor)
CREATE OR REPLACE FUNCTION public.sync_template_responsaveis_to_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_val uuid;
  v_new_val uuid;
  v_pair record;
  v_assignment record;
  v_changed_fields jsonb := '[]'::jsonb;
BEGIN
  FOR v_pair IN
    SELECT * FROM (VALUES
      ('executor_profile_id',                'responsavel_id'),
      ('avaliado_profile_id',                'avaliado_id'),
      ('aprovador_profile_id',               'aprovador_id'),
      ('auditor_profile_id',                 'auditor_id'),
      ('validador_contingencia_profile_id',  'validador_contingencia_id'),
      ('executor_setor_id',                  'setor_executor_id'),
      ('avaliado_setor_id',                  'setor_avaliado_id'),
      ('aprovador_setor_id',                 'setor_aprovador_id'),
      ('auditor_setor_id',                   'setor_auditor_id')
    ) AS mapping(tpl_col, asgn_col)
  LOOP
    v_old_val := (to_jsonb(OLD) ->> v_pair.tpl_col)::uuid;
    v_new_val := (to_jsonb(NEW) ->> v_pair.tpl_col)::uuid;

    IF v_old_val IS DISTINCT FROM v_new_val THEN
      v_changed_fields := v_changed_fields || jsonb_build_object(
        'campo_template', v_pair.tpl_col,
        'campo_assignment', v_pair.asgn_col,
        'valor_anterior', v_old_val,
        'novo_valor', v_new_val
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_changed_fields) = 0 THEN
    RETURN NEW;
  END IF;

  FOR v_assignment IN
    SELECT id
    FROM operational_assignments
    WHERE template_id = NEW.id
      AND status IN ('pendente', 'aguardando_execucao')
  LOOP
    UPDATE operational_assignments a
    SET
      responsavel_id = COALESCE(
        (SELECT (e->>'novo_valor')::uuid FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'responsavel_id' LIMIT 1),
        a.responsavel_id),
      avaliado_id = COALESCE(
        (SELECT (e->>'novo_valor')::uuid FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'avaliado_id' LIMIT 1),
        a.avaliado_id),
      aprovador_id = COALESCE(
        (SELECT (e->>'novo_valor')::uuid FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'aprovador_id' LIMIT 1),
        a.aprovador_id),
      auditor_id = COALESCE(
        (SELECT (e->>'novo_valor')::uuid FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'auditor_id' LIMIT 1),
        a.auditor_id),
      validador_contingencia_id = COALESCE(
        (SELECT (e->>'novo_valor')::uuid FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'validador_contingencia_id' LIMIT 1),
        a.validador_contingencia_id),
      setor_executor_id = COALESCE(
        (SELECT (e->>'novo_valor')::uuid FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'setor_executor_id' LIMIT 1),
        a.setor_executor_id),
      setor_avaliado_id = COALESCE(
        (SELECT (e->>'novo_valor')::uuid FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'setor_avaliado_id' LIMIT 1),
        a.setor_avaliado_id),
      setor_aprovador_id = COALESCE(
        (SELECT (e->>'novo_valor')::uuid FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'setor_aprovador_id' LIMIT 1),
        a.setor_aprovador_id),
      setor_auditor_id = COALESCE(
        (SELECT (e->>'novo_valor')::uuid FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'setor_auditor_id' LIMIT 1),
        a.setor_auditor_id),
      updated_at = now()
    WHERE a.id = v_assignment.id;

    INSERT INTO operational_assignment_history (
      assignment_id, tipo_evento, etapa, detalhes_json, usuario_id
    ) VALUES (
      v_assignment.id,
      'ALTERACAO_AUTOMATICA_RESPONSAVEL',
      'sincronizacao_template',
      jsonb_build_object(
        'template_id', NEW.id,
        'campos_alterados', v_changed_fields
      ),
      NULL
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Atualizar sync_user_role para parar de atribuir 'avaliador' (deprecado).
-- Mantém leitura histórica intacta; novas atribuições passam a usar 'aprovador'.
CREATE OR REPLACE FUNCTION public.sync_user_role(_user_id uuid, _cargo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _role app_role;
BEGIN
  _role := CASE _cargo
    WHEN 'administrador' THEN 'admin'::app_role
    WHEN 'aprovador'     THEN 'aprovador'::app_role
    WHEN 'avaliado'      THEN 'avaliado'::app_role
    WHEN 'executor'      THEN 'executor'::app_role
    WHEN 'gestor'        THEN 'gestor'::app_role
    -- 'avaliador' deprecado: não atribui mais via este caminho
    ELSE NULL
  END;

  DELETE FROM public.user_roles
  WHERE user_id = _user_id
    AND role <> 'avaliador'::app_role; -- preserva histórico legado

  IF _role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  IF _cargo = 'administrador' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'aprovador'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END;
$function$;
