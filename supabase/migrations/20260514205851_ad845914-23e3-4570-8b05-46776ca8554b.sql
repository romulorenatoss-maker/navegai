DO $$
DECLARE
  v_template uuid := 'a0000001-0000-0000-0000-000000000003';
  v_kept uuid[];
  v_snapshot jsonb;
  v_filtered_aprovador jsonb;
BEGIN
  WITH ranked AS (
    SELECT
      f.id,
      ROW_NUMBER() OVER (
        PARTITION BY f.template_id, COALESCE(f.section_id::text,''), f.label, f.tipo, f.ordem, COALESCE(f.descricao,'')
        ORDER BY
          CASE WHEN EXISTS (SELECT 1 FROM operational_field_answers a WHERE a.field_id = f.id) THEN 0 ELSE 1 END,
          CASE WHEN EXISTS (SELECT 1 FROM operational_field_reviews r WHERE r.field_id = f.id) THEN 0 ELSE 1 END,
          CASE WHEN EXISTS (SELECT 1 FROM operational_approval_answers ap WHERE ap.field_id = f.id) THEN 0 ELSE 1 END,
          CASE WHEN EXISTS (SELECT 1 FROM operational_audit_answers ad WHERE ad.field_id = f.id) THEN 0 ELSE 1 END,
          CASE WHEN EXISTS (SELECT 1 FROM operational_contingencies c WHERE c.origin_field_id = f.id) THEN 0 ELSE 1 END,
          f.created_at,
          f.id
      ) AS rn
    FROM operational_template_fields f
    WHERE f.template_id = v_template
  )
  SELECT array_agg(id) INTO v_kept FROM ranked WHERE rn = 1;

  -- Remove apenas duplicados que não tenham qualquer registro vinculado
  DELETE FROM operational_template_fields f
  WHERE f.template_id = v_template
    AND NOT (f.id = ANY(v_kept))
    AND NOT EXISTS (SELECT 1 FROM operational_field_answers a WHERE a.field_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM operational_field_reviews r WHERE r.field_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM operational_approval_answers ap WHERE ap.field_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM operational_audit_answers ad WHERE ad.field_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM operational_contingencies c WHERE c.origin_field_id = f.id);

  -- Filtra checklist do Aprovador no snapshot, mantendo apenas perguntas
  -- replicadas cujo field_id ainda existe + perguntas não-replicadas.
  SELECT ada_config_snapshot INTO v_snapshot FROM operational_templates WHERE id = v_template;
  IF v_snapshot IS NOT NULL AND v_snapshot ? 'checklists' AND v_snapshot->'checklists' ? 'aprovador' THEN
    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_filtered_aprovador
    FROM (
      SELECT DISTINCT ON (
        COALESCE(item->>'origem_pergunta','manual'),
        COALESCE(item->>'field_id',''),
        COALESCE(item->>'config_global_origem_id',''),
        COALESCE(item->>'pergunta_padrao','')
      ) item
      FROM jsonb_array_elements(v_snapshot->'checklists'->'aprovador') AS arr(item)
      WHERE
        item->>'origem_pergunta' IS DISTINCT FROM 'replicada_avaliado'
        OR EXISTS (
          SELECT 1 FROM operational_template_fields f
          WHERE f.template_id = v_template
            AND f.id::text = item->>'field_id'
        )
    ) sub;

    UPDATE operational_templates
    SET ada_config_snapshot = jsonb_set(
      ada_config_snapshot,
      '{checklists,aprovador}',
      v_filtered_aprovador,
      true
    )
    WHERE id = v_template;
  END IF;
END $$;