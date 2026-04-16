import { useState, useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { SnapshotField } from "@/components/operational/DynamicFieldRenderer";
import { useOperationalTransition } from "@/hooks/useOperationalTransition";

export interface ScoreBreakdown {
  executor: { pontualidade: number; conformidade: number; evidencia: number; sla: number; final: number } | null;
  avaliado: { pesoTotal: number; pesoAcertado: number; final: number } | null;
  avaliador: { prazo: number; completude: number; final: number } | null;
  finalConsolidado: number;
}

export interface OverrideDraft {
  tipo: string;
  score_original: number;
  score_ajustado: number;
  justificativa: string;
}

export interface ApproverAnswerDraft {
  field_id: string;
  resposta: string; // conforme | nao_conforme | na
  observacao: string;
  peso: number;
}

export function useApprovalFlow(assignmentId: string | null) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { transition } = useOperationalTransition();
  const [overrideDraft, setOverrideDraft] = useState<OverrideDraft | null>(null);
  const [approverAnswers, setApproverAnswers] = useState<Record<string, ApproverAnswerDraft>>({});

  // Load field answers
  const { data: fieldAnswers = [] } = useQuery({
    queryKey: ["approval_field_answers", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_field_answers")
        .select("*").eq("assignment_id", assignmentId);
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  // Load field reviews
  const { data: fieldReviews = [] } = useQuery({
    queryKey: ["approval_field_reviews", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_field_reviews")
        .select("*").eq("assignment_id", assignmentId).order("rodada", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  // Load contingencies
  const { data: contingencies = [] } = useQuery({
    queryKey: ["approval_contingencies", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_contingencies")
        .select("*").eq("assignment_id", assignmentId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  // Load existing overrides
  const { data: existingOverrides = [] } = useQuery({
    queryKey: ["approval_overrides", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_score_overrides")
        .select("*, aprovador:profiles!operational_score_overrides_aprovador_id_fkey(nome)")
        .eq("assignment_id", assignmentId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  // Load audit trail
  const { data: auditTrail = [] } = useQuery({
    queryKey: ["approval_audit_trail", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_audit_trail")
        .select("*, executor:profiles!operational_audit_trail_executado_por_fkey(nome)")
        .eq("assignment_id", assignmentId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  // Load existing approval answers
  const { data: existingApprovalAnswers = [] } = useQuery({
    queryKey: ["approval_answers", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_approval_answers")
        .select("*").eq("assignment_id", assignmentId);
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  // Load contingency resolution logs for timeline
  const { data: contingencyLogs = [] } = useQuery({
    queryKey: ["approval_contingency_logs", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      // Get contingency IDs for this assignment
      const contIds = contingencies.map((c: any) => c.id);
      if (contIds.length === 0) return [];
      const { data, error } = await (supabase as any).from("operational_contingency_resolution_logs")
        .select("*, executor:profiles!operational_contingency_resolution_logs_executado_por_fkey(nome)")
        .in("contingency_id", contIds).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId && contingencies.length > 0,
  });

  // Hydrate approver answers from existing
  useState(() => {
    // This will be handled via useEffect below
  });

  // Check pending contingencies
  const pendingContingencies = useMemo(() =>
    contingencies.filter((c: any) => !["validada", "descartada"].includes(c.status)),
    [contingencies]
  );

  const canAnswerApproverQuestions = pendingContingencies.length === 0;

  // Update approver answer draft
  const updateApproverAnswer = useCallback((fieldId: string, patch: Partial<ApproverAnswerDraft>) => {
    setApproverAnswers(prev => ({
      ...prev,
      [fieldId]: {
        ...prev[fieldId],
        field_id: fieldId,
        resposta: prev[fieldId]?.resposta ?? "conforme",
        observacao: prev[fieldId]?.observacao ?? "",
        peso: prev[fieldId]?.peso ?? 1,
        ...patch,
      },
    }));
  }, []);

  // Save approver answers
  const saveApproverAnswers = useMutation({
    mutationFn: async (fields: SnapshotField[]) => {
      if (!profile?.id || !assignmentId) throw new Error("Não autenticado");
      if (!canAnswerApproverQuestions) throw new Error("Existem contingências pendentes. Resolva-as antes de responder.");

      const approverFields = fields.filter(f => f.aprovador_pergunta);
      for (const f of approverFields) {
        const draft = approverAnswers[f.id];
        if (!draft) continue;

        const payload = {
          assignment_id: assignmentId,
          field_id: f.id,
          resposta: draft.resposta,
          observacao: draft.observacao || null,
          peso: f.aprovador_peso || 1,
          respondido_por: profile.id,
          respondido_em: new Date().toISOString(),
        };

        const existing = existingApprovalAnswers.find((a: any) => a.field_id === f.id);
        if (existing) {
          await (supabase as any).from("operational_approval_answers").update(payload).eq("id", existing.id);
        } else {
          await (supabase as any).from("operational_approval_answers").insert(payload);
        }
      }

      await (supabase as any).from("operational_audit_trail").insert({
        assignment_id: assignmentId,
        tipo_evento: "aprovador_respondeu_perguntas",
        executado_por: profile.id,
        dados_novos: { total_respostas: Object.keys(approverAnswers).length },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approval_answers"] });
      toast.success("Respostas do aprovador salvas!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Calculate score breakdown from snapshot + reviews
  const calculateBreakdown = useCallback((assignment: any, snapshotFields: SnapshotField[]): ScoreBreakdown => {
    // Executor score from assignment columns
    const executor = {
      pontualidade: Number(assignment.score_executor) || 0,
      conformidade: 0,
      evidencia: 0,
      sla: 0,
      final: Number(assignment.score_executor) || 0,
    };

    // Avaliado score: weighted from reviews
    const latestReviews: Record<string, any> = {};
    for (const r of fieldReviews) {
      if (!latestReviews[r.field_id]) latestReviews[r.field_id] = r;
    }

    let pesoTotal = 0;
    let pesoAcertado = 0;
    for (const field of snapshotFields) {
      const rev = latestReviews[field.id];
      const peso = field.peso ?? 1;
      const notaMax = field.nota_maxima ?? 10;
      pesoTotal += peso * notaMax;
      if (rev?.conforme === true) {
        pesoAcertado += peso * notaMax;
      }
    }

    const avaliadoFinal = pesoTotal > 0 ? Math.round((pesoAcertado / pesoTotal) * 100) : 0;
    const avaliado = { pesoTotal, pesoAcertado, final: avaliadoFinal };

    // Avaliador score from assignment columns
    const avaliador = {
      prazo: 0,
      completude: 0,
      final: Number(assignment.score_avaliador) || 0,
    };

    // Final consolidated: use score_final_ajustado if exists (nullish check to respect 0), else average
    const calculado = Math.round((executor.final + avaliado.final + avaliador.final) / 3);
    const finalConsolidado = assignment.score_final_ajustado != null
      ? Number(assignment.score_final_ajustado)
      : calculado;

    return { executor, avaliado, avaliador, finalConsolidado };
  }, [fieldReviews]);

  // Per-section score breakdown
  const sectionScores = useCallback((snapshotFields: SnapshotField[], sections: any[]) => {
    const latestReviews: Record<string, any> = {};
    for (const r of fieldReviews) {
      if (!latestReviews[r.field_id]) latestReviews[r.field_id] = r;
    }

    return sections.map((s: any) => {
      const sFields = snapshotFields.filter(f => f.section_id === s.id);
      let pesoTotal = 0;
      let pesoAcertado = 0;
      let conformes = 0;
      let naoConformes = 0;

      for (const f of sFields) {
        const rev = latestReviews[f.id];
        const peso = f.peso ?? 1;
        const notaMax = f.nota_maxima ?? 10;
        pesoTotal += peso * notaMax;
        if (rev?.conforme === true) {
          pesoAcertado += peso * notaMax;
          conformes++;
        } else if (rev?.conforme === false) {
          naoConformes++;
        }
      }

      const score = pesoTotal > 0 ? Math.round((pesoAcertado / pesoTotal) * 100) : 0;
      return { ...s, score, conformes, naoConformes, totalFields: sFields.length };
    });
  }, [fieldReviews]);

  // Check blocking conditions
  const getBlockingReasons = useCallback((assignment: any): string[] => {
    const reasons: string[] = [];
    const snapshot = assignment?.template_snapshot;

    // Block if open contingencies exist and template requires it
    if (snapshot?.bloquear_fechamento_contingencia) {
      const openContingencies = contingencies.filter((c: any) => !["validada", "descartada", "resolvida"].includes(c.status));
      if (openContingencies.length > 0) {
        reasons.push(`${openContingencies.length} contingência(s) aberta(s) impedem a aprovação.`);
      }
    }

    // Block if review is incomplete
    const snapshotFields: SnapshotField[] = snapshot?.fields || [];
    const latestReviews: Record<string, any> = {};
    for (const r of fieldReviews) {
      if (!latestReviews[r.field_id]) latestReviews[r.field_id] = r;
    }
    const unreviewedRequired = snapshotFields.filter(f => f.obrigatorio !== false && !latestReviews[f.id]);
    if (unreviewedRequired.length > 0) {
      reasons.push(`${unreviewedRequired.length} campo(s) obrigatório(s) sem avaliação.`);
    }

    return reasons;
  }, [contingencies, fieldReviews]);

  // Save override
  const saveOverride = useMutation({
    mutationFn: async (draft: OverrideDraft) => {
      if (!profile?.id || !assignmentId) throw new Error("Não autenticado");

      const { error } = await (supabase as any).from("operational_score_overrides").insert({
        assignment_id: assignmentId,
        tipo: draft.tipo,
        score_original: draft.score_original,
        score_ajustado: draft.score_ajustado,
        diferenca: draft.score_ajustado - draft.score_original,
        justificativa: draft.justificativa,
        aprovador_id: profile.id,
      });
      if (error) throw error;

      // Update assignment with adjusted score
      await (supabase as any).from("operational_assignments")
        .update({ score_final_ajustado: draft.score_ajustado })
        .eq("id", assignmentId);

      // Audit trail
      await (supabase as any).from("operational_audit_trail").insert({
        assignment_id: assignmentId,
        tipo_evento: "ajuste_score",
        executado_por: profile.id,
        motivo: draft.justificativa,
        dados_anteriores: { score: draft.score_original },
        dados_novos: { score: draft.score_ajustado, tipo: draft.tipo },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approval_overrides"] });
      qc.invalidateQueries({ queryKey: ["aprovacao_assignments"] });
      toast.success("Override de score aplicado!");
      setOverrideDraft(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Final decision
  const finalDecision = useMutation({
    mutationFn: async ({ assignment, action, motivo, scoreFinal }: { assignment: any; action: "aprovar" | "reprovar_devolver" | "encerrar"; motivo?: string; scoreFinal?: number }) => {
      if (!profile?.id || !assignmentId) throw new Error("Não autenticado");

      // Backend-side blocking enforcement
      const blockReasons = getBlockingReasons(assignment);
      if (action === "aprovar" && blockReasons.length > 0) {
        throw new Error(`Bloqueado: ${blockReasons.join(" ")}`);
      }
      if (action !== "aprovar" && !motivo?.trim()) {
        throw new Error("Justificativa obrigatória para esta ação.");
      }

      // Map to centralized transition action
      let transitionAction: "aprovar_final" | "reprovar_devolver_final" | "encerrar_final";
      switch (action) {
        case "aprovar": transitionAction = "aprovar_final"; break;
        case "reprovar_devolver": transitionAction = "reprovar_devolver_final"; break;
        case "encerrar": transitionAction = "encerrar_final"; break;
      }

      // Calculate score if not provided
      let finalScore = scoreFinal;
      if ((action === "aprovar" || action === "encerrar") && finalScore == null) {
        const existingOverride = assignment.score_final_ajustado;
        if (existingOverride == null) {
          finalScore = Math.round(
            ((Number(assignment.score_executor) || 0) +
             (Number(assignment.score_avaliado) || 0) +
             (Number(assignment.score_avaliador) || 0)) / 3
          );
        }
      }

      // Use centralized transition
      await transition.mutateAsync({
        assignmentId,
        action: transitionAction,
        motivo,
        origem: "aprovacao_final",
        extraData: {
          aprovadorId: profile.id,
          scoreFinal: finalScore,
          rodadaAtual: assignment.rodada_atual,
        },
      });

      await (supabase as any).from("operational_execution_logs").insert({
        assignment_id: assignmentId,
        acao: `aprovador_${action}`,
        executado_por: profile.id,
        detalhes: { action, motivo: motivo || null, rodada: assignment.rodada_atual },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["aprovacao_assignments"] });
      toast.success("Decisão registrada com sucesso!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return {
    fieldAnswers,
    fieldReviews,
    contingencies,
    contingencyLogs,
    existingOverrides,
    existingApprovalAnswers,
    auditTrail,
    overrideDraft,
    setOverrideDraft,
    approverAnswers,
    updateApproverAnswer,
    saveApproverAnswers,
    pendingContingencies,
    canAnswerApproverQuestions,
    calculateBreakdown,
    sectionScores,
    getBlockingReasons,
    saveOverride,
    finalDecision,
    isSaving: saveOverride.isPending || finalDecision.isPending || saveApproverAnswers.isPending,
  };
}
