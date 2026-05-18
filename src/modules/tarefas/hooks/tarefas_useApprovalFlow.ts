import { useState, useCallback, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { SnapshotField } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import { useOperationalTransition } from "@/modules/tarefas/hooks/tarefas_useTransition";

export interface ApproverAnswerDraft {
  field_id: string;
  resposta: string; // conforme | nao_conforme | na | <opção custom>
  observacao: string;
  peso: number;
  evidencia_url?: string | null;
}

// Statuses finais: snapshot congelado (histórico imutável).
// Demais statuses: aplica overlay com ada_config_snapshot vivo do template
// (mantém fields do snapshot p/ alinhar FK das respostas; sobrepõe apenas
// ada_config_snapshot, que carrega o checklist atual do Aprovador).
const STATUSES_FINAIS_TASK = ["concluida", "aprovada", "auditada", "cancelada", "arquivada"];
const getEffectiveSnapshot = (assignment: any) => {
  const base = assignment?.template_snapshot;
  if (!base) return base;
  const liveAda = assignment?.operational_templates?.ada_config_snapshot;
  const status = assignment?.status;
  const isLive = !!status && !STATUSES_FINAIS_TASK.includes(status);
  if (isLive && liveAda) return { ...base, ada_config_snapshot: liveAda };
  if (!base.ada_config_snapshot && liveAda) return { ...base, ada_config_snapshot: liveAda };
  return base;
};

export function useApprovalFlow(assignmentId: string | null) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { transition } = useOperationalTransition();
  const [approverAnswers, setApproverAnswers] = useState<Record<string, ApproverAnswerDraft>>({});

  // Load field answers
  const { data: fieldAnswers = [] } = useQuery({
    queryKey: ["operational_approval_field_answers", assignmentId],
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
    queryKey: ["operational_approval_field_reviews", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_field_reviews")
        .select("*, profiles:avaliador_id(nome)")
        .eq("assignment_id", assignmentId)
        .order("rodada", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  // Load contingencies
  const { data: contingencies = [] } = useQuery({
    queryKey: ["operational_approval_contingencies", assignmentId],
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
    queryKey: ["operational_approval_audit_trail", assignmentId],
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
    queryKey: ["operational_approval_answers", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_approval_answers")
        .select("*, responder:profiles!operational_approval_answers_respondido_por_fkey(id, nome)")
        .eq("assignment_id", assignmentId);
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  // Reset approverAnswers ao trocar de tarefa (anti-contaminação entre tarefas)
  // O key={assignmentId} no Sheet já garante isolamento — não cancelar queries
  // pois cancela a query da tarefa atual que acabou de montar, deixando em branco.
  useEffect(() => {
    setApproverAnswers({});
  }, [assignmentId]);

  // Hidrata approverAnswers a partir de respostas já salvas
  // (auto-save persistente: ao reabrir, toggles/observação/anexo já vêm preenchidos).
  useEffect(() => {
    if (!existingApprovalAnswers || existingApprovalAnswers.length === 0) return;
    setApproverAnswers(prev => {
      const next = { ...prev };
      for (const a of existingApprovalAnswers as any[]) {
        // Guard defensivo: ignora respostas de outra tarefa (cache stale)
        if (assignmentId && a.assignment_id && a.assignment_id !== assignmentId) continue;
        if (next[a.field_id]) continue; // não sobrescreve edição local
        next[a.field_id] = {
          field_id: a.field_id,
          resposta: a.resposta ?? "",
          observacao: a.observacao ?? "",
          peso: a.peso ?? 1,
          evidencia_url: a.evidencia_url ?? null,
        };
      }
      return next;
    });
  }, [existingApprovalAnswers, assignmentId]);

  // Auto-save a single approver answer (upsert)
  const autoSaveApproverAnswer = useMutation({
    mutationFn: async ({ fieldId, resposta, observacao, peso, evidenciaUrl }: { fieldId: string; resposta: string; observacao?: string; peso?: number; evidenciaUrl?: string | null }) => {
      if (!profile?.id || !assignmentId) throw new Error("Não autenticado");
      const payload: any = {
        assignment_id: assignmentId,
        field_id: fieldId,
        resposta,
        observacao: observacao || null,
        peso: peso ?? 1,
        evidencia_url: evidenciaUrl ?? null,
        respondido_por: profile.id,
        respondido_em: new Date().toISOString(),
      };
      const existing = existingApprovalAnswers.find((a: any) => a.field_id === fieldId);
      if (existing) {
        await (supabase as any).from("operational_approval_answers").update(payload).eq("id", existing.id);
      } else {
        await (supabase as any).from("operational_approval_answers").insert(payload);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_approval_answers", assignmentId] });
    },
    onError: (e: any) => toast.error(`Erro ao salvar: ${e.message}`),
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

      // Persiste para TODAS as perguntas com rascunho (replicadas + manuais),
      // não só as marcadas aprovador_verificar.
      const approverFields = fields.filter(f => !!approverAnswers[f.id]);
      for (const f of approverFields) {
        const draft = approverAnswers[f.id];
        if (!draft) continue;
        if (!draft) continue;

        const payload = {
          assignment_id: assignmentId,
          field_id: f.id,
          resposta: draft.resposta,
          observacao: draft.observacao || null,
          peso: f.aprovador_peso || 1,
          evidencia_url: draft.evidencia_url ?? null,
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
      qc.invalidateQueries({ queryKey: ["operational_approval_answers"] });
      toast.success("Respostas do aprovador salvas!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Check blocking conditions — only count aprovador_verificar fields
  const getBlockingReasons = useCallback((assignment: any): string[] => {
    const reasons: string[] = [];
    const snapshot = getEffectiveSnapshot(assignment);

    // Block if open contingencies exist and template requires it
    if (snapshot?.bloquear_fechamento_contingencia) {
      const openContingencies = contingencies.filter((c: any) => !["validada", "descartada", "resolvida"].includes(c.status));
      if (openContingencies.length > 0) {
        reasons.push(`${openContingencies.length} plano(s) de ação aberto(s) impedem a aprovação.`);
      }
    }

    // Block if approval questions are unanswered — exige resposta para TODAS as perguntas
    // do snapshot (replicadas + manuais), exceto tipos puramente estruturais.
    const snapshotFields: SnapshotField[] = snapshot?.fields || [];
    const approvalFields = snapshotFields.filter(f => !["secao", "divisor", "titulo"].includes(String((f as any).tipo)));
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
      const snapshotFields: SnapshotField[] = getEffectiveSnapshot(assignment)?.fields || [];
      // Save TODOS os rascunhos pendentes do aprovador (todas perguntas, não só aprovador_verificar)
      if (Object.keys(approverAnswers).length > 0) {
        await saveApproverAnswers.mutateAsync(snapshotFields);
      }

      // Roteamento auditor: se template tem auditor_id configurado,
      // vai para AGUARDANDO_AUDITORIA. Perguntas do auditor vêm de checklists.validador.
      const snap = assignment?.operational_templates?.ada_config_snapshot
        ?? assignment?.template_snapshot?.ada_config_snapshot;
      const perguntasAuditor = snap?.checklists?.validador;
      const temPerguntasAuditor = Array.isArray(perguntasAuditor) && perguntasAuditor.length > 0;
      const auditorFields = snapshotFields.filter((f: any) => f.auditor_verificar);
      const temAuditor = !!assignment?.auditor_id || !!assignment?.setor_auditor_id;
      const requerAuditoria = action === "aprovar"
        && temAuditor
        && (temPerguntasAuditor || auditorFields.length > 0);

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
          requerAuditoria,
        },
      });

      await (supabase as any).from("operational_execution_logs").insert({
        assignment_id: assignmentId,
        acao: requerAuditoria ? "aprovador_enviou_auditoria" : `aprovador_${action}`,
        executado_por: profile.id,
        detalhes: { action, motivo: motivo || null, rodada: assignment.rodada_atual, requerAuditoria },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_aprovacao_assignments"] });
      qc.invalidateQueries({ queryKey: ["operational_my_assignments"] });
      toast.success("Decisão registrada com sucesso!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Cria contingências (planos de ação) consolidadas a partir de NCs do aprovador,
  // uma por NC, e dispara devolução final ao executor/setor.
  // Também persiste flags em operational_approval_answers (conforme=false, plano_acao_*,
  // flag_prazo_alterado, justificativa_alteracao_prazo) para o auditor revisar.
  const criarPlanosAcaoEDevolver = useMutation({
    mutationFn: async ({ assignment, planos, motivoGeral }: {
      assignment: any;
      planos: Array<{
        field_id: string;
        field_label: string;
        descricao_acao: string;
        prazo_iso: string;
        prazo_padrao_iso?: string | null;
        prazo_alterado?: boolean;
        justificativa_alteracao_prazo?: string | null;
        anexo_url?: string | null;
        responsavel_profile_id?: string | null;
        criticidade: "baixa" | "media" | "alta";
        tipo_evidencia_exigida?: string;
        itens_plano?: Array<{ tipo: "foto" | "video" | "audio" | "texto"; titulo: string; obrigatorio: boolean }>;
      }>;
      motivoGeral?: string;
    }) => {
      if (!profile?.id || !assignmentId) throw new Error("Não autenticado");
      if (!planos.length) throw new Error("Nenhum plano de ação para registrar.");

      const snapshotFields: SnapshotField[] = getEffectiveSnapshot(assignment)?.fields || [];
      if (Object.keys(approverAnswers).length > 0) {
        await saveApproverAnswers.mutateAsync(snapshotFields);
      }

      for (const p of planos) {
        // 1) Cria contingência (workflow operacional existente)
        await (supabase as any).from("operational_contingencies").insert({
          assignment_id: assignmentId,
          origin_field_id: p.field_id || null,
          descricao: `[${p.field_label}] ${p.descricao_acao}`,
          plano_acao: p.descricao_acao,
          prazo_sla: p.prazo_iso,
          prazo_resolucao: p.prazo_iso,
          status: "aberta",
          responsavel_id: p.responsavel_profile_id ?? null,
          motivo_instrucao: `Criticidade: ${p.criticidade}`,
          itens_plano: p.itens_plano || [],
        });

        // 2) Persiste detalhes do plano em operational_approval_answers (para auditor)
        const existing = (existingApprovalAnswers as any[]).find((a: any) => a.field_id === p.field_id);
        const planoPayload: any = {
          conforme: false,
          plano_acao_descricao: p.descricao_acao,
          plano_acao_prazo: p.prazo_iso,
          plano_acao_anexo_url: p.anexo_url ?? null,
          prazo_padrao_aplicado: p.prazo_padrao_iso ?? null,
          flag_prazo_alterado: !!p.prazo_alterado,
          justificativa_alteracao_prazo: p.prazo_alterado ? (p.justificativa_alteracao_prazo || null) : null,
          itens_plano: p.itens_plano || [],
        };
        if (existing) {
          await (supabase as any).from("operational_approval_answers")
            .update(planoPayload).eq("id", existing.id);
        } else {
          await (supabase as any).from("operational_approval_answers").insert({
            assignment_id: assignmentId,
            field_id: p.field_id,
            resposta: "nao_conforme",
            respondido_por: profile.id,
            respondido_em: new Date().toISOString(),
            ...planoPayload,
          });
        }

        // 2b) Libera o campo no executor: marca devolvido=true em operational_field_reviews
        // (mesmo padrão de devolverPerguntasParaRefazer; gate em useAssignmentExecution)
        const rodadaPA = assignment.rodada_atual || 1;
        const answerExecPA = (fieldAnswers as any[]).find((a: any) => a.field_id === p.field_id);
        const reviewPayload: any = {
          assignment_id: assignmentId,
          field_id: p.field_id,
          answer_id: answerExecPA?.id ?? null,
          conforme: false,
          devolvido: true,
          motivo_devolucao: p.descricao_acao,
          observacao: p.descricao_acao,
          instrucao_aprovador: p.descricao_acao,
          tipo_evidencia_exigida: (p as any).tipo_evidencia_exigida || "nenhuma",
          anexo_orientacao_url: (p as any).anexo_orientacao_url ?? null,
          anexo_orientacao_anexo_id: (p as any).anexo_orientacao_anexo_id ?? null,
          anexo_orientacao_mime_type: (p as any).anexo_orientacao_mime_type ?? null,
          rodada: rodadaPA,
          avaliador_id: profile.id,
          avaliado_em: new Date().toISOString(),
        };
        const existingReview = (fieldReviews as any[]).find(
          (r: any) => r.field_id === p.field_id && r.rodada === rodadaPA
        );
        if (existingReview) {
          await (supabase as any).from("operational_field_reviews")
            .update(reviewPayload).eq("id", existingReview.id);
        } else {
          await (supabase as any).from("operational_field_reviews").insert(reviewPayload);
        }
      }

      // 3) Dispara devolução final consolidada → status EM_PLANO_ACAO via solicitar_plano_acao
      // Mantém uso de reprovar_devolver_final para preservar comportamento (rodada++).
      await transition.mutateAsync({
        assignmentId,
        action: "reprovar_devolver_final",
        motivo: motivoGeral || `${planos.length} plano(s) de ação registrado(s) pelo aprovador`,
        origem: "aprovacao_plano_acao_final",
        extraData: {
          aprovadorId: profile.id,
          rodadaAtual: assignment.rodada_atual,
          total_planos: planos.length,
          planos_com_prazo_alterado: planos.filter(p => p.prazo_alterado).length,
        },
      });

      await (supabase as any).from("operational_execution_logs").insert({
        assignment_id: assignmentId,
        acao: "aprovador_devolveu_com_planos_acao",
        executado_por: profile.id,
        detalhes: { total_planos: planos.length, rodada: assignment.rodada_atual },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_aprovacao_assignments"] });
      qc.invalidateQueries({ queryKey: ["operational_my_assignments"] });
      qc.invalidateQueries({ queryKey: ["operational_approval_contingencies"] });
      qc.invalidateQueries({ queryKey: ["operational_approval_field_reviews", assignmentId] });
      toast.success("Planos de ação registrados e tarefa devolvida.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Devolve perguntas individuais para refazer (sem criar plano de ação).
  // Reaproveita operational_field_reviews: marca devolvido=true e grava motivo_devolucao.
  // O executor verá apenas estes campos liberados (gate em useAssignmentExecution.ts:263).
  // Histórico preservado pela rodada (constraint UNIQUE assignment_id+field_id+rodada).
  const devolverPerguntasParaRefazer = useMutation({
    mutationFn: async ({ assignment, perguntas, motivoGeral }: {
      assignment: any;
      perguntas: Array<{ field_id: string; field_label: string; motivo: string }>;
      motivoGeral?: string;
    }) => {
      if (!profile?.id || !assignmentId) throw new Error("Não autenticado");
      if (!perguntas.length) throw new Error("Selecione ao menos uma pergunta para devolver.");
      const semMotivo = perguntas.find(p => !p.motivo?.trim());
      if (semMotivo) throw new Error(`Informe o motivo para "${semMotivo.field_label}".`);

      const snapshotFields: SnapshotField[] = getEffectiveSnapshot(assignment)?.fields || [];
      if (Object.keys(approverAnswers).length > 0) {
        await saveApproverAnswers.mutateAsync(snapshotFields);
      }

      const rodada = assignment.rodada_atual || 1;

      for (const p of perguntas) {
        // Recupera answer_id mais recente do executor para vincular o review ao histórico
        const answerExec = (fieldAnswers as any[]).find((a: any) => a.field_id === p.field_id);
        const payload: any = {
          assignment_id: assignmentId,
          field_id: p.field_id,
          answer_id: answerExec?.id ?? null,
          conforme: false,
          devolvido: true,
          motivo_devolucao: p.motivo.trim(),
          observacao: p.motivo.trim(),
          instrucao_aprovador: p.motivo.trim(),
          tipo_evidencia_exigida: (p as any).tipo_evidencia_exigida || "nenhuma",
          rodada,
          avaliador_id: profile.id,
          avaliado_em: new Date().toISOString(),
        };
        // Upsert por (assignment_id, field_id, rodada)
        const existing = (fieldReviews as any[]).find(
          (r: any) => r.field_id === p.field_id && r.rodada === rodada
        );
        if (existing) {
          await (supabase as any).from("operational_field_reviews")
            .update(payload).eq("id", existing.id);
        } else {
          await (supabase as any).from("operational_field_reviews").insert(payload);
        }
      }

      // Marca também na resposta do aprovador (visível ao auditor)
      for (const p of perguntas) {
        const existing = (existingApprovalAnswers as any[]).find((a: any) => a.field_id === p.field_id);
        const ansPayload: any = {
          conforme: false,
          observacao: p.motivo.trim(),
        };
        if (existing) {
          await (supabase as any).from("operational_approval_answers")
            .update(ansPayload).eq("id", existing.id);
        } else {
          await (supabase as any).from("operational_approval_answers").insert({
            assignment_id: assignmentId,
            field_id: p.field_id,
            resposta: "nao_conforme",
            respondido_por: profile.id,
            respondido_em: new Date().toISOString(),
            ...ansPayload,
          });
        }
      }

      // Devolve a tarefa ao executor (status DEVOLVIDA via reprovar_devolver_final)
      await transition.mutateAsync({
        assignmentId,
        action: "reprovar_devolver_final",
        motivo: motivoGeral || `${perguntas.length} pergunta(s) devolvida(s) para refazer pelo aprovador`,
        origem: "aprovacao_devolver_perguntas",
        extraData: {
          aprovadorId: profile.id,
          rodadaAtual: rodada,
          total_perguntas_devolvidas: perguntas.length,
          modo: "devolver_perguntas_sem_plano",
        },
      });

      await (supabase as any).from("operational_execution_logs").insert({
        assignment_id: assignmentId,
        acao: "aprovador_devolveu_perguntas_para_refazer",
        executado_por: profile.id,
        detalhes: {
          total_perguntas: perguntas.length,
          rodada,
          field_ids: perguntas.map(p => p.field_id),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_aprovacao_assignments"] });
      qc.invalidateQueries({ queryKey: ["operational_my_assignments"] });
      qc.invalidateQueries({ queryKey: ["operational_approval_field_reviews", assignmentId] });
      toast.success("Perguntas devolvidas ao executor para refazer.");
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
    autoSaveApproverAnswer,
    pendingContingencies,
    getBlockingReasons,
    finalDecision,
    criarPlanosAcaoEDevolver,
    devolverPerguntasParaRefazer,
    isSaving: finalDecision.isPending || saveApproverAnswers.isPending || criarPlanosAcaoEDevolver.isPending || devolverPerguntasParaRefazer.isPending,
  };
}
