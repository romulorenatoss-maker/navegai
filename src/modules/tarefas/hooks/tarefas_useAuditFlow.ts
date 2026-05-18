/**
 * Audit flow — espelha useApprovalFlow mas para o papel auditor.
 * Lê campos auditor_verificar, persiste em operational_audit_answers,
 * conclui a tarefa via transition (auditor_aprovar / auditor_devolver).
 */
import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { SnapshotField } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import { useOperationalTransition } from "@/modules/tarefas/hooks/tarefas_useTransition";

export interface AuditorAnswerDraft {
  field_id: string;
  resposta: string;
  observacao: string;
  evidencia_url?: string | null;
  motivo_alteracao?: string | null;
  herdada?: boolean;
}

export function useAuditFlow(assignmentId: string | null) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { transition } = useOperationalTransition();
  const [auditorAnswers, setAuditorAnswers] = useState<Record<string, AuditorAnswerDraft>>({});

  // Respostas do executor (para herança)
  const { data: fieldAnswers = [] } = useQuery({
    queryKey: ["operational_audit_field_answers", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_field_answers")
        .select("*").eq("assignment_id", assignmentId);
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  // Respostas existentes do auditor
  const { data: existingAuditAnswers = [] } = useQuery({
    queryKey: ["operational_audit_answers", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_audit_answers")
        .select("*").eq("assignment_id", assignmentId);
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  // Respostas do aprovador (para alertas/anormalidades visíveis ao auditor)
  const { data: approvalAnswers = [] } = useQuery({
    queryKey: ["operational_audit_approval_answers", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_approval_answers")
        .select("*").eq("assignment_id", assignmentId);
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  // Hidrata drafts a partir do que já está salvo
  useEffect(() => {
    if (!existingAuditAnswers || existingAuditAnswers.length === 0) return;
    setAuditorAnswers(prev => {
      const next = { ...prev };
      for (const a of existingAuditAnswers as any[]) {
        if (next[a.field_id]) continue;
        next[a.field_id] = {
          field_id: a.field_id,
          resposta: a.resposta ?? "",
          observacao: a.observacao ?? "",
          evidencia_url: a.evidencia_url ?? null,
          motivo_alteracao: a.motivo_alteracao ?? null,
          herdada: a.herdada ?? false,
        };
      }
      return next;
    });
  }, [existingAuditAnswers]);

  const updateAuditorAnswer = useCallback((fieldId: string, patch: Partial<AuditorAnswerDraft>) => {
    setAuditorAnswers(prev => ({
      ...prev,
      [fieldId]: {
        field_id: fieldId,
        resposta: prev[fieldId]?.resposta ?? "",
        observacao: prev[fieldId]?.observacao ?? "",
        evidencia_url: prev[fieldId]?.evidencia_url ?? null,
        motivo_alteracao: prev[fieldId]?.motivo_alteracao ?? null,
        herdada: prev[fieldId]?.herdada ?? false,
        ...patch,
      },
    }));
  }, []);

  const autoSaveAuditorAnswer = useMutation({
    mutationFn: async ({ fieldId, resposta, observacao, evidenciaUrl, motivoAlteracao, herdada }: {
      fieldId: string; resposta: string; observacao?: string; evidenciaUrl?: string | null;
      motivoAlteracao?: string | null; herdada?: boolean;
    }) => {
      if (!profile?.id || !assignmentId) throw new Error("Não autenticado");
      const payload: any = {
        assignment_id: assignmentId,
        field_id: fieldId,
        resposta,
        observacao: observacao || null,
        evidencia_url: evidenciaUrl ?? null,
        motivo_alteracao: motivoAlteracao ?? null,
        herdada: herdada ?? false,
        auditor_id: profile.id,
        updated_at: new Date().toISOString(),
      };
      const existing = (existingAuditAnswers as any[]).find((a: any) => a.field_id === fieldId);
      if (existing) {
        await (supabase as any).from("operational_audit_answers").update(payload).eq("id", existing.id);
      } else {
        await (supabase as any).from("operational_audit_answers").insert(payload);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_audit_answers", assignmentId] });
    },
    onError: (e: any) => toast.error(`Erro ao salvar: ${e.message}`),
  });

  // Planos do auditor para o aprovador
  const { data: fieldReviewsAuditor = [] } = useQuery({
    queryKey: ["operational_audit_field_reviews", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any)
        .from("operational_field_reviews")
        .select("*")
        .eq("assignment_id", assignmentId)
        .eq("criado_por_papel", "auditor");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!assignmentId,
    staleTime: 0,
  });

  type ItemPlano = { tipo: string; titulo: string; obrigatorio: boolean };

  const criarPlanoAuditor = useMutation({
    mutationFn: async ({ perguntaId, perguntaLabel, instrucao, itensPlano, prazoIso }: {
      perguntaId: string;
      perguntaLabel: string;
      instrucao: string;
      itensPlano: ItemPlano[];
      prazoIso: string;
    }) => {
      if (!profile?.id || !assignmentId) throw new Error("Nao autenticado");
      const rodadaAtual = (fieldReviewsAuditor as any[])
        .filter((r: any) => r.field_id === perguntaId && r.criado_por_papel === "auditor")
        .reduce((max: number, r: any) => Math.max(max, r.rodada ?? 1), 0) + 1;

      const payload = {
        assignment_id: assignmentId,
        field_id: perguntaId,
        avaliador_id: profile.id,
        instrucao_aprovador: instrucao,
        itens_plano: itensPlano,
        devolvido: true,
        rodada: rodadaAtual,
        criado_por_papel: "auditor",
        destinatario_papel: "aprovador",
        avaliado_em: new Date().toISOString(),
      };
      await (supabase as any).from("operational_field_reviews").insert(payload);
      // Muda status para aguardando_aprovador_resposta
      await (supabase as any)
        .from("operational_assignments")
        .update({ status: "aguardando_aprovacao", updated_at: new Date().toISOString() })
        .eq("id", assignmentId);
      await (supabase as any).from("operational_execution_logs").insert({
        assignment_id: assignmentId,
        acao: "auditor_criou_plano",
        executado_por: profile.id,
        detalhes: { pergunta_id: perguntaId, pergunta_label: perguntaLabel, rodada: rodadaAtual },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_audit_field_reviews", assignmentId] });
      qc.invalidateQueries({ queryKey: ["operational_my_assignments"] });
      toast.success("Plano criado e enviado ao aprovador.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const getBlockingReasons = useCallback((assignment: any) => {
    const reasons: string[] = [];
    const snapshot = assignment?.template_snapshot;
    const snapshotFields: SnapshotField[] = snapshot?.fields || [];
    const auditorFields = snapshotFields.filter((f: any) => f.auditor_verificar);
    const unanswered = auditorFields.filter((f: any) => {
      const existing = (existingAuditAnswers as any[]).find((a: any) => a.field_id === f.id);
      const draft = auditorAnswers[f.id];
      return !draft?.resposta && !existing?.resposta;
    });
    if (unanswered.length > 0) {
      reasons.push(`${unanswered.length} pergunta(s) de auditoria sem resposta.`);
    }
    return reasons;
  }, [existingAuditAnswers, auditorAnswers]);

  const finalDecision = useMutation({
    mutationFn: async ({ assignment, action, motivo }: { assignment: any; action: "aprovar" | "devolver"; motivo?: string }) => {
      if (!profile?.id || !assignmentId) throw new Error("Não autenticado");
      const blockReasons = getBlockingReasons(assignment);
      if (action === "aprovar" && blockReasons.length > 0) {
        throw new Error(`Bloqueado: ${blockReasons.join(" ")}`);
      }
      if (action === "devolver" && !motivo?.trim()) {
        throw new Error("Justificativa obrigatória para devolver.");
      }

      await transition.mutateAsync({
        assignmentId,
        action: action === "aprovar" ? "auditor_aprovar" : "auditor_devolver",
        motivo,
        origem: "auditoria_final",
        extraData: {
          aprovadorId: assignment.aprovador_id,
          rodadaAtual: assignment.rodada_atual,
        },
      });

      await (supabase as any).from("operational_execution_logs").insert({
        assignment_id: assignmentId,
        acao: `auditor_${action}`,
        executado_por: profile.id,
        detalhes: { action, motivo: motivo || null, rodada: assignment.rodada_atual },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_my_assignments"] });
      qc.invalidateQueries({ queryKey: ["operational_audit_answers"] });
      toast.success("Decisão de auditoria registrada.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return {
    fieldAnswers,
    existingAuditAnswers,
    approvalAnswers,
    auditorAnswers,
    fieldReviewsAuditor,
    updateAuditorAnswer,
    autoSaveAuditorAnswer,
    getBlockingReasons,
    finalDecision,
    criarPlanoAuditor,
    isSaving: finalDecision.isPending || criarPlanoAuditor.isPending,
  };
}
