
-- Step 1: identify the canonical (oldest) field id for each (template_id, section_id, label)
WITH ranked AS (
  SELECT
    id,
    template_id,
    COALESCE(section_id::text, '') AS section_key,
    label,
    ROW_NUMBER() OVER (
      PARTITION BY template_id, COALESCE(section_id::text, ''), label
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.operational_template_fields
),
canonical AS (
  SELECT template_id, section_key, label, id AS keep_id
  FROM ranked WHERE rn = 1
),
mapping AS (
  SELECT r.id AS old_id, c.keep_id
  FROM ranked r
  JOIN canonical c
    ON c.template_id = r.template_id
   AND c.section_key = r.section_key
   AND c.label = r.label
  WHERE r.rn > 1
)
-- Step 2: repoint dependent rows to the canonical field id before deleting duplicates
UPDATE public.operational_field_answers a
SET field_id = m.keep_id
FROM mapping m
WHERE a.field_id = m.old_id;

WITH ranked AS (
  SELECT id, template_id, COALESCE(section_id::text, '') AS section_key, label,
    ROW_NUMBER() OVER (PARTITION BY template_id, COALESCE(section_id::text, ''), label ORDER BY created_at ASC, id ASC) AS rn
  FROM public.operational_template_fields
),
canonical AS (SELECT template_id, section_key, label, id AS keep_id FROM ranked WHERE rn = 1),
mapping AS (
  SELECT r.id AS old_id, c.keep_id FROM ranked r
  JOIN canonical c ON c.template_id = r.template_id AND c.section_key = r.section_key AND c.label = r.label
  WHERE r.rn > 1
)
UPDATE public.operational_field_reviews a SET field_id = m.keep_id FROM mapping m WHERE a.field_id = m.old_id;

WITH ranked AS (
  SELECT id, template_id, COALESCE(section_id::text, '') AS section_key, label,
    ROW_NUMBER() OVER (PARTITION BY template_id, COALESCE(section_id::text, ''), label ORDER BY created_at ASC, id ASC) AS rn
  FROM public.operational_template_fields
),
canonical AS (SELECT template_id, section_key, label, id AS keep_id FROM ranked WHERE rn = 1),
mapping AS (
  SELECT r.id AS old_id, c.keep_id FROM ranked r
  JOIN canonical c ON c.template_id = r.template_id AND c.section_key = r.section_key AND c.label = r.label
  WHERE r.rn > 1
)
UPDATE public.operational_approval_answers a SET field_id = m.keep_id FROM mapping m WHERE a.field_id = m.old_id;

WITH ranked AS (
  SELECT id, template_id, COALESCE(section_id::text, '') AS section_key, label,
    ROW_NUMBER() OVER (PARTITION BY template_id, COALESCE(section_id::text, ''), label ORDER BY created_at ASC, id ASC) AS rn
  FROM public.operational_template_fields
),
canonical AS (SELECT template_id, section_key, label, id AS keep_id FROM ranked WHERE rn = 1),
mapping AS (
  SELECT r.id AS old_id, c.keep_id FROM ranked r
  JOIN canonical c ON c.template_id = r.template_id AND c.section_key = r.section_key AND c.label = r.label
  WHERE r.rn > 1
)
UPDATE public.operational_contingencies a SET origin_field_id = m.keep_id FROM mapping m WHERE a.origin_field_id = m.old_id;

-- Step 3: delete duplicate fields, keeping only the oldest per (template, section, label)
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY template_id, COALESCE(section_id::text, ''), label ORDER BY created_at ASC, id ASC) AS rn
  FROM public.operational_template_fields
)
DELETE FROM public.operational_template_fields
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 4: also dedupe template sections by (template_id, nome) keeping oldest
WITH s_ranked AS (
  SELECT id, template_id, nome,
    ROW_NUMBER() OVER (PARTITION BY template_id, nome ORDER BY created_at ASC, id ASC) AS rn
  FROM public.operational_template_sections
),
s_canon AS (SELECT template_id, nome, id AS keep_id FROM s_ranked WHERE rn = 1),
s_map AS (SELECT r.id AS old_id, c.keep_id FROM s_ranked r JOIN s_canon c ON c.template_id = r.template_id AND c.nome = r.nome WHERE r.rn > 1)
UPDATE public.operational_template_fields f SET section_id = m.keep_id FROM s_map m WHERE f.section_id = m.old_id;

WITH s_ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY template_id, nome ORDER BY created_at ASC, id ASC) AS rn
  FROM public.operational_template_sections
)
DELETE FROM public.operational_template_sections WHERE id IN (SELECT id FROM s_ranked WHERE rn > 1);
