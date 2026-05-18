WITH alvo AS (
  SELECT
    c.id AS contingency_id,
    c.assignment_id,
    fa.respondido_por,
    fa.valor_json
  FROM public.operational_contingencies c
  JOIN public.operational_assignments a ON a.id = c.assignment_id
  JOIN public.operational_field_answers fa
    ON fa.assignment_id = c.assignment_id
   AND fa.field_id = c.origin_field_id
  WHERE a.numero_tarefa = 15
    AND c.id = '6b683a81-ae39-4f11-9989-e7512ec2ad06'::uuid
    AND c.status IN ('aberta', 'em_andamento')
    AND fa.valor_json ? '__plano_acao__r1__foto'
    AND fa.valor_json ? '__plano_acao__r1__video'
    AND fa.valor_json ? '__plano_acao__r1__audio'
    AND fa.valor_json ? '__plano_acao__r1__texto'
    AND coalesce(fa.valor_json #>> '{__plano_acao__r1__foto,evidencia_url}', '') <> ''
    AND coalesce(fa.valor_json #>> '{__plano_acao__r1__video,evidencia_url}', '') <> ''
    AND coalesce(fa.valor_json #>> '{__plano_acao__r1__audio,evidencia_url}', '') <> ''
    AND coalesce(fa.valor_json #>> '{__plano_acao__r1__texto,valor_texto}', '') <> ''
), atualizado AS (
  UPDATE public.operational_contingencies c
  SET status = 'resolvida',
      resolvida_em = now(),
      dentro_prazo = true,
      updated_at = now(),
      observacao_tratamento = 'Plano de ação preenchido pelo executor; pendência era status interno ainda aberto.'
  FROM alvo
  WHERE c.id = alvo.contingency_id
  RETURNING c.id, c.assignment_id, alvo.respondido_por
)
INSERT INTO public.operational_contingency_resolution_logs (
  contingency_id,
  acao,
  observacao,
  executado_por
)
SELECT
  id,
  'resolucao_saneamento_status',
  'Saneado após confirmação de foto, vídeo, áudio e texto no valor_json do plano de ação.',
  respondido_por
FROM atualizado;

INSERT INTO public.operational_execution_logs (
  assignment_id,
  acao,
  executado_por,
  detalhes
)
SELECT
  a.id,
  'contingencia_status_saneado',
  fa.respondido_por,
  jsonb_build_object(
    'contingency_id', c.id,
    'motivo', 'Itens obrigatórios do plano estavam preenchidos; status interno permanecia aberto',
    'numero_tarefa', a.numero_tarefa
  )
FROM public.operational_assignments a
JOIN public.operational_contingencies c ON c.assignment_id = a.id
LEFT JOIN public.operational_field_answers fa ON fa.assignment_id = a.id AND fa.field_id = c.origin_field_id
WHERE a.numero_tarefa = 15
  AND c.id = '6b683a81-ae39-4f11-9989-e7512ec2ad06'::uuid
  AND c.status = 'resolvida'
  AND NOT EXISTS (
    SELECT 1
    FROM public.operational_execution_logs l
    WHERE l.assignment_id = a.id
      AND l.acao = 'contingencia_status_saneado'
      AND l.detalhes->>'contingency_id' = c.id::text
  );