import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { FieldAnswer, SnapshotField, evaluateVisibility, validateField } from "@/components/operational/DynamicFieldRenderer";

export function useAssignmentExecution(assignmentId: string | null) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, FieldAnswer>>({});
  const [dirty, setDirty] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing answers
  const { data: savedAnswers = [] } = useQuery({
    queryKey: ["field_answers", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_field_answers")
        .select("*, profiles:respondido_por(nome)").eq("assignment_id", assignmentId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  // Load reviews for this assignment
  const { data: reviews = [] } = useQuery({
    queryKey: ["field_reviews", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_field_reviews")
        .select("*").eq("assignment_id", assignmentId).order("rodada", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  // Hydrate answers from DB
  useEffect(() => {
    if (!savedAnswers.length) return;
    const map: Record<string, FieldAnswer> = {};
    // Take latest per field_id
    for (const a of savedAnswers) {
      if (!map[a.field_id]) {
        map[a.field_id] = {
          field_id: a.field_id,
          valor_texto: a.valor_texto,
          valor_numero: a.valor_numero,
          valor_booleano: a.valor_booleano,
          valor_data: a.valor_data,
          valor_json: a.valor_json,
          evidencia_url: a.evidencia_url,
          respondido_por_nome: a.profiles?.nome || null,
          respondido_em: a.respondido_em,
          versao: a.versao || 1,
          historico_alteracoes: a.historico_alteracoes || [],
        };
      }
    }
    setAnswers(map);
    setDirty(false);
  }, [savedAnswers]);

  // Track which fields have been logged for interaction
  const loggedFieldsRef = useRef<Set<string>>(new Set());

  const updateAnswer = useCallback((fieldId: string, patch: Partial<FieldAnswer>) => {
    setAnswers(prev => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], field_id: fieldId, ...patch },
    }));
    setDirty(true);

    // Log first interaction with each field
    if (assignmentId && profile?.id && !loggedFieldsRef.current.has(fieldId)) {
      loggedFieldsRef.current.add(fieldId);
      (supabase as any).from("operational_execution_logs").insert({
        assignment_id: assignmentId,
        acao: "preencheu_campo",
        executado_por: profile.id,
        detalhes: { field_id: fieldId, interacted_at: new Date().toISOString() },
      }).then(() => {});
    }
  }, [assignmentId, profile?.id]);

  // Auto-save with debounce (5 seconds)
  useEffect(() => {
    if (!dirty || !assignmentId || !profile?.id) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDraft();
    }, 5000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, dirty, assignmentId, profile?.id]);

  const saveDraft = useCallback(async () => {
    if (!assignmentId || !profile?.id || !dirty) return;
    try {
      const entries = Object.values(answers).filter(a => a.field_id);
      if (entries.length === 0) return;

      // Delete existing answers for this assignment by this user, then re-insert
      // Use upsert-like approach: delete old, insert new
      for (const entry of entries) {
        const now = new Date().toISOString();
        // Check if exists
        const { data: existing } = await (supabase as any).from("operational_field_answers")
          .select("id, versao, historico_alteracoes").eq("assignment_id", assignmentId).eq("field_id", entry.field_id).limit(1);

        if (existing && existing.length > 0) {
          const oldVersao = existing[0].versao || 1;
          const newVersao = oldVersao + 1;
          const oldHistory = existing[0].historico_alteracoes || [];
          const newHistory = [...oldHistory, { nome: profile.nome || "Usuário", data: now, versao: newVersao }];

          await (supabase as any).from("operational_field_answers")
            .update({
              valor_texto: entry.valor_texto ?? null,
              valor_numero: entry.valor_numero ?? null,
              valor_booleano: entry.valor_booleano ?? null,
              valor_data: entry.valor_data ?? null,
              valor_json: entry.valor_json ?? null,
              evidencia_url: entry.evidencia_url ?? null,
              respondido_em: now,
              versao: newVersao,
              historico_alteracoes: newHistory,
            })
            .eq("id", existing[0].id);
        } else {
          const initialHistory = [{ nome: profile.nome || "Usuário", data: now, versao: 1 }];
          await (supabase as any).from("operational_field_answers")
            .insert({
              assignment_id: assignmentId,
              field_id: entry.field_id,
              valor_texto: entry.valor_texto ?? null,
              valor_numero: entry.valor_numero ?? null,
              valor_booleano: entry.valor_booleano ?? null,
              valor_data: entry.valor_data ?? null,
              valor_json: entry.valor_json ?? null,
              evidencia_url: entry.evidencia_url ?? null,
              respondido_por: profile.id,
              historico_alteracoes: initialHistory,
            });
        }
      }
      setDirty(false);
    } catch (e: any) {
      console.error("Auto-save failed:", e);
    }
  }, [assignmentId, profile?.id, answers, dirty]);

  // Validate all visible fields
  const validateAll = useCallback((fields: SnapshotField[], assignmentStatus: string): string[] => {
    const errors: string[] = [];
    for (const f of fields) {
      if (!evaluateVisibility(f.condicao_visibilidade, answers)) continue;
      // If devolvida, only validate returned fields
      if (assignmentStatus === "devolvida") {
        const review = getLatestReview(f.id);
        if (!review?.devolvido) continue;
      }
      const err = validateField(f, answers[f.id]);
      if (err) errors.push(`${f.label}: ${err}`);
    }
    return errors;
  }, [answers, reviews]);

  const getLatestReview = useCallback((fieldId: string) => {
    return reviews.find((r: any) => r.field_id === fieldId);
  }, [reviews]);

  // Submit
  const submit = useMutation({
    mutationFn: async ({ assignment, fields }: { assignment: any; fields: SnapshotField[] }) => {
      if (!profile?.id) throw new Error("Não autenticado");

      // Save all answers first
      await saveDraft();

      const snapshot = assignment.template_snapshot;
      const nextStatus = snapshot?.requer_aprovacao_gestor
        ? "aguardando_avaliacao"
        : "aguardando_avaliacao"; // always goes to evaluation first

      const now = new Date().toISOString();
      const tempoGasto = assignment.inicio_em
        ? Math.round((Date.now() - new Date(assignment.inicio_em).getTime()) / 60000)
        : null;

      const { error } = await (supabase as any).from("operational_assignments")
        .update({
          status: nextStatus,
          fim_em: now,
          tempo_gasto_minutos: tempoGasto,
        }).eq("id", assignment.id);
      if (error) throw error;

      // Calculate time from first view to completion
      const { data: viewLog } = await (supabase as any).from("operational_execution_logs")
        .select("created_at")
        .eq("assignment_id", assignment.id)
        .eq("acao", "visualizou")
        .order("created_at", { ascending: true })
        .limit(1);

      const tempoVisualizacaoAteConclusao = viewLog?.[0]
        ? Math.round((Date.now() - new Date(viewLog[0].created_at).getTime()) / 60000)
        : null;

      await (supabase as any).from("operational_execution_logs").insert({
        assignment_id: assignment.id,
        acao: "enviou_para_avaliacao",
        executado_por: profile.id,
        detalhes: {
          tempo_gasto_minutos: tempoGasto,
          total_campos: Object.keys(answers).length,
          tempo_visualizacao_ate_conclusao_minutos: tempoVisualizacaoAteConclusao,
        },
      });

      await (supabase as any).from("operational_audit_trail").insert({
        assignment_id: assignment.id,
        tipo_evento: "conclusao",
        executado_por: profile.id,
        dados_novos: { status: nextStatus, tempo_gasto_minutos: tempoGasto, tempo_visualizacao_ate_conclusao_minutos: tempoVisualizacaoAteConclusao },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_operational_assignments"] });
      qc.invalidateQueries({ queryKey: ["field_answers"] });
      toast.success("Formulário enviado para avaliação!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Start task
  const startTask = useMutation({
    mutationFn: async (assignmentId: string) => {
      if (!profile?.id) throw new Error("Não autenticado");
      const { error } = await (supabase as any).from("operational_assignments")
        .update({ status: "em_andamento", inicio_em: new Date().toISOString() })
        .eq("id", assignmentId);
      if (error) throw error;
      await (supabase as any).from("operational_execution_logs").insert({
        assignment_id: assignmentId, acao: "iniciou", executado_por: profile.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_operational_assignments"] });
      toast.success("Tarefa iniciada!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return {
    answers,
    reviews,
    dirty,
    updateAnswer,
    saveDraft,
    validateAll,
    getLatestReview,
    submit,
    startTask,
    isSubmitting: submit.isPending,
  };
}