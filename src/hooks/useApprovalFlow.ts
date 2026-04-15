import { useState, useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { SnapshotField } from "@/components/operational/DynamicFieldRenderer";

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

export function useApprovalFlow(assignmentId: string | null) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [overrideDraft, setOverrideDraft] = useState<OverrideDraft | null>(null);

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

      const now = new Date().toISOString();

      let newStatus: string;
      let newRodada = assignment.rodada_atual;

      switch (action) {
        case "aprovar":
          newStatus = "aprovada";
          break;
        case "reprovar_devolver":
          newStatus = "devolvida";
          newRodada = assignment.rodada_atual + 1;
          break;
        case "encerrar":
          newStatus = "concluida";
          break;
        default:
          newStatus = "aprovada";
      }

      // Build update payload — always persist score on approval/encerrar
      const updatePayload: any = {
        status: newStatus,
        rodada_atual: newRodada,
        aprovador_id: profile.id,
        updated_at: now,
      };

      if (action === "aprovar" || action === "encerrar") {
        // Persist score: use provided scoreFinal, or existing override, or calculated average
        const existingOverride = assignment.score_final_ajustado;
        if (scoreFinal != null) {
          updatePayload.score_final_ajustado = scoreFinal;
        } else if (existingOverride == null) {
          // Calculate and persist
          const calcScore = Math.round(
            ((Number(assignment.score_executor) || 0) +
             (Number(assignment.score_avaliado) || 0) +
             (Number(assignment.score_avaliador) || 0)) / 3
          );
          updatePayload.score_final_ajustado = calcScore;
        }
        // If existingOverride != null and no new scoreFinal, keep existing value
      }

      const { error } = await (supabase as any).from("operational_assignments")
        .update(updatePayload).eq("id", assignmentId);
      if (error) throw error;

      await (supabase as any).from("operational_audit_trail").insert({
        assignment_id: assignmentId,
        tipo_evento: action === "aprovar" ? "aprovacao" : action === "reprovar_devolver" ? "reprovacao" : "encerramento_manual",
        executado_por: profile.id,
        motivo: motivo || null,
        dados_novos: { status: newStatus, rodada: newRodada },
      });

      await (supabase as any).from("operational_execution_logs").insert({
        assignment_id: assignmentId,
        acao: `aprovador_${action}`,
        executado_por: profile.id,
        detalhes: { action, motivo: motivo || null, rodada: newRodada },
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
    existingOverrides,
    auditTrail,
    overrideDraft,
    setOverrideDraft,
    calculateBreakdown,
    sectionScores,
    getBlockingReasons,
    saveOverride,
    finalDecision,
    isSaving: saveOverride.isPending || finalDecision.isPending,
  };
}
