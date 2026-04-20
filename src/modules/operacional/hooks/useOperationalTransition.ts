/**
 * Centralized Operational Assignment Status Transition Service
 * 
 * Single source of truth for ALL status changes on operational_assignments.
 * Every screen (Execução, Avaliação, Aprovação, Gestão, Contingências) MUST use this.
 * 
 * Flow:
 *   pendente → em_andamento → aguardando_avaliacao → em_avaliacao
 *   → [contingencia loop] → aguardando_avaliacao → em_avaliacao
 *   → aguardando_aprovacao (if required) → aprovada/concluida
 *   → devolvida (can re-enter flow)
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  pendente: ["em_andamento"],
  em_andamento: ["aguardando_avaliacao", "aguardando_validacao", "contingenciado"],
  aguardando_avaliacao: ["em_avaliacao"],
  em_avaliacao: ["aguardando_aprovacao", "concluida", "devolvida", "contingenciado", "reprovada"],
  contingenciado: ["aguardando_aprovacao"],
  aguardando_aprovacao: ["aprovada", "devolvida", "concluida"],
  // Novo fluxo: tarefa designada — criador valida
  aguardando_validacao: ["aprovada", "devolvida"],
  devolvida: ["em_andamento"],
  // Terminal
  concluida: ["em_andamento"],
  aprovada: ["em_andamento"],
  reprovada: ["em_andamento"],
  nao_executada: ["em_andamento"],
};

export type TransitionAction =
  | "iniciar"
  | "enviar_avaliacao"
  | "enviar_validacao_designante"   // novo: executor finaliza tarefa designada
  | "validar_designada_aprovar"     // novo: criador valida → aprovada
  | "validar_designada_devolver"    // novo: criador devolve → devolvida
  | "iniciar_avaliacao"
  | "avaliar_aprovar"
  | "avaliar_devolver"
  | "avaliar_reprovar"
  | "enviar_contingencia"
  | "retornar_avaliacao"
  | "aprovar_final"
  | "reprovar_devolver_final"
  | "encerrar_final"
  | "reabrir"
  | "admin_reabrir_edicao";

interface TransitionParams {
  assignmentId: string;
  action: TransitionAction;
  motivo?: string;
  origem: string; // screen/module name for audit
  extraData?: Record<string, any>;
}

interface TransitionResult {
  newStatus: string;
  previousStatus: string;
}

// Fields to clear on reopen
const REOPEN_CLEAR_FIELDS = {
  fim_em: null,
  pontuacao_obtida: null,
  avaliador_inicio_em: null,
  avaliador_fim_em: null,
  score_executor: null,
  score_avaliado: null,
  score_avaliador: null,
  score_final_ajustado: null,
};

async function getAssignmentStatus(assignmentId: string): Promise<string> {
  const { data, error } = await (supabase as any)
    .from("operational_assignments")
    .select("status")
    .eq("id", assignmentId)
    .single();
  if (error) throw new Error("Não foi possível verificar status da tarefa.");
  return data.status;
}

async function hasOpenContingencies(assignmentId: string): Promise<number> {
  const { data, error } = await (supabase as any)
    .from("operational_contingencies")
    .select("id")
    .eq("assignment_id", assignmentId)
    .in("status", ["aberta", "em_andamento", "resolvida"]);
  if (error) throw error;
  return data?.length || 0;
}

function resolveTargetStatus(action: TransitionAction, currentStatus: string, extraData?: Record<string, any>): string {
  switch (action) {
    case "iniciar": return "em_andamento";
    case "enviar_avaliacao": return "aguardando_avaliacao";
    case "iniciar_avaliacao": return "em_avaliacao";
    case "avaliar_aprovar": return extraData?.requerAprovacao ? "aguardando_aprovacao" : "concluida";
    case "avaliar_devolver": return "devolvida";
    case "avaliar_reprovar": return "reprovada";
    case "enviar_contingencia": return "contingenciado";
    case "retornar_avaliacao": return "aguardando_avaliacao";
    case "aprovar_final": return "aprovada";
    case "reprovar_devolver_final": return "devolvida";
    case "encerrar_final": return "concluida";
    case "reabrir":
    case "admin_reabrir_edicao":
      return "em_andamento";
    default: throw new Error(`Ação desconhecida: ${action}`);
  }
}

function validateTransition(currentStatus: string, targetStatus: string, action: TransitionAction): void {
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(targetStatus)) {
    throw new Error(`Transição inválida: ${currentStatus} → ${targetStatus} (ação: ${action}). Permitido: ${allowed.join(", ") || "nenhuma"}.`);
  }
}

async function logAudit(
  assignmentId: string,
  tipoEvento: string,
  executadoPor: string,
  previousStatus: string,
  newStatus: string,
  origem: string,
  motivo?: string,
  extraData?: Record<string, any>,
) {
  await (supabase as any).from("operational_audit_trail").insert({
    assignment_id: assignmentId,
    tipo_evento: tipoEvento,
    executado_por: executadoPor,
    motivo: motivo || null,
    dados_anteriores: { status: previousStatus },
    dados_novos: { status: newStatus, origem, ...extraData },
  });

  await (supabase as any).from("operational_assignment_history").insert({
    assignment_id: assignmentId,
    tipo_evento: `TRANSICAO_${newStatus.toUpperCase()}`,
    usuario_id: executadoPor,
    etapa: origem,
    detalhes_json: {
      acao: tipoEvento,
      status_anterior: previousStatus,
      status_novo: newStatus,
      motivo: motivo || null,
    },
  });
}

export function useOperationalTransition() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const transition = useMutation({
    mutationFn: async (params: TransitionParams): Promise<TransitionResult> => {
      if (!profile?.id) throw new Error("Não autenticado.");

      const { assignmentId, action, motivo, origem, extraData } = params;
      const currentStatus = await getAssignmentStatus(assignmentId);
      const targetStatus = resolveTargetStatus(action, currentStatus, extraData);

      // Validate transition
      validateTransition(currentStatus, targetStatus, action);

      // Block approval/conclusion if open contingencies
      if (["aguardando_aprovacao", "concluida", "aprovada"].includes(targetStatus) && action !== "encerrar_final") {
        const openCount = await hasOpenContingencies(assignmentId);
        if (openCount > 0) {
          throw new Error(`Não é possível avançar: existem ${openCount} contingência(s) pendente(s).`);
        }
      }

      // Require motivo for certain actions
      if (["reabrir", "avaliar_devolver", "avaliar_reprovar", "reprovar_devolver_final"].includes(action) && !motivo?.trim()) {
        throw new Error("Justificativa/motivo é obrigatório para esta ação.");
      }

      // Build update payload
      const now = new Date().toISOString();
      const updatePayload: Record<string, any> = {
        status: targetStatus,
        updated_at: now,
      };

      // Action-specific payload augmentation
      if (action === "reabrir" || action === "admin_reabrir_edicao") {
        Object.assign(updatePayload, REOPEN_CLEAR_FIELDS);
      }

      if (action === "iniciar_avaliacao") {
        updatePayload.avaliador_inicio_em = now;
        if (profile.id) updatePayload.avaliador_id = profile.id;
      }

      if (action === "avaliar_devolver" || action === "reprovar_devolver_final") {
        updatePayload.rodada_atual = (extraData?.rodadaAtual || 1) + 1;
      }

      if (action === "aprovar_final" || action === "encerrar_final") {
        if (extraData?.aprovadorId) updatePayload.aprovador_id = extraData.aprovadorId;
        if (extraData?.scoreFinal != null) updatePayload.score_final_ajustado = extraData.scoreFinal;
      }

      if (action === "avaliar_aprovar" && extraData?.requerAprovacao && extraData?.aprovadorProfileId) {
        updatePayload.aprovador_id = extraData.aprovadorProfileId;
      }

      if (["enviar_avaliacao"].includes(action)) {
        updatePayload.fim_em = now;
        if (extraData?.tempoGasto != null) updatePayload.tempo_gasto_minutos = extraData.tempoGasto;
      }

      if (action === "avaliar_aprovar" || action === "avaliar_devolver" || action === "avaliar_reprovar") {
        updatePayload.avaliador_fim_em = now;
      }

      // Execute update
      const { error } = await (supabase as any)
        .from("operational_assignments")
        .update(updatePayload)
        .eq("id", assignmentId);
      if (error) throw error;

      // Audit log
      await logAudit(assignmentId, action, profile.id, currentStatus, targetStatus, origem, motivo, extraData);

      return { newStatus: targetStatus, previousStatus: currentStatus };
    },
    onSuccess: (_data, params) => {
      // Invalidate all relevant queries
      qc.invalidateQueries({ queryKey: ["operational_my_assignments"] });
      qc.invalidateQueries({ queryKey: ["operational_avaliador_assignments"] });
      qc.invalidateQueries({ queryKey: ["operational_aprovacao_assignments"] });
      qc.invalidateQueries({ queryKey: ["operational_gestao_assignments"] });
      qc.invalidateQueries({ queryKey: ["operational_contingencies_management"] });
      qc.invalidateQueries({ queryKey: ["operational_field_answers"] });
      qc.invalidateQueries({ queryKey: ["operational_review_field_reviews"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { transition };
}
