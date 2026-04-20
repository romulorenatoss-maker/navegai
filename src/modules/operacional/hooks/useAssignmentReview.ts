import { useState, useEffect, useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { SnapshotField } from "@/modules/operacional/components/DynamicFieldRenderer";
import { useOperationalTransition } from "@/modules/operacional/hooks/useOperationalTransition";

export interface FieldReviewDraft {
  field_id: string;
  conforme: boolean | null;
  observacao: string;
  devolvido: boolean;
  motivo_devolucao: string;
}

const fieldGeneratesContingency = (field: SnapshotField | undefined, answer: any) => {
  if (!field) return false;
  if (field.gera_contingencia) return true;
  const rules = Array.isArray(field.opcoes_regras) ? field.opcoes_regras : [];
  if (field.tipo === "conforme") {
    return answer?.valor_booleano === false && rules.some((rule: any) => rule?.valor === "nao_conforme" && rule?.gera_contingencia);
  }
  if (field.tipo === "sim_nao") {
    return answer?.valor_booleano === false && rules.some((rule: any) => rule?.valor === "nao" && rule?.gera_contingencia);
  }
  if (field.tipo === "select") {
    return rules.some((rule: any) => rule?.label === answer?.valor_texto && rule?.gera_contingencia);
  }
  return false;
};

export function useAssignmentReview(assignmentId: string | null) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { transition } = useOperationalTransition();
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, FieldReviewDraft>>({});
  const [contingencyPrazos, setContingencyPrazos] = useState<Record<string, number>>({});
  const [pendingContingencyData, setPendingContingencyData] = useState<Record<string, { prazoResolucao: string; motivoInstrucao: string }>>({});

  const { data: fieldAnswers = [] } = useQuery({
    queryKey: ["operational_review_field_answers", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_field_answers")
        .select("*").eq("assignment_id", assignmentId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  const { data: existingReviews = [] } = useQuery({
    queryKey: ["operational_review_field_reviews", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_field_reviews")
        .select("*").eq("assignment_id", assignmentId).order("rodada", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  const { data: contingencies = [] } = useQuery({
    queryKey: ["operational_review_contingencies", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_contingencies")
        .select("*").eq("assignment_id", assignmentId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  // Hydrate drafts from existing reviews
  useEffect(() => {
    if (!existingReviews.length) return;
    const map: Record<string, FieldReviewDraft> = {};
    for (const r of existingReviews) {
      if (!map[r.field_id]) {
        map[r.field_id] = {
          field_id: r.field_id,
          conforme: r.conforme,
          observacao: r.observacao || "",
          devolvido: r.devolvido,
          motivo_devolucao: r.motivo_devolucao || "",
        };
      }
    }
    setReviewDrafts(map);
  }, [existingReviews]);

  const getFieldAnswer = useCallback((fieldId: string) => {
    return fieldAnswers.find((a: any) => a.field_id === fieldId);
  }, [fieldAnswers]);

  const updateReview = useCallback((fieldId: string, patch: Partial<FieldReviewDraft>) => {
    setReviewDrafts(prev => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], field_id: fieldId, conforme: prev[fieldId]?.conforme ?? null, observacao: prev[fieldId]?.observacao ?? "", devolvido: prev[fieldId]?.devolvido ?? false, motivo_devolucao: prev[fieldId]?.motivo_devolucao ?? "", ...patch },
    }));
  }, []);

  const updateContingencyPrazo = useCallback((fieldId: string, horas: number) => {
    setContingencyPrazos(prev => ({ ...prev, [fieldId]: horas }));
  }, []);

  const registerContingencyData = useCallback((fieldId: string, prazoResolucao: string, motivoInstrucao: string) => {
    setPendingContingencyData(prev => ({ ...prev, [fieldId]: { prazoResolucao, motivoInstrucao } }));
  }, []);

  const markSectionConforme = useCallback((fields: SnapshotField[]) => {
    setReviewDrafts(prev => {
      const next = { ...prev };
      for (const f of fields) {
        if (next[f.id]?.conforme !== null && next[f.id]?.conforme !== undefined) continue;
        next[f.id] = { field_id: f.id, conforme: true, observacao: "", devolvido: false, motivo_devolucao: "" };
      }
      return next;
    });
  }, []);

  // Check if all required reviewable fields are reviewed (only aprovador_verificar)
  const isReviewComplete = useCallback((visibleFields: SnapshotField[]) => {
    const requiredFields = visibleFields.filter(f => f.obrigatorio !== false);
    return requiredFields.every(f => {
      const draft = reviewDrafts[f.id];
      return draft?.conforme !== null && draft?.conforme !== undefined;
    });
  }, [reviewDrafts]);

  // Save all reviews
  const saveReviews = useMutation({
    mutationFn: async ({ assignment, fields, action, motivo }: { assignment: any; fields: SnapshotField[]; action: "aprovar" | "devolver_parcial" | "devolver_total" | "reprovar"; motivo?: string }) => {
      if (!profile?.id || !assignmentId) throw new Error("Não autenticado");

      const rodada = assignment.rodada_atual || 1;
      const now = new Date().toISOString();

      const reviewEntries = Object.values(reviewDrafts).filter(r => r.conforme !== null);
      const persistedReviewIds: Record<string, string> = {};

      for (const r of reviewEntries) {
        const answer = getFieldAnswer(r.field_id);
        const existing = existingReviews.find((er: any) => er.field_id === r.field_id && er.rodada === rodada);

        const reviewData = {
          assignment_id: assignmentId,
          field_id: r.field_id,
          answer_id: answer?.id || null,
          conforme: r.conforme,
          observacao: r.observacao || null,
          devolvido: r.devolvido,
          motivo_devolucao: r.motivo_devolucao || null,
          avaliador_id: profile.id,
          rodada,
          avaliado_em: now,
        };

        if (existing) {
          await (supabase as any).from("operational_field_reviews").update(reviewData).eq("id", existing.id);
          persistedReviewIds[r.field_id] = existing.id;
        } else {
          const { data: inserted } = await (supabase as any).from("operational_field_reviews").insert(reviewData).select("id").single();
          if (inserted) persistedReviewIds[r.field_id] = inserted.id;
        }

        if (r.conforme === false) {
          const field = fields.find(f => f.id === r.field_id);
          const answer = fieldAnswers.find((a: any) => a.field_id === r.field_id);
          if (fieldGeneratesContingency(field, answer)) {
            const existingContingency = contingencies.find((c: any) => c.origin_field_id === r.field_id && !["validada", "descartada"].includes(c.status));
            if (!existingContingency) {
              const pendingData = pendingContingencyData[r.field_id];
              const customPrazoHoras = contingencyPrazos[r.field_id];
              const templateSnapshot = assignment.template_snapshot;
              const slaHours = customPrazoHoras || templateSnapshot?.prazo_sla_correcao_horas || 24;

              const prazoResolucao = pendingData?.prazoResolucao || new Date(Date.now() + slaHours * 3600000).toISOString();
              const motivoInstrucao = pendingData?.motivoInstrucao || `Não conformidade: ${field?.label}${r.observacao ? ` — ${r.observacao}` : ""}`;

              await (supabase as any).from("operational_contingencies").insert({
                assignment_id: assignmentId,
                origin_field_id: r.field_id,
                origin_review_id: persistedReviewIds[r.field_id] || null,
                descricao: `Não conformidade: ${field?.label}${r.observacao ? ` — ${r.observacao}` : ""}`,
                responsavel_id: assignment.responsavel_id,
                prazo_sla: prazoResolucao,
                prazo_resolucao: prazoResolucao,
                motivo_instrucao: motivoInstrucao,
                status: "aberta",
              });

              await (supabase as any).from("operational_assignment_history").insert({
                assignment_id: assignmentId,
                tipo_evento: "CONTINGENCIA_CRIADA",
                usuario_id: profile.id,
                etapa: "avaliacao",
                detalhes_json: { field_id: r.field_id, field_label: field?.label, prazo: prazoResolucao, motivo: motivoInstrucao },
              });
            }
          }
        }
      }

      const naoConformesComContingencia = reviewEntries.filter(r => {
        if (r.conforme !== false) return false;
        const field = fields.find(f => f.id === r.field_id);
        const answer = fieldAnswers.find((a: any) => a.field_id === r.field_id);
        return fieldGeneratesContingency(field, answer);
      });

      let newContingenciesCreated = 0;
      for (const r of naoConformesComContingencia) {
        const existingContingency = contingencies.find((c: any) => c.origin_field_id === r.field_id && !["validada", "descartada"].includes(c.status));
        if (!existingContingency) newContingenciesCreated++;
      }

      const { data: openContingencies } = await (supabase as any)
        .from("operational_contingencies")
        .select("id")
        .eq("assignment_id", assignmentId)
        .in("status", ["aberta", "em_andamento"])
        .limit(1);

      const hasOpenContingencies = (openContingencies?.length > 0) || newContingenciesCreated > 0;

      if (action === "aprovar" && hasOpenContingencies) {
        throw new Error("Não é possível aprovar enquanto houver contingências abertas.");
      }

      let transitionAction: string;
      const { data: liveTemplate } = await (supabase as any).from("operational_templates")
        .select("requer_aprovacao_gestor, aprovador_profile_id, aprovador_setor_id")
        .eq("id", assignment.template_id).single();
      const requerAprovacao = !!liveTemplate?.requer_aprovacao_gestor;
      const aprovadorProfileId = liveTemplate?.aprovador_profile_id || null;

      if (hasOpenContingencies && action !== "reprovar") {
        transitionAction = "enviar_contingencia";
      } else {
        switch (action) {
          case "aprovar": transitionAction = "avaliar_aprovar"; break;
          case "devolver_parcial":
          case "devolver_total": transitionAction = "avaliar_devolver"; break;
          case "reprovar": transitionAction = "avaliar_reprovar"; break;
          default: transitionAction = "avaliar_aprovar";
        }
      }

      await transition.mutateAsync({
        assignmentId,
        action: transitionAction as any,
        motivo: motivo || undefined,
        origem: "avaliacao",
        extraData: {
          rodadaAtual: rodada,
          requerAprovacao,
          aprovadorProfileId,
          contingencias_criadas: newContingenciesCreated,
          total_reviews: reviewEntries.length,
          conformes: reviewEntries.filter(r => r.conforme).length,
        },
      });

      await (supabase as any).from("operational_execution_logs").insert({
        assignment_id: assignmentId,
        acao: `avaliador_${action}`,
        executado_por: profile.id,
        detalhes: { action, rodada, motivo: motivo || null },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_avaliador_assignments"] });
      qc.invalidateQueries({ queryKey: ["operational_review_field_reviews"] });
      qc.invalidateQueries({ queryKey: ["operational_review_contingencies"] });
      toast.success("Avaliação salva com sucesso!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startEvaluation = useMutation({
    mutationFn: async (aId: string) => {
      if (!profile?.id) throw new Error("Não autenticado");
      await transition.mutateAsync({
        assignmentId: aId,
        action: "iniciar_avaliacao",
        origem: "avaliacao",
      });
      await (supabase as any).from("operational_execution_logs").insert({
        assignment_id: aId, acao: "avaliador_iniciou", executado_por: profile.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_avaliador_assignments"] });
      toast.success("Avaliação iniciada!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return {
    fieldAnswers,
    existingReviews,
    contingencies,
    reviewDrafts,
    contingencyPrazos,
    isReviewComplete,
    getFieldAnswer,
    updateReview,
    updateContingencyPrazo,
    registerContingencyData,
    markSectionConforme,
    saveReviews,
    startEvaluation,
    isSaving: saveReviews.isPending,
  };
}
