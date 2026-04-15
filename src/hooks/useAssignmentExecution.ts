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
        .select("*").eq("assignment_id", assignmentId).order("created_at", { ascending: false });
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
        };
      }
    }
    setAnswers(map);
    setDirty(false);
  }, [savedAnswers]);

  const updateAnswer = useCallback((fieldId: string, patch: Partial<FieldAnswer>) => {
    setAnswers(prev => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], field_id: fieldId, ...patch },
    }));
    setDirty(true);
  }, []);

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
        // Check if exists
        const { data: existing } = await (supabase as any).from("operational_field_answers")
          .select("id").eq("assignment_id", assignmentId).eq("field_id", entry.field_id).limit(1);

        if (existing && existing.length > 0) {
          await (supabase as any).from("operational_field_answers")
            .update({
              valor_texto: entry.valor_texto ?? null,
              valor_numero: entry.valor_numero ?? null,
              valor_booleano: entry.valor_booleano ?? null,
              valor_data: entry.valor_data ?? null,
              valor_json: entry.valor_json ?? null,
              evidencia_url: entry.evidencia_url ?? null,
              respondido_em: new Date().toISOString(),
            })
            .eq("id", existing[0].id);
        } else {
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

      await (supabase as any).from("operational_execution_logs").insert({
        assignment_id: assignment.id,
        acao: "enviou_para_avaliacao",
        executado_por: profile.id,
        detalhes: { tempo_gasto_minutos: tempoGasto, total_campos: Object.keys(answers).length },
      });

      await (supabase as any).from("operational_audit_trail").insert({
        assignment_id: assignment.id,
        tipo_evento: "conclusao",
        executado_por: profile.id,
        dados_novos: { status: nextStatus, tempo_gasto_minutos: tempoGasto },
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