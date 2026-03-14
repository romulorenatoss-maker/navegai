
CREATE OR REPLACE FUNCTION public.calcular_notas_por_setor(
  p_data_inicio TIMESTAMPTZ DEFAULT NULL,
  p_data_fim TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  tipo TEXT,
  profile_id UUID,
  profile_nome TEXT,
  setor_id UUID,
  setor_nome TEXT,
  os_id UUID,
  nota NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH os_filtradas AS (
    SELECT o.id, o.atendente_id, o.tecnico_id, o.colaborador_avaliado_id
    FROM ordens_servico o
    WHERE o.status = 'concluida'
      AND (p_data_inicio IS NULL OR o.created_at >= p_data_inicio)
      AND (p_data_fim IS NULL OR o.created_at <= p_data_fim)
  ),
  -- Get os_perguntas snapshot with pergunta details
  perguntas_com_info AS (
    SELECT 
      op.os_id,
      op.pergunta_id,
      pa.peso,
      pa.setor_avaliado_id
    FROM os_perguntas op
    JOIN perguntas_avaliacao pa ON pa.id = op.pergunta_id
    WHERE op.os_id IN (SELECT id FROM os_filtradas)
  ),
  -- Get responses
  respostas AS (
    SELECT 
      ra.ordem_servico_id,
      ra.pergunta_id,
      ra.resposta
    FROM respostas_avaliacao ra
    WHERE ra.ordem_servico_id IN (SELECT id FROM os_filtradas)
      AND ra.resposta IS NOT NULL
  ),
  -- Calculate score per OS per setor
  scores_por_setor AS (
    SELECT
      p.os_id,
      p.setor_avaliado_id AS s_id,
      CASE 
        WHEN SUM(CASE WHEN r.resposta != 'na' THEN p.peso ELSE 0 END) > 0
        THEN ROUND(
          (SUM(CASE WHEN r.resposta = 'sim' THEN p.peso ELSE 0 END)::NUMERIC /
           SUM(CASE WHEN r.resposta != 'na' THEN p.peso ELSE 0 END)::NUMERIC) * 100, 2)
        ELSE NULL
      END AS nota_calculada
    FROM perguntas_com_info p
    LEFT JOIN respostas r ON r.ordem_servico_id = p.os_id AND r.pergunta_id = p.pergunta_id
    GROUP BY p.os_id, p.setor_avaliado_id
  ),
  -- Assign to employee based on sector name
  scores_com_employee AS (
    SELECT
      sc.os_id,
      sc.s_id,
      sc.nota_calculada,
      CASE
        WHEN LOWER(s.nome) LIKE '%atendimento%' THEN o.atendente_id
        WHEN LOWER(s.nome) LIKE '%cnico%' OR LOWER(s.nome) LIKE '%tecnico%' THEN o.tecnico_id
        ELSE COALESCE(o.colaborador_avaliado_id, o.tecnico_id, o.atendente_id)
      END AS employee_id,
      CASE
        WHEN LOWER(s.nome) LIKE '%atendimento%' THEN 'atendente'
        WHEN LOWER(s.nome) LIKE '%cnico%' OR LOWER(s.nome) LIKE '%tecnico%' THEN 'tecnico'
        ELSE 'geral'
      END AS tipo_employee
    FROM scores_por_setor sc
    JOIN os_filtradas o ON o.id = sc.os_id
    LEFT JOIN setores s ON s.id = sc.s_id
    WHERE sc.nota_calculada IS NOT NULL
  )
  SELECT
    sce.tipo_employee AS tipo,
    sce.employee_id AS profile_id,
    p.nome AS profile_nome,
    sce.s_id AS setor_id,
    COALESCE(s.nome, 'Geral') AS setor_nome,
    sce.os_id,
    sce.nota_calculada AS nota
  FROM scores_com_employee sce
  JOIN profiles p ON p.id = sce.employee_id
  LEFT JOIN setores s ON s.id = sce.s_id
  WHERE sce.employee_id IS NOT NULL;
END;
$$;

-- Aggregation view function
CREATE OR REPLACE FUNCTION public.dashboard_metricas_agregadas(
  p_data_inicio TIMESTAMPTZ DEFAULT NULL,
  p_data_fim TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  tipo TEXT,
  profile_id UUID,
  nome TEXT,
  setor_nome TEXT,
  total_os BIGINT,
  media_nota NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cn.tipo,
    cn.profile_id,
    cn.profile_nome AS nome,
    cn.setor_nome,
    COUNT(DISTINCT cn.os_id) AS total_os,
    ROUND(AVG(cn.nota), 2) AS media_nota
  FROM calcular_notas_por_setor(p_data_inicio, p_data_fim) cn
  GROUP BY cn.tipo, cn.profile_id, cn.profile_nome, cn.setor_nome
  ORDER BY media_nota DESC;
END;
$$;
