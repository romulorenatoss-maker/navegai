import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { detectInconsistencies } from "@/hooks/useInconsistencyDetection";
import { detectLinkedInconsistencies } from "@/hooks/useLinkedInconsistencyDetection";

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

export interface CreateOSExtras {
  cliente_nome?: string | null;
  cliente_cpf?: string | null;
  tipo_servico_id?: string | null;
  colaborador_avaliado_id?: string | null;
  cliente_id?: string | null;
}

export function useAvaliacaoOS() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [os, setOs] = useState<OSData | null>(null);
  const [avaliacao, setAvaliacao] = useState<AvaliacaoData | null>(null);
  const [questions, setQuestions] = useState<QuestionState[]>([]);

  const searchOS = async (query: string, autoCreate = false, extras?: CreateOSExtras) => {
    setLoading(true);
    try {
      // Search existing OS by numero_os only
      const { data: existing } = await supabase
        .from("ordens_servico")
        .select("*")
        .eq("numero_os", query)
        .limit(1)
        .single();

      if (existing) {
        setOs(existing as OSData);
        await loadOrCreateAvaliacao(existing.id);
        if (autoCreate) {
          toast.info("OS já existe. Abrindo avaliação existente.");
        }
        return;
      }

      if (!autoCreate) {
        toast.info("Nenhuma OS encontrada com esse número.");
        setOs(null);
        setAvaliacao(null);
        setQuestions([]);
        return;
      }

      // Create new OS with extras
      const { data: newOs, error } = await supabase
        .from("ordens_servico")
        .insert({
          numero_os: query,
          cliente_nome: extras?.cliente_nome || null,
          cliente_cpf: extras?.cliente_cpf || null,
          tipo_servico_id: extras?.tipo_servico_id || null,
          colaborador_avaliado_id: extras?.colaborador_avaliado_id || null,
          cliente_id: extras?.cliente_id || null,
        })
        .select()
        .single();

      if (error) throw error;
      setOs(newOs as OSData);
      await loadOrCreateAvaliacao(newOs.id);
      toast.success("OS criada com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao buscar/criar OS: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadOrCreateAvaliacao = async (osId: string) => {
    if (!profile) return;

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
      await loadQuestions(existingAval.id, profile.id, osId);
      return;
    }

    const { data: newAval, error } = await supabase
      .from("avaliacoes")
      .insert({ ordem_servico_id: osId, avaliador_id: profile.id })
      .select()
      .single();

    if (error) {
      toast.error("Erro ao criar avaliação: " + error.message);
      return;
    }

    await supabase
      .from("ordens_servico")
      .update({ status: "em_andamento" })
      .eq("id", osId)
      .eq("status", "aberta");

    setAvaliacao(newAval as AvaliacaoData);
    await loadQuestions(newAval.id, profile.id, osId);
  };

  const loadQuestions = async (avaliacaoId: string, profileId: string, osId: string) => {
    // Load questions from os_perguntas (frozen snapshot per OS)
    const { data: osPerguntas } = await (supabase as any)
      .from("os_perguntas")
      .select("pergunta_id")
      .eq("os_id", osId);

    if (!osPerguntas?.length) {
      setQuestions([]);
      return;
    }

    const perguntaIds = osPerguntas.map((op: any) => op.pergunta_id);
    const { data: perguntas } = await supabase
      .from("perguntas_avaliacao")
      .select("*")
      .in("id", perguntaIds)
      .order("ordem");

    if (!perguntas) return;

    // Load responses by ordem_servico_id (shared across all evaluators) - only needed fields
    const { data: respostas } = await supabase
      .from("respostas_avaliacao")
      .select("pergunta_id, resposta, observacao, evidencia_url")
      .eq("ordem_servico_id", osId);

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
    if (!avaliacao || !os) return;

    setQuestions((prev) =>
      prev.map((q) => (q.pergunta_id === perguntaId ? { ...q, answer } : q))
    );

    await supabase.from("respostas_avaliacao").upsert(
      {
        ordem_servico_id: os.id,
        pergunta_id: perguntaId,
        resposta: answer,
        avaliacao_id: avaliacao.id,
        avaliador_id: profile?.id,
      } as any,
      { onConflict: "ordem_servico_id,pergunta_id" }
    );
  };

  const updateObservation = async (perguntaId: string, observation: string) => {
    if (!avaliacao || !os) return;

    setQuestions((prev) =>
      prev.map((q) => (q.pergunta_id === perguntaId ? { ...q, observation } : q))
    );

    await supabase.from("respostas_avaliacao").upsert(
      {
        ordem_servico_id: os.id,
        pergunta_id: perguntaId,
        observacao: observation,
        avaliacao_id: avaliacao.id,
        avaliador_id: profile?.id,
      } as any,
      { onConflict: "ordem_servico_id,pergunta_id" }
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
      .update({ concluida: true, nota_final: nota, concluida_em: new Date().toISOString() })
      .eq("id", avaliacao.id);

    if (error) {
      toast.error("Erro ao concluir: " + error.message);
      return;
    }

    setAvaliacao({ ...avaliacao, concluida: true, nota_final: nota });
    toast.success(`Avaliação concluída! Nota: ${nota.toFixed(1)}%`);
    
    // Detect inconsistencies
    try { await detectInconsistencies(os.id); } catch (e) { console.warn("Inconsistency detection error:", e); }
    try { if (avaliacao) await detectLinkedInconsistencies(avaliacao.id, os.id); } catch (e) { console.warn("Linked inconsistency detection error:", e); }
  };

  const answeredCount = questions.filter((q) => q.answer !== null).length;
  const totalScore = questions.reduce((acc, q) => (q.answer === "sim" ? acc + q.peso : acc), 0);
  const maxScore = questions.reduce(
    (acc, q) => (q.answer !== "na" && q.answer !== null ? acc + q.peso : acc),
    0
  );

  const clearOS = () => {
    setOs(null);
    setAvaliacao(null);
    setQuestions([]);
  };

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
    clearOS,
  };
}
