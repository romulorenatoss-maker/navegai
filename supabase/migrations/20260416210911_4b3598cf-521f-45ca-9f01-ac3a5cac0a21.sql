UPDATE public.operational_assignments a
SET template_snapshot = jsonb_build_object(
  'versao', COALESCE(t.versao, 1),
  'nome', t.nome,
  'descricao', t.descricao,
  'sla_horas', COALESCE(t.sla_horas, 24),
  'permite_devolucao_parcial', COALESCE(t.permite_devolucao_parcial, false),
  'requer_aprovacao_gestor', COALESCE(t.requer_aprovacao_gestor, false),
  'bloquear_fechamento_com_contingencia', COALESCE(t.bloquear_fechamento_com_contingencia, false),
  'gerar_contingencia_automatica', COALESCE(t.gerar_contingencia_automatica, false),
  'peso_recorrencia', COALESCE(t.peso_recorrencia, 1.0),
  'modo_pontuacao', t.modo_pontuacao,
  'destino_score', t.destino_score,
  'horario_inicio_previsto', t.horario_inicio_previsto,
  'horario_limite_execucao', t.horario_limite_execucao,
  'tolerancia_minutos', COALESCE(t.tolerancia_minutos, 0),
  'habilitar_perguntas_automaticas', true,
  'penalidade_fora_prazo', 20,
  'penalidade_contingencia', 10,
  'penalidade_sla_contingencia', 15,
  'sections', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.ordem) FROM public.operational_template_sections s WHERE s.template_id = t.id), jsonb_build_array()),
  'fields', COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.ordem) FROM public.operational_template_fields f WHERE f.template_id = t.id), jsonb_build_array())
)
FROM public.operational_templates t
WHERE a.template_id = t.id