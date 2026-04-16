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
  const pendingFieldsRef = useRef<Set<string>>(new Set());
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

  // Load execution logs (audit trail)
  const { data: executionLogs = [], refetch: refetchLogs } = useQuery({
    queryKey: ["execution_logs", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_execution_logs")
        .select("*, profiles:executado_por(nome)")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  // Hydrate answers from DB
  useEffect(() => {
    if (!savedAnswers.length) return;
    const map: Record<string, FieldAnswer> = {};
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

  const loggedFieldsRef = useRef<Set<string>>(new Set());

  const updateAnswer = useCallback((fieldId: string, patch: Partial<FieldAnswer>) => {
    setAnswers(prev => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], field_id: fieldId, ...patch },
    }));
    setDirty(true);
    pendingFieldsRef.current.add(fieldId);

    // Log first interaction with each field
    if (assignmentId && profile?.id && !loggedFieldsRef.current.has(fieldId)) {
      loggedFieldsRef.current.add(fieldId);
      (supabase as any).from("operational_execution_logs").insert({
        assignment_id: assignmentId,
        acao: "preencheu_campo",
        executado_por: profile.id,
        detalhes: { field_id: fieldId, interacted_at: new Date().toISOString() },
      }).then(() => refetchLogs());
    }

    // Auto-save with short debounce (800ms) for real-time feel
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveFieldsNow();
    }, 800);
  }, [assignmentId, profile?.id]);

  // Save only pending fields
  const saveFieldsNow = useCallback(async () => {
    if (!assignmentId || !profile?.id) return;
    const fieldsToSave = Array.from(pendingFieldsRef.current);
    if (fieldsToSave.length === 0) return;
    pendingFieldsRef.current.clear();

    try {
      for (const fieldId of fieldsToSave) {
        const entry = answers[fieldId];
        if (!entry) continue;
        const now = new Date().toISOString();

        const { data: existing } = await (supabase as any).from("operational_field_answers")
          .select("id, versao, historico_alteracoes").eq("assignment_id", assignmentId).eq("field_id", fieldId).limit(1);

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
              field_id: fieldId,
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
  }, [assignmentId, profile?.id, answers]);

  // Keep saveDraft for close/submit compatibility
  const saveDraft = useCallback(async () => {
    // Force save all dirty fields
    const allFieldIds = Object.keys(answers).filter(fid => answers[fid]?.field_id);
    for (const fid of allFieldIds) pendingFieldsRef.current.add(fid);
    await saveFieldsNow();
  }, [answers, saveFieldsNow]);

  // Validate all visible fields
  const validateAll = useCallback((fields: SnapshotField[], assignmentStatus: string): string[] => {
    const errors: string[] = [];
    for (const f of fields) {
      if (!evaluateVisibility(f.condicao_visibilidade, answers)) continue;
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

      await saveDraft();

      const snapshot = assignment.template_snapshot;
      const nextStatus = "aguardando_avaliacao";

      const now = new Date().toISOString();
      const tempoGasto = assignment.inicio_em
        ? Math.round((Date.now() - new Date(assignment.inicio_em).getTime()) / 60000)
        : null;

      // Check if late
      const atrasado = (() => {
        if (!assignment.horario_limite || !assignment.data_prevista) return false;
        const limite = new Date(`${assignment.data_prevista}T${assignment.horario_limite}`);
        return new Date() > limite;
      })();

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
        detalhes: {
          tempo_gasto_minutos: tempoGasto,
          total_campos: Object.keys(answers).length,
          atrasado,
          enviado_em: now,
        },
      });

      await (supabase as any).from("operational_audit_trail").insert({
        assignment_id: assignment.id,
        tipo_evento: "conclusao",
        executado_por: profile.id,
        dados_novos: { status: nextStatus, tempo_gasto_minutos: tempoGasto, atrasado },
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
      const now = new Date().toISOString();
      const { error } = await (supabase as any).from("operational_assignments")
        .update({ status: "em_andamento", inicio_em: now })
        .eq("id", assignmentId);
      if (error) throw error;
      await (supabase as any).from("operational_execution_logs").insert({
        assignment_id: assignmentId,
        acao: "iniciou",
        executado_por: profile.id,
        detalhes: { iniciado_em: now },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_operational_assignments"] });
      refetchLogs();
      toast.success("Tarefa iniciada!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return {
    answers,
    reviews,
    dirty,
    executionLogs,
    updateAnswer,
    saveDraft,
    validateAll,
    getLatestReview,
    submit,
    startTask,
    isSubmitting: submit.isPending,
    refetchLogs,
  };
}
