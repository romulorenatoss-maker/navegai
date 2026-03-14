import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type Answer = "sim" | "nao" | "na" | null;

export interface QuestionState {
  pergunta_id: string;
  texto: string;
  peso: number;
  ordem: number;
  answer: Answer;
  observation: string;
  evidencia_url: string | null;
}

export interface OSData {
  id: string;
  numero_os: string;
  cliente_nome: string | null;
  cliente_cpf: string | null;
  status: string;
  data_abertura: string;
  tipo_servico_id: string | null;
  colaborador_avaliado_id: string | null;
}

export interface AvaliacaoData {
  id: string;
  concluida: boolean;
  nota_final: number | null;
}

export function useAvaliacaoOS() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [os, setOs] = useState<OSData | null>(null);
  const [avaliacao, setAvaliacao] = useState<AvaliacaoData | null>(null);
  const [questions, setQuestions] = useState<QuestionState[]>([]);

  const searchOS = async (query: string) => {
    setLoading(true);
    try {
      // Search existing OS
      const { data: existing } = await supabase
        .from("ordens_servico")
        .select("*")
        .or(`numero_os.eq.${query},cliente_cpf.eq.${query},cliente_nome.ilike.%${query}%`)
        .limit(1)
        .single();

      if (existing) {
        setOs(existing as OSData);
        await loadOrCreateAvaliacao(existing.id);
        return;
      }

      // OS doesn't exist, create it
      const { data: newOs, error } = await supabase
        .from("ordens_servico")
        .insert({ numero_os: query, cliente_nome: null, cliente_cpf: null })
        .select()
        .single();

      if (error) throw error;
      setOs(newOs as OSData);
      await loadOrCreateAvaliacao(newOs.id);
    } catch (err: any) {
      toast.error("Erro ao buscar OS: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadOrCreateAvaliacao = async (osId: string) => {
    if (!profile) return;

    // Check if avaliacao exists for this evaluator
    const { data: existingAval } = await supabase
      .from("avaliacoes")
      .select("*")
      .eq("ordem_servico_id", osId)
      .eq("avaliador_id", profile.id)
      .single();

    if (existingAval) {
      setAvaliacao(existingAval as AvaliacaoData);
      if (existingAval.concluida) {
        toast.info("Esta avaliação já foi concluída por você.");
      }
      await loadQuestions(existingAval.id, profile.id);
      return;
    }

    // Create new avaliacao
    const { data: newAval, error } = await supabase
      .from("avaliacoes")
      .insert({ ordem_servico_id: osId, avaliador_id: profile.id })
      .select()
      .single();

    if (error) {
      toast.error("Erro ao criar avaliação: " + error.message);
      return;
    }

    // Update OS status to em_andamento
    await supabase
      .from("ordens_servico")
      .update({ status: "em_andamento" })
      .eq("id", osId)
      .eq("status", "aberta");

    setAvaliacao(newAval as AvaliacaoData);
    await loadQuestions(newAval.id, profile.id);
  };

  const loadQuestions = async (avaliacaoId: string, profileId: string) => {
    // Get questions assigned to this evaluator
    const { data: perguntas } = await supabase
      .from("perguntas_avaliacao")
      .select("*")
      .eq("ativo", true)
      .or(`avaliador_id.eq.${profileId},avaliador_id.is.null`)
      .order("ordem");

    if (!perguntas) return;

    // Get existing answers
    const { data: respostas } = await supabase
      .from("respostas_avaliacao")
      .select("*")
      .eq("avaliacao_id", avaliacaoId);

    const respostasMap = new Map(respostas?.map((r) => [r.pergunta_id, r]) || []);

    setQuestions(
      perguntas.map((p) => {
        const resp = respostasMap.get(p.id);
        return {
          pergunta_id: p.id,
          texto: p.pergunta,
          peso: p.peso,
          ordem: p.ordem,
          answer: (resp?.resposta as Answer) || null,
          observation: resp?.observacao || "",
          evidencia_url: resp?.evidencia_url || null,
        };
      })
    );
  };

  const updateAnswer = async (perguntaId: string, answer: Answer) => {
    if (!avaliacao) return;

    setQuestions((prev) =>
      prev.map((q) => (q.pergunta_id === perguntaId ? { ...q, answer } : q))
    );

    await supabase.from("respostas_avaliacao").upsert(
      {
        avaliacao_id: avaliacao.id,
        pergunta_id: perguntaId,
        resposta: answer,
      },
      { onConflict: "avaliacao_id,pergunta_id" }
    );
  };

  const updateObservation = async (perguntaId: string, observation: string) => {
    if (!avaliacao) return;

    setQuestions((prev) =>
      prev.map((q) => (q.pergunta_id === perguntaId ? { ...q, observation } : q))
    );

    await supabase.from("respostas_avaliacao").upsert(
      {
        avaliacao_id: avaliacao.id,
        pergunta_id: perguntaId,
        observacao: observation,
      },
      { onConflict: "avaliacao_id,pergunta_id" }
    );
  };

  const concludeAvaliacao = async () => {
    if (!avaliacao || !os) return;

    const answeredQuestions = questions.filter((q) => q.answer !== null);
    if (answeredQuestions.length < questions.length) {
      toast.error("Responda todas as perguntas antes de concluir.");
      return;
    }

    const totalWeight = questions.reduce(
      (acc, q) => (q.answer !== "na" ? acc + q.peso : acc),
      0
    );
    const earnedWeight = questions.reduce(
      (acc, q) => (q.answer === "sim" ? acc + q.peso : acc),
      0
    );
    const nota = totalWeight > 0 ? (earnedWeight / totalWeight) * 100 : 0;

    const { error } = await supabase
      .from("avaliacoes")
      .update({ concluida: true, nota_final: nota })
      .eq("id", avaliacao.id);

    if (error) {
      toast.error("Erro ao concluir: " + error.message);
      return;
    }

    setAvaliacao({ ...avaliacao, concluida: true, nota_final: nota });
    toast.success(`Avaliação concluída! Nota: ${nota.toFixed(1)}%`);
  };

  const answeredCount = questions.filter((q) => q.answer !== null).length;
  const totalScore = questions.reduce((acc, q) => (q.answer === "sim" ? acc + q.peso : acc), 0);
  const maxScore = questions.reduce(
    (acc, q) => (q.answer !== "na" && q.answer !== null ? acc + q.peso : acc),
    0
  );

  return {
    loading,
    os,
    avaliacao,
    questions,
    searchOS,
    updateAnswer,
    updateObservation,
    concludeAvaliacao,
    answeredCount,
    totalScore,
    maxScore,
  };
}
