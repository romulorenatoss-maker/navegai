import { useState, useEffect, useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { SnapshotField } from "@/components/operational/DynamicFieldRenderer";

export interface FieldReviewDraft {
  field_id: string;
  conforme: boolean | null;
  observacao: string;
  devolvido: boolean;
  motivo_devolucao: string;
}

export function useAssignmentReview(assignmentId: string | null) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, FieldReviewDraft>>({});

  // Load existing answers for this assignment
  const { data: fieldAnswers = [] } = useQuery({
    queryKey: ["review_field_answers", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_field_answers")
        .select("*").eq("assignment_id", assignmentId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  // Load existing reviews for this assignment
  const { data: existingReviews = [] } = useQuery({
    queryKey: ["review_field_reviews", assignmentId],
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
    queryKey: ["review_contingencies", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_contingencies")
        .select("*").eq("assignment_id", assignmentId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  // Hydrate drafts from existing reviews for current round
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

  // Get latest answer for a field
  const getFieldAnswer = useCallback((fieldId: string) => {
    return fieldAnswers.find((a: any) => a.field_id === fieldId);
  }, [fieldAnswers]);

  // Update review draft
  const updateReview = useCallback((fieldId: string, patch: Partial<FieldReviewDraft>) => {
    setReviewDrafts(prev => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], field_id: fieldId, conforme: prev[fieldId]?.conforme ?? null, observacao: prev[fieldId]?.observacao ?? "", devolvido: prev[fieldId]?.devolvido ?? false, motivo_devolucao: prev[fieldId]?.motivo_devolucao ?? "", ...patch },
    }));
  }, []);

  // Batch: mark all fields in a section as conforme
  const markSectionConforme = useCallback((fields: SnapshotField[]) => {
    setReviewDrafts(prev => {
      const next = { ...prev };
      for (const f of fields) {
        next[f.id] = { ...next[f.id], field_id: f.id, conforme: true, observacao: next[f.id]?.observacao ?? "", devolvido: false, motivo_devolucao: "" };
      }
      return next;
    });
  }, []);

  // Score preview calculation
  const scorePreview = useMemo(() => {
    const reviewed = Object.values(reviewDrafts).filter(r => r.conforme !== null);
    if (reviewed.length === 0) return null;
    const conformes = reviewed.filter(r => r.conforme === true).length;
    const naoConformes = reviewed.filter(r => r.conforme === false).length;
    const devolvidos = reviewed.filter(r => r.devolvido).length;
    const scoreEstimado = reviewed.length > 0 ? Math.round((conformes / reviewed.length) * 100) : 0;
    return { total: reviewed.length, conformes, naoConformes, devolvidos, scoreEstimado };
  }, [reviewDrafts]);

  // Save all reviews
  const saveReviews = useMutation({
    mutationFn: async ({ assignment, fields, action }: { assignment: any; fields: SnapshotField[]; action: "aprovar" | "devolver_parcial" | "devolver_total" | "reprovar" }) => {
      if (!profile?.id || !assignmentId) throw new Error("Não autenticado");

      const rodada = assignment.rodada_atual || 1;
      const now = new Date().toISOString();

      // Persist field reviews
      const reviewEntries = Object.values(reviewDrafts).filter(r => r.conforme !== null);
      for (const r of reviewEntries) {
        const answer = getFieldAnswer(r.field_id);
        // Check if review already exists for this field+rodada
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
          await (supabase as any).from("operational_field_reviews")
            .update(reviewData).eq("id", existing.id);
        } else {
          await (supabase as any).from("operational_field_reviews")
            .insert(reviewData);
        }

        // Auto-create contingency for non-conforme fields with gera_contingencia
        if (r.conforme === false) {
          const field = fields.find(f => f.id === r.field_id);
          if (field?.gera_contingencia) {
            const existingContingency = contingencies.find((c: any) => c.origin_field_id === r.field_id && !["validada", "descartada"].includes(c.status));
            if (!existingContingency) {
              const templateSnapshot = assignment.template_snapshot;
              const slaHours = templateSnapshot?.prazo_sla_correcao_horas || 24;
              const prazoSla = new Date(Date.now() + slaHours * 3600000).toISOString();

              await (supabase as any).from("operational_contingencies").insert({
                assignment_id: assignmentId,
                origin_field_id: r.field_id,
                descricao: `Não conformidade: ${field.label}${r.observacao ? ` — ${r.observacao}` : ""}`,
                responsavel_id: assignment.responsavel_id,
                prazo_sla: prazoSla,
                status: "aberta",
              });
            }
          }
        }
      }

      // Determine new status based on action
      let newStatus: string;
      let newRodada = rodada;
      switch (action) {
        case "aprovar":
          newStatus = assignment.template_snapshot?.requer_aprovacao_gestor ? "aguardando_aprovacao" : "concluida";
          break;
        case "devolver_parcial":
        case "devolver_total":
          newStatus = "devolvida";
          newRodada = rodada + 1;
          break;
        case "reprovar":
          newStatus = "reprovada";
          break;
        default:
          newStatus = "concluida";
      }

      // Update assignment
      const updateData: any = {
        status: newStatus,
        avaliador_fim_em: now,
        rodada_atual: newRodada,
      };
      if (!assignment.avaliador_inicio_em) {
        updateData.avaliador_inicio_em = now;
      }

      const { error } = await (supabase as any).from("operational_assignments")
        .update(updateData).eq("id", assignmentId);
      if (error) throw error;

      // Audit trail
      await (supabase as any).from("operational_audit_trail").insert({
        assignment_id: assignmentId,
        tipo_evento: action === "aprovar" ? "avaliacao_aprovada" : action === "reprovar" ? "avaliacao_reprovada" : "avaliacao_devolvida",
        executado_por: profile.id,
        dados_novos: {
          status: newStatus,
          rodada: newRodada,
          total_reviews: reviewEntries.length,
          conformes: reviewEntries.filter(r => r.conforme).length,
          devolvidos: reviewEntries.filter(r => r.devolvido).length,
        },
      });

      await (supabase as any).from("operational_execution_logs").insert({
        assignment_id: assignmentId,
        acao: `avaliador_${action}`,
        executado_por: profile.id,
        detalhes: { action, rodada: newRodada },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avaliador_assignments"] });
      qc.invalidateQueries({ queryKey: ["review_field_reviews"] });
      qc.invalidateQueries({ queryKey: ["review_contingencies"] });
      toast.success("Avaliação salva com sucesso!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Start evaluation (set avaliador_inicio_em)
  const startEvaluation = useMutation({
    mutationFn: async (aId: string) => {
      if (!profile?.id) throw new Error("Não autenticado");
      const { error } = await (supabase as any).from("operational_assignments")
        .update({ status: "em_avaliacao", avaliador_inicio_em: new Date().toISOString(), avaliador_id: profile.id })
        .eq("id", aId);
      if (error) throw error;
      await (supabase as any).from("operational_execution_logs").insert({
        assignment_id: aId, acao: "avaliador_iniciou", executado_por: profile.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avaliador_assignments"] });
      toast.success("Avaliação iniciada!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return {
    fieldAnswers,
    existingReviews,
    contingencies,
    reviewDrafts,
    scorePreview,
    getFieldAnswer,
    updateReview,
    markSectionConforme,
    saveReviews,
    startEvaluation,
    isSaving: saveReviews.isPending,
  };
}
