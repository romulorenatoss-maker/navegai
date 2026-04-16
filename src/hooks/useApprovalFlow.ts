import { useState, useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { SnapshotField } from "@/components/operational/DynamicFieldRenderer";
import { useOperationalTransition } from "@/hooks/useOperationalTransition";

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

  // Check pending contingencies
  const pendingContingencies = useMemo(() =>
    contingencies.filter((c: any) => !["validada", "descartada"].includes(c.status)),
    [contingencies]
  );

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

      const approverFields = fields.filter(f => f.aprovador_verificar && f.aprovador_pergunta);
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

  // Check blocking conditions — only count aprovador_verificar fields
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

    // Block if approval questions are unanswered — only check aprovador_verificar fields
    const snapshotFields: SnapshotField[] = snapshot?.fields || [];
    const approvalFields = snapshotFields.filter(f => f.aprovador_verificar);
    const unanswered = approvalFields.filter(f => {
      const existing = existingApprovalAnswers.find((a: any) => a.field_id === f.id);
      const draft = approverAnswers[f.id];
      return !draft?.resposta && !existing?.resposta;
    });
    if (unanswered.length > 0) {
      reasons.push(`${unanswered.length} pergunta(s) de aprovação sem resposta.`);
    }

    return reasons;
  }, [contingencies, existingApprovalAnswers, approverAnswers]);

  // Final decision
  const finalDecision = useMutation({
    mutationFn: async ({ assignment, action, motivo }: { assignment: any; action: "aprovar" | "reprovar_devolver" | "encerrar"; motivo?: string }) => {
      if (!profile?.id || !assignmentId) throw new Error("Não autenticado");

      const blockReasons = getBlockingReasons(assignment);
      if (action === "aprovar" && blockReasons.length > 0) {
        throw new Error(`Bloqueado: ${blockReasons.join(" ")}`);
      }
      if (action !== "aprovar" && !motivo?.trim()) {
        throw new Error("Justificativa obrigatória para esta ação.");
      }

      // Save any pending approver answers before final decision
      const snapshotFields: SnapshotField[] = assignment.template_snapshot?.fields || [];
      const approverFields = snapshotFields.filter(f => f.aprovador_verificar && f.aprovador_pergunta);
      if (approverFields.length > 0 && Object.keys(approverAnswers).length > 0) {
        await saveApproverAnswers.mutateAsync(snapshotFields);
      }

      let transitionAction: "aprovar_final" | "reprovar_devolver_final" | "encerrar_final";
      switch (action) {
        case "aprovar": transitionAction = "aprovar_final"; break;
        case "reprovar_devolver": transitionAction = "reprovar_devolver_final"; break;
        case "encerrar": transitionAction = "encerrar_final"; break;
      }

      await transition.mutateAsync({
        assignmentId,
        action: transitionAction,
        motivo,
        origem: "aprovacao_final",
        extraData: {
          aprovadorId: profile.id,
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
    existingApprovalAnswers,
    auditTrail,
    approverAnswers,
    updateApproverAnswer,
    saveApproverAnswers,
    pendingContingencies,
    getBlockingReasons,
    finalDecision,
    isSaving: finalDecision.isPending || saveApproverAnswers.isPending,
  };
}
