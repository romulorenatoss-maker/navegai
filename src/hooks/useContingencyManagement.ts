import { useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface ContingencyFilters {
  responsavel_id?: string;
  status?: string;
  template_id?: string;
}

// Valid state transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  aberta: ["em_andamento", "descartada"],
  em_andamento: ["resolvida", "descartada"],
  resolvida: ["validada", "aberta"], // aberta = rejection reopens
  validada: [],
  descartada: [],
};

async function assertStatusTransition(contingencyId: string, expectedFrom: string[], targetStatus: string) {
  const { data, error } = await (supabase as any)
    .from("operational_contingencies")
    .select("status")
    .eq("id", contingencyId)
    .single();
  if (error) throw new Error("Não foi possível verificar status atual.");
  const current = data.status;
  if (!expectedFrom.includes(current)) {
    throw new Error(`Transição inválida: ${current} → ${targetStatus}. Permitido apenas de: ${expectedFrom.join(", ")}.`);
  }
  const allowed = VALID_TRANSITIONS[current] || [];
  if (!allowed.includes(targetStatus)) {
    throw new Error(`Transição não permitida: ${current} → ${targetStatus}.`);
  }
  return current;
}

async function assertIsValidador(contingencyId: string, profileId: string, isAdmin: boolean) {
  if (isAdmin) return;
  const { data, error } = await (supabase as any)
    .from("operational_contingencies")
    .select("assignment:operational_assignments!operational_contingencies_assignment_id_fkey(validador_contingencia_id)")
    .eq("id", contingencyId)
    .single();
  if (error) throw new Error("Erro ao verificar validador.");
  const validadorId = data?.assignment?.validador_contingencia_id;
  if (validadorId && validadorId !== profileId) {
    throw new Error("Somente o validador designado ou um administrador pode validar esta contingência.");
  }
}

export async function uploadContingencyAttachment(file: File, contingencyId: string): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${contingencyId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("contingency-attachments")
    .upload(path, file, { upsert: true });
  if (error) throw new Error("Erro ao enviar anexo: " + error.message);
  const { data: urlData } = supabase.storage
    .from("contingency-attachments")
    .getPublicUrl(path);
  return urlData.publicUrl;
}

export function useContingencyManagement(filters: ContingencyFilters = {}) {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data: contingencies = [], isLoading } = useQuery({
    queryKey: ["contingency_management", filters],
    queryFn: async () => {
      let query = (supabase as any)
        .from("operational_contingencies")
        .select(`
          *,
          responsavel:profiles!operational_contingencies_responsavel_id_fkey(id, nome),
          validador:profiles!operational_contingencies_validada_por_fkey(id, nome),
          origin_field:operational_template_fields!operational_contingencies_origin_field_id_fkey(id, label, tipo, peso),
          origin_review:operational_field_reviews!operational_contingencies_origin_review_id_fkey(id, conforme, devolvido, motivo_devolucao, observacao, rodada,
            avaliador:profiles!operational_field_reviews_avaliador_id_fkey(nome)
          ),
          check_answer:operational_execution_check_answers!operational_contingencies_check_answer_id_fkey(id, conforme, observacao, resposta,
            check_item:operational_template_check_items!operational_execution_check_answers_check_item_id_fkey(pergunta)
          ),
          assignment:operational_assignments!operational_contingencies_assignment_id_fkey(
            id, data_prevista, rodada_atual, status, validador_contingencia_id, numero_tarefa,
            avaliado_id, avaliador_id, responsavel_id,
            template:operational_templates!operational_assignments_template_id_fkey(nome),
            executor:profiles!operational_assignments_responsavel_id_fkey(nome),
            avaliado:profiles!operational_assignments_avaliado_id_fkey(id, nome),
            avaliador_profile:profiles!operational_assignments_avaliador_id_fkey(id, nome)
          )
        `)
        .order("created_at", { ascending: false });

      if (filters.responsavel_id) {
        query = query.eq("responsavel_id", filters.responsavel_id);
      }
      if (filters.status) {
        query = query.eq("status", filters.status);
      }

      const { data, error } = await query;
      if (error) {
        console.error("[ContingencyManagement] Query error:", error);
        throw error;
      }
      return data || [];
    },
    staleTime: 15000,
  });

  // Auto-expire: mark SLA-expired em_andamento contingencies and create automatic answers
  const processedExpired = useRef<Set<string>>(new Set());

  const autoExpireContingencies = useCallback(async () => {
    if (!profile?.id) return;
    const expired = contingencies.filter(
      (c: any) =>
        c.status === "em_andamento" &&
        c.prazo_sla &&
        new Date(c.prazo_sla).getTime() < Date.now() &&
        !processedExpired.current.has(c.id)
    );
    if (expired.length === 0) return;

    for (const c of expired) {
      processedExpired.current.add(c.id);
      try {
        const now = new Date().toISOString();

        // Mark contingency as resolved but outside SLA
        await (supabase as any)
          .from("operational_contingencies")
          .update({
            status: "resolvida",
            resolvida_em: now,
            dentro_prazo: false,
            updated_at: now,
          })
          .eq("id", c.id)
          .eq("status", "em_andamento"); // optimistic lock

        // Log the automatic resolution
        await (supabase as any).from("operational_contingency_resolution_logs").insert({
          contingency_id: c.id,
          acao: "resolucao_automatica_sla_vencido",
          executado_por: profile.id,
          observacao: "SLA expirado — resolução automática. Contingência resolvida fora do prazo.",
        });

        // Auto-answer workflow fields: find fields with label matching contingency keywords
        if (c.assignment_id) {
          const { data: assignment } = await (supabase as any)
            .from("operational_assignments")
            .select("template_id")
            .eq("id", c.assignment_id)
            .single();

          if (assignment?.template_id) {
            // Find workflow fields that should be auto-answered
            const { data: fields } = await (supabase as any)
              .from("operational_template_fields")
              .select("id, label, tipo")
              .eq("template_id", assignment.template_id)
              .or("label.ilike.%houve contingencia%,label.ilike.%houve contingência%,label.ilike.%contingencia resolvida%,label.ilike.%contingência resolvida%,label.ilike.%dentro do prazo%");

            if (fields && fields.length > 0) {
              for (const field of fields) {
                const labelLower = field.label.toLowerCase();
                let valorBooleano: boolean;

                if (labelLower.includes("houve contingencia") || labelLower.includes("houve contingência")) {
                  valorBooleano = true; // sim, houve contingência
                } else if (labelLower.includes("resolvida") && labelLower.includes("prazo")) {
                  valorBooleano = false; // não foi resolvida dentro do prazo
                } else if (labelLower.includes("dentro do prazo")) {
                  valorBooleano = false; // não dentro do prazo
                } else {
                  valorBooleano = true; // default: houve contingência
                }

                // Upsert: delete existing then insert
                await (supabase as any)
                  .from("operational_field_answers")
                  .delete()
                  .eq("assignment_id", c.assignment_id)
                  .eq("field_id", field.id);

                await (supabase as any)
                  .from("operational_field_answers")
                  .insert({
                    assignment_id: c.assignment_id,
                    field_id: field.id,
                    respondido_por: profile.id,
                    respondido_em: now,
                    valor_booleano: valorBooleano,
                    valor_texto: `Resposta automática — SLA contingência #${c.numero_contingencia} expirado`,
                    versao: 1,
                  });
              }
            }
          }

          // Log in audit trail
          await (supabase as any).from("operational_audit_trail").insert({
            assignment_id: c.assignment_id,
            tipo_evento: "contingencia_sla_expirado",
            executado_por: profile.id,
            dados_novos: {
              contingency_id: c.id,
              prazo_sla: c.prazo_sla,
              resolvida_em: now,
              dentro_prazo: false,
            },
          });
        }
      } catch (err) {
        console.error("[ContingencyManagement] Auto-expire error:", err);
        processedExpired.current.delete(c.id);
      }
    }

    // Refresh data after processing
    qc.invalidateQueries({ queryKey: ["contingency_management"] });
    qc.invalidateQueries({ queryKey: ["embedded_contingencies"] });
    qc.invalidateQueries({ queryKey: ["field_answers"] });
  }, [contingencies, profile?.id, qc]);

  useEffect(() => {
    autoExpireContingencies();
  }, [autoExpireContingencies]);

  const useResolutionLogs = (contingencyId: string | null) =>
    useQuery({
      queryKey: ["contingency_resolution_logs", contingencyId],
      queryFn: async () => {
        if (!contingencyId) return [];
        const { data, error } = await (supabase as any)
          .from("operational_contingency_resolution_logs")
          .select("*, executor:profiles!operational_contingency_resolution_logs_executado_por_fkey(nome)")
          .eq("contingency_id", contingencyId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      },
      enabled: !!contingencyId,
    });

  // Start treatment — accepts ISO datetime string for SLA deadline
  const startTreatment = useMutation({
    mutationFn: async ({
      contingencyId,
      slaHoras,
      prazoSlaDatetime,
      justificativa,
      evidenciaUrl,
      planoAcao,
      tiposEvidenciaRequeridos,
    }: {
      contingencyId: string;
      slaHoras?: number;
      prazoSlaDatetime?: string;
      justificativa: string;
      evidenciaUrl?: string;
      planoAcao?: string;
      tiposEvidenciaRequeridos?: string[];
    }) => {
      if (!profile?.id) throw new Error("Não autenticado");
      if (!justificativa?.trim()) throw new Error("Justificativa obrigatória.");

      let prazoSla: string;
      if (prazoSlaDatetime) {
        prazoSla = new Date(prazoSlaDatetime).toISOString();
      } else if (slaHoras && slaHoras >= 1) {
        prazoSla = new Date(Date.now() + slaHoras * 3600000).toISOString();
      } else {
        throw new Error("Prazo SLA obrigatório.");
      }

      await assertStatusTransition(contingencyId, ["aberta"], "em_andamento");

      const now = new Date().toISOString();

      const { error } = await (supabase as any)
        .from("operational_contingencies")
        .update({
          status: "em_andamento",
          prazo_sla: prazoSla,
          updated_at: now,
          plano_acao: planoAcao || null,
          tipos_evidencia_requeridos: tiposEvidenciaRequeridos || [],
        })
        .eq("id", contingencyId);
      if (error) throw error;

      await (supabase as any).from("operational_contingency_resolution_logs").insert({
        contingency_id: contingencyId,
        acao: "inicio_tratamento",
        executado_por: profile.id,
        observacao: justificativa,
        evidencia_url: evidenciaUrl || null,
      });

      const { data: cont } = await (supabase as any)
        .from("operational_contingencies")
        .select("assignment_id")
        .eq("id", contingencyId)
        .single();
      if (cont?.assignment_id) {
        await (supabase as any).from("operational_audit_trail").insert({
          assignment_id: cont.assignment_id,
          tipo_evento: "contingencia_inicio_tratamento",
          executado_por: profile.id,
          dados_novos: {
            contingency_id: contingencyId,
            prazo_sla: prazoSla,
            justificativa,
            plano_acao: planoAcao,
            tipos_evidencia_requeridos: tiposEvidenciaRequeridos,
          },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contingency_management"] });
      qc.invalidateQueries({ queryKey: ["embedded_contingencies"] });
      toast.success("Tratamento iniciado com SLA definido.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Resolve contingency
  const resolveContingency = useMutation({
    mutationFn: async ({
      contingencyId,
      observacao,
      evidenciaUrl,
    }: {
      contingencyId: string;
      observacao: string;
      evidenciaUrl?: string;
    }) => {
      if (!profile?.id) throw new Error("Não autenticado");
      if (!observacao.trim()) throw new Error("Ação corretiva obrigatória.");
      await assertStatusTransition(contingencyId, ["em_andamento"], "resolvida");

      const now = new Date().toISOString();

      const { data: contData } = await (supabase as any)
        .from("operational_contingencies")
        .select("prazo_sla, assignment_id")
        .eq("id", contingencyId)
        .single();

      const dentroPrazo = contData?.prazo_sla
        ? new Date(now).getTime() <= new Date(contData.prazo_sla).getTime()
        : true;

      const { error } = await (supabase as any)
        .from("operational_contingencies")
        .update({
          status: "resolvida",
          resolvida_em: now,
          dentro_prazo: dentroPrazo,
          updated_at: now,
        })
        .eq("id", contingencyId);
      if (error) throw error;

      await (supabase as any).from("operational_contingency_resolution_logs").insert({
        contingency_id: contingencyId,
        acao: "resolucao",
        executado_por: profile.id,
        observacao,
        evidencia_url: evidenciaUrl || null,
      });

      const { data: cont } = await (supabase as any)
        .from("operational_contingencies")
        .select("assignment_id")
        .eq("id", contingencyId)
        .single();

      if (cont?.assignment_id) {
        await (supabase as any).from("operational_audit_trail").insert({
          assignment_id: cont.assignment_id,
          tipo_evento: "contingencia_resolvida",
          executado_por: profile.id,
          motivo: observacao,
          dados_novos: { contingency_id: contingencyId },
        });

        await (supabase as any).from("operational_assignment_history").insert({
          assignment_id: cont.assignment_id,
          tipo_evento: "CONTINGENCIA_RESOLVIDA",
          usuario_id: profile.id,
          etapa: "contingencia",
          detalhes_json: { contingency_id: contingencyId, observacao },
        });

        const { data: remaining } = await (supabase as any)
          .from("operational_contingencies")
          .select("id")
          .eq("assignment_id", cont.assignment_id)
          .neq("id", contingencyId)
          .in("status", ["aberta", "em_andamento"]);

        if (!remaining || remaining.length === 0) {
          const { data: assignment } = await (supabase as any)
            .from("operational_assignments")
            .select("status")
            .eq("id", cont.assignment_id)
            .single();

          if (assignment?.status === "contingenciado" || assignment?.status === "contingencia") {
            await (supabase as any).from("operational_assignments")
              .update({ status: "aguardando_aprovacao", updated_at: now })
              .eq("id", cont.assignment_id);

            await (supabase as any).from("operational_assignment_history").insert({
              assignment_id: cont.assignment_id,
              tipo_evento: "STATUS_APROVACAO_FINAL",
              usuario_id: profile.id,
              etapa: "contingencia",
              detalhes_json: { motivo: "Todas as contingências resolvidas", contingency_id: contingencyId },
            });
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contingency_management"] });
      qc.invalidateQueries({ queryKey: ["contingency_resolution_logs"] });
      qc.invalidateQueries({ queryKey: ["embedded_contingencies"] });
      toast.success("Contingência marcada como resolvida.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Validate resolution
  const validateResolution = useMutation({
    mutationFn: async ({
      contingencyId,
      approved,
      observacao,
    }: {
      contingencyId: string;
      approved: boolean;
      observacao?: string;
    }) => {
      if (!profile?.id) throw new Error("Não autenticado");
      await assertIsValidador(contingencyId, profile.id, isAdmin);

      // If rejecting, observacao is required
      if (!approved && !observacao?.trim()) {
        throw new Error("Justificativa obrigatória para rejeição.");
      }

      const targetStatus = approved ? "validada" : "aberta";
      await assertStatusTransition(contingencyId, ["resolvida"], targetStatus);

      const now = new Date().toISOString();
      const updatePayload: any = {
        status: targetStatus,
        updated_at: now,
      };
      if (approved) {
        updatePayload.validada_em = now;
        updatePayload.validada_por = profile.id;
      } else {
        updatePayload.resolvida_em = null;
        updatePayload.justificativa_rejeicao = observacao || null;
      }

      const { error } = await (supabase as any)
        .from("operational_contingencies")
        .update(updatePayload)
        .eq("id", contingencyId);
      if (error) throw error;

      await (supabase as any).from("operational_contingency_resolution_logs").insert({
        contingency_id: contingencyId,
        acao: approved ? "validacao_aprovada" : "validacao_reprovada",
        executado_por: profile.id,
        observacao: observacao || (approved ? "Resolução validada" : "Resolução reprovada — contingência reaberta"),
      });

      const { data: cont } = await (supabase as any)
        .from("operational_contingencies")
        .select("assignment_id")
        .eq("id", contingencyId)
        .single();

      if (cont?.assignment_id) {
        await (supabase as any).from("operational_audit_trail").insert({
          assignment_id: cont.assignment_id,
          tipo_evento: approved ? "contingencia_validada" : "contingencia_reaberta",
          executado_por: profile.id,
          motivo: observacao || null,
          dados_novos: { contingency_id: contingencyId, status: targetStatus },
        });

        if (approved) {
          const { data: remaining } = await (supabase as any)
            .from("operational_contingencies")
            .select("id")
            .eq("assignment_id", cont.assignment_id)
            .neq("id", contingencyId)
            .in("status", ["aberta", "em_andamento", "resolvida"]);

          if (!remaining || remaining.length === 0) {
            const { data: assignment } = await (supabase as any)
              .from("operational_assignments")
              .select("status")
              .eq("id", cont.assignment_id)
              .single();

            if (assignment?.status === "contingenciado" || assignment?.status === "contingencia") {
              await (supabase as any).from("operational_assignments")
                .update({ status: "aguardando_aprovacao", updated_at: now })
                .eq("id", cont.assignment_id);

              await (supabase as any).from("operational_assignment_history").insert({
                assignment_id: cont.assignment_id,
                tipo_evento: "STATUS_APROVACAO_FINAL",
                usuario_id: profile.id,
                etapa: "contingencia",
                detalhes_json: { motivo: "Todas as contingências validadas", contingency_id: contingencyId },
              });
            }
          }
        }

        if (!approved) {
          const { data: assignment } = await (supabase as any)
            .from("operational_assignments")
            .select("status")
            .eq("id", cont.assignment_id)
            .single();

          if (assignment?.status !== "contingenciado" && assignment?.status !== "contingencia") {
            await (supabase as any).from("operational_assignments")
              .update({ status: "contingenciado", updated_at: now })
              .eq("id", cont.assignment_id);
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contingency_management"] });
      qc.invalidateQueries({ queryKey: ["contingency_resolution_logs"] });
      qc.invalidateQueries({ queryKey: ["embedded_contingencies"] });
      toast.success("Validação registrada.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Discard contingency
  const discardContingency = useMutation({
    mutationFn: async ({
      contingencyId,
      observacao,
    }: {
      contingencyId: string;
      observacao: string;
    }) => {
      if (!profile?.id) throw new Error("Não autenticado");
      if (!observacao.trim()) throw new Error("Justificativa obrigatória.");
      await assertStatusTransition(contingencyId, ["aberta", "em_andamento"], "descartada");

      const now = new Date().toISOString();
      const { error } = await (supabase as any)
        .from("operational_contingencies")
        .update({ status: "descartada", updated_at: now })
        .eq("id", contingencyId);
      if (error) throw error;

      await (supabase as any).from("operational_contingency_resolution_logs").insert({
        contingency_id: contingencyId,
        acao: "descarte",
        executado_por: profile.id,
        observacao,
      });

      const { data: cont } = await (supabase as any)
        .from("operational_contingencies")
        .select("assignment_id, origin_field_id, origin_review_id")
        .eq("id", contingencyId)
        .single();
      if (cont?.assignment_id) {
        await (supabase as any).from("operational_audit_trail").insert({
          assignment_id: cont.assignment_id,
          tipo_evento: "contingencia_descartada",
          executado_por: profile.id,
          motivo: observacao,
          dados_novos: { contingency_id: contingencyId },
        });

        // Clear the origin review so the question can be answered again
        if (cont.origin_review_id) {
          await (supabase as any)
            .from("operational_field_reviews")
            .delete()
            .eq("id", cont.origin_review_id);
        }

        // Clear the field answer so it goes back to unanswered
        if (cont.origin_field_id) {
          await (supabase as any)
            .from("operational_field_answers")
            .delete()
            .eq("assignment_id", cont.assignment_id)
            .eq("field_id", cont.origin_field_id);
        }

        // Return the assignment to em_andamento so the evaluator can re-answer
        await (supabase as any).from("operational_assignments")
          .update({ status: "em_andamento", updated_at: now })
          .eq("id", cont.assignment_id);

        await (supabase as any).from("operational_assignment_history").insert({
          assignment_id: cont.assignment_id,
          tipo_evento: "CONTINGENCIA_DESCARTADA_RETORNO",
          usuario_id: profile.id,
          etapa: "contingencia",
          detalhes_json: {
            motivo: "Contingência descartada — pergunta liberada para nova resposta",
            contingency_id: contingencyId,
            origin_field_id: cont.origin_field_id,
            origin_review_id: cont.origin_review_id,
          },
        });
        }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contingency_management"] });
      qc.invalidateQueries({ queryKey: ["embedded_contingencies"] });
      qc.invalidateQueries({ queryKey: ["field_reviews"] });
      qc.invalidateQueries({ queryKey: ["field_answers"] });
      qc.invalidateQueries({ queryKey: ["my_operational_assignments"] });
      qc.invalidateQueries({ queryKey: ["exec_assignments"] });
      toast.success("Contingência descartada — pergunta liberada para nova resposta.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const getSlaInfo = (contingency: any) => {
    // SLA only applies after treatment starts (em_andamento or later)
    if (!contingency.prazo_sla || contingency.status === "aberta") return null;
    const now = new Date().getTime();
    const sla = new Date(contingency.prazo_sla).getTime();
    const diffMs = sla - now;
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    const isExpired = diffMs < 0;
    const agingDays = isExpired ? Math.ceil(Math.abs(diffMs) / (1000 * 60 * 60 * 24)) : 0;

    return {
      diffHours,
      isExpired,
      agingDays,
      label: isExpired
        ? `Vencido há ${agingDays}d`
        : diffHours < 1
        ? "< 1h restante"
        : `${diffHours}h restantes`,
    };
  };

  const canValidate = (contingency: any): boolean => {
    if (isAdmin) return true;
    const validadorId = contingency?.assignment?.validador_contingencia_id;
    return !!validadorId && validadorId === profile?.id;
  };

  const abertas = contingencies.filter((c: any) => c.status === "aberta");
  const emTratamento = contingencies.filter((c: any) => c.status === "em_andamento");
  const resolvidas = contingencies.filter((c: any) => c.status === "resolvida");
  const validadas = contingencies.filter((c: any) => ["validada", "descartada"].includes(c.status));
  const vencidas = contingencies.filter((c: any) => {
    if (["validada", "descartada", "resolvida"].includes(c.status)) return false;
    if (!c.prazo_sla) return false;
    // Only em_andamento can be vencida (aberta has no SLA yet)
    if (c.status !== "em_andamento") return false;
    return new Date(c.prazo_sla).getTime() < Date.now();
  });

  return {
    contingencies,
    isLoading,
    abertas,
    emTratamento,
    resolvidas,
    validadas,
    vencidas,
    startTreatment,
    resolveContingency,
    validateResolution,
    discardContingency,
    getSlaInfo,
    canValidate,
    useResolutionLogs,
    isSaving:
      startTreatment.isPending ||
      resolveContingency.isPending ||
      validateResolution.isPending ||
      discardContingency.isPending,
  };
}
