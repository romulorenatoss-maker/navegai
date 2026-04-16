import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { FieldAnswer, SnapshotField, evaluateVisibility, validateField } from "@/components/operational/DynamicFieldRenderer";
import { useOperationalTransition } from "@/hooks/useOperationalTransition";

export function useAssignmentExecution(assignmentId: string | null) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { transition } = useOperationalTransition();
  const [answers, setAnswers] = useState<Record<string, FieldAnswer>>({});
  const [dirty, setDirty] = useState(false);
  const pendingFieldsRef = useRef<Set<string>>(new Set());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // FIX: Use a ref to always access the latest answers in saveFieldsNow
  const answersRef = useRef<Record<string, FieldAnswer>>({});
  answersRef.current = answers;

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

  // Helper: extract display value from an answer for logging
  const getDisplayValue = useCallback((entry: FieldAnswer): string => {
    if (entry.valor_booleano === true) return "Sim / Conforme";
    if (entry.valor_booleano === false) return "Não / Não Conforme";
    if (entry.valor_numero != null) return String(entry.valor_numero);
    if (entry.valor_data) return entry.valor_data;
    if (entry.valor_texto) return entry.valor_texto.length > 80 ? entry.valor_texto.slice(0, 80) + "…" : entry.valor_texto;
    if (entry.valor_json) return JSON.stringify(entry.valor_json).slice(0, 80);
    if (entry.evidencia_url) return "[evidência anexada]";
    return "";
  }, []);

  // Ref to track fields we've logged the first interaction for
  const loggedFieldsRef = useRef<Set<string>>(new Set());
  // Ref to store field labels for detailed logging
  const fieldLabelsRef = useRef<Record<string, string>>({});

  const setFieldLabels = useCallback((fields: SnapshotField[]) => {
    const map: Record<string, string> = {};
    for (const f of fields) map[f.id] = f.label;
    fieldLabelsRef.current = map;
  }, []);

  const updateAnswer = useCallback((fieldId: string, patch: Partial<FieldAnswer>) => {
    setAnswers(prev => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], field_id: fieldId, ...patch },
    }));
    setDirty(true);
    pendingFieldsRef.current.add(fieldId);

    // Auto-save with short debounce (800ms)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveFieldsNow();
    }, 800);
  }, [assignmentId, profile?.id]);

  // Save only pending fields — reads from answersRef to avoid stale closure
  const saveFieldsNow = useCallback(async () => {
    if (!assignmentId || !profile?.id) return;
    const fieldsToSave = Array.from(pendingFieldsRef.current);
    if (fieldsToSave.length === 0) return;
    pendingFieldsRef.current.clear();

    const currentAnswers = answersRef.current;

    try {
      for (const fieldId of fieldsToSave) {
        const entry = currentAnswers[fieldId];
        if (!entry) continue;
        const now = new Date().toISOString();
        const fieldLabel = fieldLabelsRef.current[fieldId] || fieldId;
        const displayValue = getDisplayValue(entry);

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

        // Update local state with save metadata so UI shows immediately
        setAnswers(prev => ({
          ...prev,
          [fieldId]: {
            ...prev[fieldId],
            respondido_por_nome: profile.nome || "Usuário",
            respondido_em: now,
            versao: (prev[fieldId]?.versao || 0) + 1,
            historico_alteracoes: [
              ...(prev[fieldId]?.historico_alteracoes || []),
              { nome: profile.nome || "Usuário", data: now, versao: (prev[fieldId]?.versao || 0) + 1 },
            ],
          },
        }));

        // Detailed execution log per field (first time only to avoid spam)
        if (!loggedFieldsRef.current.has(fieldId)) {
          loggedFieldsRef.current.add(fieldId);
          (supabase as any).from("operational_execution_logs").insert({
            assignment_id: assignmentId,
            acao: "preencheu_campo",
            executado_por: profile.id,
            detalhes: {
              field_id: fieldId,
              field_label: fieldLabel,
              valor: displayValue,
              respondido_em: now,
            },
          }).then(() => refetchLogs());
        }
      }
      setDirty(false);
    } catch (e: any) {
      console.error("Auto-save failed:", e);
      // Re-add fields that failed so they retry
      for (const fid of fieldsToSave) pendingFieldsRef.current.add(fid);
    }
  }, [assignmentId, profile?.id, profile?.nome, getDisplayValue, refetchLogs]);

  // Keep saveDraft for close/submit compatibility
  const saveDraft = useCallback(async () => {
    const currentAnswers = answersRef.current;
    const allFieldIds = Object.keys(currentAnswers).filter(fid => currentAnswers[fid]?.field_id);
    for (const fid of allFieldIds) pendingFieldsRef.current.add(fid);
    await saveFieldsNow();
  }, [saveFieldsNow]);

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

      const now = new Date().toISOString();
      const tempoGasto = assignment.inicio_em
        ? Math.round((Date.now() - new Date(assignment.inicio_em).getTime()) / 60000)
        : null;

      // Check if late based on last mandatory field timestamp
      const currentAnswers = answersRef.current;
      let ultimoCampoObrigatorio: string | null = null;
      let ultimoTimestamp: string | null = null;

      for (const f of fields) {
        if (!f.obrigatorio) continue;
        const ans = currentAnswers[f.id];
        if (ans?.respondido_em) {
          if (!ultimoTimestamp || ans.respondido_em > ultimoTimestamp) {
            ultimoTimestamp = ans.respondido_em;
            ultimoCampoObrigatorio = f.label;
          }
        }
      }

      const atrasado = (() => {
        if (!assignment.horario_limite || !assignment.data_prevista) return false;
        const limite = new Date(`${assignment.data_prevista}T${assignment.horario_limite}`);
        const referencia = ultimoTimestamp ? new Date(ultimoTimestamp) : new Date();
        return referencia > limite;
      })();

      // Use centralized transition
      await transition.mutateAsync({
        assignmentId: assignment.id,
        action: "enviar_avaliacao",
        origem: "execucao",
        extraData: { tempoGasto, atrasado },
      });

      // Detailed submit log
      await (supabase as any).from("operational_execution_logs").insert({
        assignment_id: assignment.id,
        acao: "enviou_para_avaliacao",
        executado_por: profile.id,
        detalhes: {
          tempo_gasto_minutos: tempoGasto,
          total_campos: Object.keys(currentAnswers).length,
          atrasado,
          enviado_em: now,
          ultimo_campo_obrigatorio: ultimoCampoObrigatorio,
          ultimo_timestamp_campo: ultimoTimestamp,
        },
      });

      // Log late completion if applicable
      if (atrasado && assignment.horario_limite && assignment.data_prevista) {
        const limite = new Date(`${assignment.data_prevista}T${assignment.horario_limite}`);
        const ref = ultimoTimestamp ? new Date(ultimoTimestamp) : new Date();
        const diffMin = Math.round((ref.getTime() - limite.getTime()) / 60000);

        await (supabase as any).from("operational_execution_logs").insert({
          assignment_id: assignment.id,
          acao: "TAREFA_ATRASADA",
          executado_por: profile.id,
          detalhes: {
            prazo_esperado: limite.toISOString(),
            horario_real_conclusao: ref.toISOString(),
            atraso_minutos: diffMin,
            campo_final: ultimoCampoObrigatorio,
          },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_operational_assignments"] });
      qc.invalidateQueries({ queryKey: ["field_answers"] });
      toast.success("Formulário enviado para avaliação!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Start task — with late-start detection
  const startTask = useMutation({
    mutationFn: async (args: string | { assignmentId: string; horarioInicioPrevisto?: string | null; dataPrevista?: string | null }) => {
      if (!profile?.id) throw new Error("Não autenticado");

      const aId = typeof args === "string" ? args : args.assignmentId;
      const horarioInicio = typeof args === "string" ? null : args.horarioInicioPrevisto;
      const dataPrevista = typeof args === "string" ? null : args.dataPrevista;

      const now = new Date().toISOString();
      const { error } = await (supabase as any).from("operational_assignments")
        .update({ status: "em_andamento", inicio_em: now })
        .eq("id", aId);
      if (error) throw error;

      await (supabase as any).from("operational_execution_logs").insert({
        assignment_id: aId,
        acao: "iniciou",
        executado_por: profile.id,
        detalhes: { iniciado_em: now },
      });

      // Check late start
      if (horarioInicio && dataPrevista) {
        const esperado = new Date(`${dataPrevista}T${horarioInicio}`);
        const agora = new Date(now);
        if (agora > esperado) {
          const diffMin = Math.round((agora.getTime() - esperado.getTime()) / 60000);
          await (supabase as any).from("operational_execution_logs").insert({
            assignment_id: aId,
            acao: "INICIO_FORA_DO_PRAZO",
            executado_por: profile.id,
            detalhes: {
              horario_esperado: esperado.toISOString(),
              horario_real_inicio: now,
              atraso_minutos: diffMin,
            },
          });
        }
      }
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
    setFieldLabels,
  };
}
