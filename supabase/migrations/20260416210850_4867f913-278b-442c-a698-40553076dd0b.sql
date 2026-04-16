WITH ranked AS (
  SELECT id, template_id, COALESCE(section_id::text,'') AS sec, label,
    ROW_NUMBER() OVER (
      PARTITION BY template_id, COALESCE(section_id::text,''), label
      ORDER BY (CASE WHEN aprovador_verificar THEN 0 ELSE 1 END), created_at ASC
    ) AS rn
  FROM public.operational_template_fields
),
canonical AS (
  SELECT template_id, sec, label, id AS canonical_id FROM ranked WHERE rn = 1
),
to_remove AS (
  SELECT r.id AS dup_id, c.canonical_id
  FROM ranked r
  JOIN canonical c ON c.template_id = r.template_id AND c.sec = r.sec AND c.label = r.label
  WHERE r.rn > 1
)
, _u1 AS (UPDATE public.operational_field_answers a SET field_id = tr.canonical_id FROM to_remove tr WHERE a.field_id = tr.dup_id RETURNING 1)
, _u2 AS (UPDATE public.operational_field_reviews a SET field_id = tr.canonical_id FROM to_remove tr WHERE a.field_id = tr.dup_id RETURNING 1)
, _u3 AS (UPDATE public.operational_approval_answers a SET field_id = tr.canonical_id FROM to_remove tr WHERE a.field_id = tr.dup_id RETURNING 1)
, _u4 AS (UPDATE public.operational_contingencies a SET origin_field_id = tr.canonical_id FROM to_remove tr WHERE a.origin_field_id = tr.dup_id RETURNING 1)
DELETE FROM public.operational_template_fields f USING to_remove tr WHERE f.id = tr.dup_id