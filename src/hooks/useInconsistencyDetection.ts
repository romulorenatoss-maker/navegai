import { supabase } from "@/integrations/supabase/client";

interface EvaluatorAnswer {
  avaliador_id: string;
  avaliador_nome: string;
  tipo_avaliacao_id: string;
  tipo_avaliacao_nome: string;
  resposta: string;
  is_responsible: boolean;
}

/**
 * After an evaluation is finalized, detect inconsistencies for the same OS.
 * A question has an inconsistency when multiple evaluators answer it differently.
 * Only the responsible sector's answer counts for scoring.
 */
export async function detectInconsistencies(osId: string) {
  // Get all avaliacoes for this OS
  const { data: avaliacoes } = await supabase
    .from("avaliacoes")
    .select("id, avaliador_id, tipo_avaliacao_id, concluida")
    .eq("ordem_servico_id", osId);

  if (!avaliacoes || avaliacoes.length < 2) return; // Need at least 2 evaluations

  // Get all answers for all avaliacoes of this OS
  const avalIds = avaliacoes.map(a => a.id);
  const avaliadorIds = [...new Set(avaliacoes.map(a => a.avaliador_id))];
  const taIds = [...new Set(avaliacoes.filter(a => a.tipo_avaliacao_id).map(a => a.tipo_avaliacao_id!))];

  // Parallel fetch: respostas, profiles, tipos_avaliacao
  const [respostasRes, profilesRes, taRes] = await Promise.all([
    supabase.from("respostas_avaliacao").select("avaliacao_id, pergunta_id, resposta").in("avaliacao_id", avalIds),
    supabase.from("profiles").select("id, nome").in("id", avaliadorIds),
    taIds.length > 0 ? (supabase as any).from("tipos_avaliacao").select("id, nome").in("id", taIds) : Promise.resolve({ data: [] }),
  ]);

  const allRespostas = respostasRes.data;
  if (!allRespostas) return;

  const nameMap = new Map(profilesRes.data?.map(p => [p.id, p.nome]) || []);
  const taNameMap = new Map((taRes.data || []).map((t: any) => [t.id, t.nome]));

  // Get questions with their responsible sector
  const perguntaIds = [...new Set(allRespostas.map(r => r.pergunta_id))];
  const { data: perguntas } = await supabase
    .from("perguntas_avaliacao")
    .select("id, tipo_avaliacao_id, setor_avaliado_id")
    .in("id", perguntaIds);
  const perguntaMap = new Map(perguntas?.map(p => [p.id, p]) || []);

  // Build avaliacao lookup
  const avalMap = new Map(avaliacoes.map(a => [a.id, a]));

  // Group answers by pergunta_id
  const answersByQuestion = new Map<string, EvaluatorAnswer[]>();
  for (const r of allRespostas) {
    if (!r.resposta) continue;
    const aval = avalMap.get(r.avaliacao_id);
    if (!aval) continue;

    const pergunta = perguntaMap.get(r.pergunta_id);
    const isResponsible = pergunta?.tipo_avaliacao_id
      ? pergunta.tipo_avaliacao_id === aval.tipo_avaliacao_id
      : true; // If no specific tipo_avaliacao on question, all are considered responsible

    const entry: EvaluatorAnswer = {
      avaliador_id: aval.avaliador_id,
      avaliador_nome: nameMap.get(aval.avaliador_id) || "—",
      tipo_avaliacao_id: aval.tipo_avaliacao_id || "",
      tipo_avaliacao_nome: (taNameMap.get(aval.tipo_avaliacao_id || "") as string) || "—",
      resposta: r.resposta,
      is_responsible: isResponsible,
    };

    if (!answersByQuestion.has(r.pergunta_id)) {
      answersByQuestion.set(r.pergunta_id, []);
    }
    answersByQuestion.get(r.pergunta_id)!.push(entry);
  }

  // Batch fetch existing inconsistencies for this OS (avoid N+1)
  const inconsistencyPerguntaIds = [...answersByQuestion.keys()];
  const { data: existingInconsistencies } = await (supabase as any)
    .from("avaliacoes_inconsistencias")
    .select("id, pergunta_id")
    .eq("ordem_servico_id", osId)
    .in("pergunta_id", inconsistencyPerguntaIds);
  const existingMap = new Map((existingInconsistencies || []).map((e: any) => [e.pergunta_id, e.id]));

  // Detect inconsistencies (questions with different answers from different evaluators)
  for (const [perguntaId, answers] of answersByQuestion) {
    if (answers.length < 2) continue;

    const uniqueAnswers = new Set(answers.map(a => a.resposta));
    if (uniqueAnswers.size <= 1) continue; // All agree, no inconsistency

    const pergunta = perguntaMap.get(perguntaId);

    const record = {
      ordem_servico_id: osId,
      pergunta_id: perguntaId,
      respostas_por_avaliador: answers.map(a => ({
        avaliador_id: a.avaliador_id,
        avaliador_nome: a.avaliador_nome,
        tipo_avaliacao: a.tipo_avaliacao_nome,
        resposta: a.resposta,
        is_responsible: a.is_responsible,
      })),
      setor_responsavel_id: pergunta?.setor_avaliado_id || null,
      tipo_avaliacao_responsavel_id: pergunta?.tipo_avaliacao_id || null,
      detectada_em: new Date().toISOString(),
      resolvida: false,
    };

    const existingId = existingMap.get(perguntaId);
    if (existingId) {
      await (supabase as any)
        .from("avaliacoes_inconsistencias")
        .update(record)
        .eq("id", existingId);
    } else {
      await (supabase as any)
        .from("avaliacoes_inconsistencias")
        .insert(record);
    }
  }
}

/**
 * Mark answers as audit_only when they don't come from the responsible sector.
 * Returns the corrected score based only on responsible sector answers.
 */
export async function markAuditOnlyAndCalculateScore(
  avaliacaoId: string,
  avaliadorTipoAvaliacaoId: string,
  previewPerguntas: Array<{ id: string; peso: number }>,
  wizardAnswers: Record<string, string | null>
): Promise<{ nota: number; auditOnlyIds: string[] }> {
  const auditOnlyIds: string[] = [];
  let totalWeight = 0;
  let earnedWeight = 0;

  // Batch fetch all question tipo_avaliacao_ids at once (avoid N+1)
  const perguntaIdsToCheck = previewPerguntas.filter(p => wizardAnswers[p.id]).map(p => p.id);
  const { data: perguntasData } = await supabase
    .from("perguntas_avaliacao")
    .select("id, tipo_avaliacao_id")
    .in("id", perguntaIdsToCheck);
  const perguntaTaMap = new Map((perguntasData || []).map(p => [p.id, p.tipo_avaliacao_id]));

  for (const p of previewPerguntas) {
    const answer = wizardAnswers[p.id];
    if (!answer) continue;

    const perguntaTaId = perguntaTaMap.get(p.id);
    const isResponsible = !perguntaTaId || perguntaTaId === avaliadorTipoAvaliacaoId;

    if (!isResponsible) {
      auditOnlyIds.push(p.id);
      // Mark the answer as audit_only in DB
      await supabase
        .from("respostas_avaliacao")
        .update({ is_audit_only: true } as any)
        .eq("avaliacao_id", avaliacaoId)
        .eq("pergunta_id", p.id);
    } else {
      // This answer counts for scoring — N/A pontua igual SIM
      totalWeight += p.peso;
      if (answer === "sim" || answer === "na") earnedWeight += p.peso;
    }
  }

  const nota = totalWeight > 0 ? (earnedWeight / totalWeight) * 100 : 0;
  return { nota, auditOnlyIds };
}
