import { supabase } from "@/integrations/supabase/client";

/**
 * After an evaluation is finalized, detect linked-question inconsistencies for the same OS.
 * If question A has correlacao_pergunta_id = question B,
 * and answer_A != answer_B (ignoring both N/A), store an inconsistency record.
 */
export async function detectLinkedInconsistencies(avaliacaoId: string, osId: string) {
  // Get all answers for this evaluation
  const { data: respostas } = await supabase
    .from("respostas_avaliacao")
    .select("pergunta_id, resposta")
    .eq("avaliacao_id", avaliacaoId);

  if (!respostas || respostas.length === 0) return;

  const answerMap = new Map(respostas.map(r => [r.pergunta_id, r.resposta]));
  const perguntaIds = respostas.map(r => r.pergunta_id);

  // Get questions that have a linked inconsistency question
  const { data: perguntas } = await supabase
    .from("perguntas_avaliacao")
    .select("id, correlacao_pergunta_id")
    .in("id", perguntaIds)
    .not("correlacao_pergunta_id", "is", null);

  if (!perguntas || perguntas.length === 0) return;

  for (const p of perguntas) {
    const linkedId = p.correlacao_pergunta_id;
    if (!linkedId) continue;

    const answerA = answerMap.get(p.id);
    const answerB = answerMap.get(linkedId);

    // Skip if either is missing or both are N/A
    if (!answerA || !answerB) continue;
    if (answerA === "na" && answerB === "na") continue;

    // Inconsistency: answers differ
    if (answerA !== answerB) {
      // Check if already exists
      const { data: existing } = await (supabase as any)
        .from("inconsistencias_vinculadas")
        .select("id")
        .eq("ordem_servico_id", osId)
        .eq("pergunta_a_id", p.id)
        .eq("pergunta_b_id", linkedId)
        .eq("avaliacao_id", avaliacaoId)
        .limit(1)
        .single();

      if (!existing) {
        await (supabase as any)
          .from("inconsistencias_vinculadas")
          .insert({
            ordem_servico_id: osId,
            pergunta_a_id: p.id,
            pergunta_b_id: linkedId,
            resposta_a: answerA,
            resposta_b: answerB,
            avaliacao_id: avaliacaoId,
          });
      }
    }
  }
}
