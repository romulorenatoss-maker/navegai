
CREATE OR REPLACE FUNCTION public.sync_template_responsaveis_to_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_field text;
  v_tpl_col text;
  v_asgn_col text;
  v_old_val uuid;
  v_new_val uuid;
  v_pair record;
  v_assignment record;
  v_changed_fields jsonb := '[]'::jsonb;
BEGIN
  -- Only proceed if relevant responsible fields changed
  -- Map: template column -> assignment column
  FOR v_pair IN
    SELECT * FROM (VALUES
      ('executor_profile_id',                'responsavel_id'),
      ('avaliador_profile_id',               'avaliador_id'),
      ('avaliado_profile_id',                'avaliado_id'),
      ('aprovador_profile_id',               'aprovador_id'),
      ('validador_contingencia_profile_id',  'validador_contingencia_id'),
      ('executor_setor_id',                  'setor_executor_id'),
      ('avaliador_setor_id',                 'setor_avaliador_id'),
      ('avaliado_setor_id',                  'setor_avaliado_id')
    ) AS mapping(tpl_col, asgn_col)
  LOOP
    -- Use dynamic field access via to_jsonb
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

  -- Nothing changed? Exit early
  IF jsonb_array_length(v_changed_fields) = 0 THEN
    RETURN NEW;
  END IF;

  -- Update only assignments in safe statuses
  FOR v_assignment IN
    SELECT id, responsavel_id, avaliador_id, avaliado_id, aprovador_id,
           validador_contingencia_id, setor_executor_id, setor_avaliador_id, setor_avaliado_id
    FROM operational_assignments
    WHERE template_id = NEW.id
      AND status = 'pendente'
  LOOP
    -- Apply each changed field
    UPDATE operational_assignments
    SET
      responsavel_id = CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'responsavel_id')
        THEN (SELECT (e->>'novo_valor')::uuid FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'responsavel_id' LIMIT 1)
        ELSE responsavel_id END,
      avaliador_id = CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'avaliador_id')
        THEN (SELECT (e->>'novo_valor')::uuid FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'avaliador_id' LIMIT 1)
        ELSE avaliador_id END,
      avaliado_id = CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'avaliado_id')
        THEN (SELECT (e->>'novo_valor')::uuid FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'avaliado_id' LIMIT 1)
        ELSE avaliado_id END,
      aprovador_id = CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'aprovador_id')
        THEN (SELECT (e->>'novo_valor')::uuid FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'aprovador_id' LIMIT 1)
        ELSE aprovador_id END,
      validador_contingencia_id = CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'validador_contingencia_id')
        THEN (SELECT (e->>'novo_valor')::uuid FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'validador_contingencia_id' LIMIT 1)
        ELSE validador_contingencia_id END,
      setor_executor_id = CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'setor_executor_id')
        THEN (SELECT (e->>'novo_valor')::uuid FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'setor_executor_id' LIMIT 1)
        ELSE setor_executor_id END,
      setor_avaliador_id = CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'setor_avaliador_id')
        THEN (SELECT (e->>'novo_valor')::uuid FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'setor_avaliador_id' LIMIT 1)
        ELSE setor_avaliador_id END,
      setor_avaliado_id = CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'setor_avaliado_id')
        THEN (SELECT (e->>'novo_valor')::uuid FROM jsonb_array_elements(v_changed_fields) e WHERE e->>'campo_assignment' = 'setor_avaliado_id' LIMIT 1)
        ELSE setor_avaliado_id END,
      updated_at = now()
    WHERE id = v_assignment.id;

    -- Audit log for each assignment
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
$$;

-- Create the trigger on operational_templates
CREATE TRIGGER trg_sync_template_responsaveis
AFTER UPDATE ON operational_templates
FOR EACH ROW
EXECUTE FUNCTION sync_template_responsaveis_to_assignments();
