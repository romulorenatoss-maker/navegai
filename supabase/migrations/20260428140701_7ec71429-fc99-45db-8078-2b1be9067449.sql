-- =====================================================================
-- Camada aditiva de métricas baseada em respostas_eventos
-- NÃO altera tabelas, triggers, funções ou policies existentes
-- =====================================================================

-- 0. Checagem prévia: aborta se já houver duplicatas em is_primeira_resposta=true
DO $$
DECLARE
  v_duplicatas int;
BEGIN
  SELECT COUNT(*) INTO v_duplicatas FROM (
    SELECT ordem_servico_id, pergunta_id
    FROM public.respostas_eventos
    WHERE is_primeira_resposta = true
    GROUP BY ordem_servico_id, pergunta_id
    HAVING COUNT(*) > 1
  ) d;

  IF v_duplicatas > 0 THEN
    RAISE EXCEPTION 'Existem % par(es) (OS, pergunta) com mais de uma "primeira resposta". Corrigir antes de criar índice único.', v_duplicatas;
  END IF;
END $$;

-- 1. Índice único parcial garantindo 1 única "primeira resposta" por par
CREATE UNIQUE INDEX IF NOT EXISTS idx_primeira_resposta_unica
ON public.respostas_eventos (ordem_servico_id, pergunta_id)
WHERE is_primeira_resposta = true;

-- 2. View — base de eventos limpos (apenas primeiras respostas)
CREATE OR REPLACE VIEW public.vw_eventos_primeira_resposta AS
SELECT *
FROM public.respostas_eventos
WHERE is_primeira_resposta = true;

-- 3. View — tempo entre cliques (sequência por OS+setor)
-- AJUSTE: ORDER BY respondido_em NULLS FIRST garante ordenação consistente
CREATE OR REPLACE VIEW public.vw_eventos_tempo_sequencia AS
SELECT
  ordem_servico_id,
  setor_id,
  usuario_id,
  pergunta_id,
  respondido_em,
  respondido_em - LAG(respondido_em)
    OVER (PARTITION BY ordem_servico_id, setor_id ORDER BY respondido_em NULLS FIRST)
    AS tempo_entre_respostas
FROM public.vw_eventos_primeira_resposta;

-- 4. Métricas por usuário
-- AJUSTE: FILTER (WHERE tempo_entre_respostas IS NOT NULL) protege a média
CREATE OR REPLACE VIEW public.vw_metricas_usuario AS
SELECT
  usuario_id,
  COUNT(*) AS total_respostas,
  AVG(tempo_entre_respostas) FILTER (WHERE tempo_entre_respostas IS NOT NULL) AS tempo_medio_resposta,
  MIN(respondido_em) AS primeira_acao,
  MAX(respondido_em) AS ultima_acao
FROM public.vw_eventos_tempo_sequencia
GROUP BY usuario_id;

-- 5. Métricas por setor
CREATE OR REPLACE VIEW public.vw_metricas_setor AS
SELECT
  setor_id,
  ordem_servico_id,
  MIN(respondido_em) AS inicio,
  MAX(respondido_em) AS fim,
  MAX(respondido_em) - MIN(respondido_em) AS tempo_total,
  AVG(tempo_entre_respostas) FILTER (WHERE tempo_entre_respostas IS NOT NULL) AS tempo_medio
FROM public.vw_eventos_tempo_sequencia
GROUP BY setor_id, ordem_servico_id;

-- 6. Métricas de comportamento (gargalos por pergunta)
CREATE OR REPLACE VIEW public.vw_metricas_gargalos AS
SELECT
  pergunta_id,
  AVG(tempo_entre_respostas) FILTER (WHERE tempo_entre_respostas IS NOT NULL) AS tempo_medio,
  MAX(tempo_entre_respostas) AS maior_tempo,
  COUNT(*) FILTER (WHERE tempo_entre_respostas IS NOT NULL) AS ocorrencias
FROM public.vw_eventos_tempo_sequencia
WHERE tempo_entre_respostas IS NOT NULL
GROUP BY pergunta_id
ORDER BY tempo_medio DESC NULLS LAST;

-- 7. Detecção de pausas grandes (> 5 minutos entre cliques)
CREATE OR REPLACE VIEW public.vw_metricas_pausas AS
SELECT *
FROM public.vw_eventos_tempo_sequencia
WHERE tempo_entre_respostas > interval '5 minutes';