DROP VIEW IF EXISTS vw_metricas_gargalos;

CREATE VIEW vw_metricas_gargalos AS
SELECT
  COALESCE(p.pergunta, 'Pergunta não encontrada') AS pergunta,
  e.pergunta_id,
  AVG(e.tempo_entre_respostas) FILTER (WHERE e.tempo_entre_respostas IS NOT NULL) AS tempo_medio,
  MAX(e.tempo_entre_respostas) AS maior_tempo,
  COUNT(*) AS ocorrencias
FROM vw_eventos_tempo_sequencia e
LEFT JOIN perguntas_avaliacao p ON p.id = e.pergunta_id
GROUP BY p.pergunta, e.pergunta_id
ORDER BY tempo_medio DESC;