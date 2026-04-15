
UPDATE operational_assignments a
SET template_snapshot = jsonb_build_object(
  'nome', t.nome,
  'tipo_execucao', t.tipo_execucao,
  'sections', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'nome', s.nome,
        'descricao', s.descricao,
        'ordem', s.ordem,
        'peso', s.peso,
        'cor', s.cor
      ) ORDER BY s.ordem
    )
    FROM operational_template_sections s WHERE s.template_id = t.id
  ), '[]'::jsonb),
  'fields', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', f.id,
        'label', f.label,
        'tipo', f.tipo,
        'obrigatorio', f.obrigatorio,
        'ordem', f.ordem,
        'section_id', f.section_id,
        'opcoes', f.opcoes,
        'peso', f.peso,
        'nota_maxima', f.nota_maxima,
        'penalidade_reprovacao', f.penalidade_reprovacao,
        'criticidade', f.criticidade,
        'gera_contingencia', f.gera_contingencia,
        'impacta_score', f.impacta_score,
        'exige_evidencia', f.exige_evidencia,
        'tipo_evidencia', f.tipo_evidencia,
        'condicao_visibilidade', f.condicao_visibilidade,
        'descricao', f.descricao,
        'validacao', f.validacao,
        'formula', f.formula,
        'editavel_por', f.editavel_por,
        'visivel_para', f.visivel_para
      ) ORDER BY f.ordem
    )
    FROM operational_template_fields f WHERE f.template_id = t.id
  ), '[]'::jsonb)
)
FROM operational_templates t
WHERE a.template_id = t.id
  AND (a.template_snapshot IS NULL OR a.template_snapshot->'fields' = '[]'::jsonb);
