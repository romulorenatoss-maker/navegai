/**
 * Centralized Operational Assignment Status Transition Service
 *
 * Single source of truth para mudanças de status. Toda tela usa este hook.
 *
 * Fluxo legado (rotina/inspeção) preservado.
 * Fase 1 (avulsa) adicionada de forma aditiva.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { TASK_STATUS } from "@/modules/tarefas/services/tarefas_statusConstants";
import { VALID_TRANSITIONS } from "@/modules/tarefas/services/tarefas_canTransition";
import { SOLICITANTE_CAN_CANCEL } from "@/modules/tarefas/services/tarefas_statusConstants";

export type TransitionAction =
  // Legado
  | "iniciar"
  | "enviar_avaliacao"
  | "enviar_validacao_designante"
  | "validar_designada_aprovar"
  | "validar_designada_devolver"
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
  | "admin_reabrir_edicao"
  // Fase 1 — fluxo avulsa
  | "aceitar_tarefa"
  | "negociar_prazo_executor"
  | "aceitar_renegociacao_solicitante"
  | "manter_prazo_solicitante"
  | "recusar_renegociacao_solicitante"
  | "responder_executor"
  | "validar_solicitante_aprovar"
  | "validar_solicitante_devolver"
  | "solicitar_plano_acao"
  | "concluir_plano_acao"
  | "cancelar_solicitante"
  | "cancelar_admin"
  | "reabrir_solicitante"
  | "reabrir_admin"
  | "invalidar_admin";

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

async function getAssignmentSnapshot(assignmentId: string): Promise<{ status: string; created_by: string | null; responsavel_id: string | null }> {
  const { data, error } = await (supabase as any)
    .from("operational_assignments")
    .select("status, created_by, responsavel_id")
    .eq("id", assignmentId)
    .single();
  if (error) throw new Error("Não foi possível verificar status da tarefa.");
  return data;
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

function resolveTargetStatus(action: TransitionAction, _currentStatus: string, extraData?: Record<string, any>): string {
  switch (action) {
    // Legado
    case "iniciar": return TASK_STATUS.EM_ANDAMENTO;
    case "enviar_avaliacao": return TASK_STATUS.AGUARDANDO_AVALIACAO;
    case "enviar_validacao_designante": return TASK_STATUS.AGUARDANDO_VALIDACAO;
    case "validar_designada_aprovar": return TASK_STATUS.APROVADA;
    case "validar_designada_devolver": return TASK_STATUS.DEVOLVIDA;
    case "iniciar_avaliacao": return TASK_STATUS.EM_AVALIACAO;
    case "avaliar_aprovar": return extraData?.requerAprovacao ? TASK_STATUS.AGUARDANDO_APROVACAO : TASK_STATUS.CONCLUIDA;
    case "avaliar_devolver": return TASK_STATUS.DEVOLVIDA;
    case "avaliar_reprovar": return TASK_STATUS.REPROVADA;
    case "enviar_contingencia": return TASK_STATUS.CONTINGENCIADO;
    case "retornar_avaliacao": return TASK_STATUS.AGUARDANDO_AVALIACAO;
    case "aprovar_final": return TASK_STATUS.APROVADA;
    case "reprovar_devolver_final": return TASK_STATUS.DEVOLVIDA;
    case "encerrar_final": return TASK_STATUS.CONCLUIDA;
    case "reabrir":
    case "admin_reabrir_edicao":
      return TASK_STATUS.EM_ANDAMENTO;

    // Fase 1
    case "aceitar_tarefa": return TASK_STATUS.EM_ANDAMENTO;
    case "negociar_prazo_executor": return TASK_STATUS.AGUARDANDO_ACEITE_PRAZO;
    case "aceitar_renegociacao_solicitante": return TASK_STATUS.EM_ANDAMENTO;
    case "manter_prazo_solicitante": return TASK_STATUS.EM_ANDAMENTO;
    case "recusar_renegociacao_solicitante": return TASK_STATUS.CANCELADA;
    case "responder_executor":
      // D3: auto-conclusão se aplicável é decidida no service via extraData.autoConcluir
      return extraData?.autoConcluir ? TASK_STATUS.CONCLUIDA : TASK_STATUS.AGUARDANDO_VALIDACAO;
    case "validar_solicitante_aprovar":
      return extraData?.requerAvaliacao
        ? TASK_STATUS.AGUARDANDO_AVALIACAO
        : extraData?.requerAprovacao
          ? TASK_STATUS.AGUARDANDO_APROVACAO
          : TASK_STATUS.CONCLUIDA;
    case "validar_solicitante_devolver": return TASK_STATUS.DEVOLVIDA;
    case "solicitar_plano_acao": return TASK_STATUS.EM_PLANO_ACAO;
    case "concluir_plano_acao": return TASK_STATUS.AGUARDANDO_VALIDACAO;
    case "cancelar_solicitante":
    case "cancelar_admin":
      return TASK_STATUS.CANCELADA;
    case "reabrir_solicitante":
    case "reabrir_admin":
      return TASK_STATUS.EM_ANDAMENTO;
    case "invalidar_admin":
      // não troca status — apenas marca em audit
      return _currentStatus;
    default: throw new Error(`Ação desconhecida: ${action}`);
  }
}

function validateTransition(currentStatus: string, targetStatus: string, action: TransitionAction): void {
  if (action === "invalidar_admin") return; // não muda status
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(targetStatus)) {
    throw new Error(
      `Transição inválida: ${currentStatus} → ${targetStatus} (ação: ${action}). Permitido: ${allowed.join(", ") || "nenhuma"}.`
    );
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
      ...(extraData ? { extra: extraData } : {}),
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
      const snap = await getAssignmentSnapshot(assignmentId);
      const currentStatus = snap.status;
      const targetStatus = resolveTargetStatus(action, currentStatus, extraData);

      validateTransition(currentStatus, targetStatus, action);

      // Restrição extra (D4): cancelamento do solicitante limitado
      if (action === "cancelar_solicitante" && !SOLICITANTE_CAN_CANCEL.includes(currentStatus as any)) {
        throw new Error(
          "O solicitante só pode cancelar nas etapas inicial, de aceite de prazo ou em execução. Use 'devolver' ou peça ao admin.",
        );
      }

      // Bloqueia avanço com contingências em aberto
      if ([TASK_STATUS.AGUARDANDO_APROVACAO, TASK_STATUS.CONCLUIDA, TASK_STATUS.APROVADA].includes(targetStatus as any)
          && action !== "encerrar_final" && action !== "validar_solicitante_aprovar") {
        const openCount = await hasOpenContingencies(assignmentId);
        if (openCount > 0) {
          throw new Error(`Não é possível avançar: existem ${openCount} plano de ação(s) pendente(s).`);
        }
      }

      // Motivo obrigatório
      const motivoObrigatorio: TransitionAction[] = [
        "reabrir", "avaliar_devolver", "avaliar_reprovar", "reprovar_devolver_final",
        "validar_designada_devolver", "validar_solicitante_devolver",
        "negociar_prazo_executor", "recusar_renegociacao_solicitante",
        "cancelar_solicitante", "cancelar_admin",
        "reabrir_solicitante", "reabrir_admin",
        "invalidar_admin", "solicitar_plano_acao",
      ];
      if (motivoObrigatorio.includes(action) && !motivo?.trim()) {
        throw new Error("Justificativa/motivo é obrigatório para esta ação.");
      }

      // Build update payload
      const now = new Date().toISOString();
      const updatePayload: Record<string, any> = {
        status: targetStatus,
        updated_at: now,
      };

      if (action === "invalidar_admin") {
        // mantém status; só audit
        delete updatePayload.status;
      }

      if (action === "reabrir" || action === "admin_reabrir_edicao"
          || action === "reabrir_solicitante" || action === "reabrir_admin") {
        Object.assign(updatePayload, REOPEN_CLEAR_FIELDS);
      }

      if (action === "iniciar_avaliacao") {
        updatePayload.avaliador_inicio_em = now;
        if (profile.id) updatePayload.avaliador_id = profile.id;
      }

      if (
        action === "avaliar_devolver"
        || action === "reprovar_devolver_final"
        || action === "validar_designada_devolver"
        || action === "validar_solicitante_devolver"
      ) {
        updatePayload.rodada_atual = (extraData?.rodadaAtual || 1) + 1;
      }

      if (action === "aprovar_final" || action === "encerrar_final") {
        if (extraData?.aprovadorId) updatePayload.aprovador_id = extraData.aprovadorId;
        if (extraData?.scoreFinal != null) updatePayload.score_final_ajustado = extraData.scoreFinal;
      }

      if (action === "avaliar_aprovar" && extraData?.requerAprovacao && extraData?.aprovadorProfileId) {
        updatePayload.aprovador_id = extraData.aprovadorProfileId;
      }

      if (action === "enviar_avaliacao" || action === "enviar_validacao_designante" || action === "responder_executor") {
        updatePayload.fim_em = now;
        if (extraData?.tempoGasto != null) updatePayload.tempo_gasto_minutos = extraData.tempoGasto;
      }

      if (action === "avaliar_aprovar" || action === "avaliar_devolver" || action === "avaliar_reprovar") {
        updatePayload.avaliador_fim_em = now;
      }

      // Negociação de prazo: registrar prazo proposto em campo livre? Sem migration → grava em audit only
      // data_prevista é alterado apenas quando solicitante aceita o novo prazo
      if (action === "aceitar_renegociacao_solicitante" && extraData?.novoPrazo) {
        updatePayload.data_prevista = extraData.novoPrazo;
      }

      // Execute update (somente se há campos a alterar)
      if (Object.keys(updatePayload).length > 0) {
        const { error } = await (supabase as any)
          .from("operational_assignments")
          .update(updatePayload)
          .eq("id", assignmentId);
        if (error) throw error;
      }

      await logAudit(
        assignmentId,
        action,
        profile.id,
        currentStatus,
        action === "invalidar_admin" ? currentStatus : targetStatus,
        origem,
        motivo,
        extraData,
      );

      return { newStatus: action === "invalidar_admin" ? currentStatus : targetStatus, previousStatus: currentStatus };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_my_assignments"] });
      qc.invalidateQueries({ queryKey: ["operational_avaliador_assignments"] });
      qc.invalidateQueries({ queryKey: ["operational_aprovacao_assignments"] });
      qc.invalidateQueries({ queryKey: ["operational_gestao_assignments"] });
      qc.invalidateQueries({ queryKey: ["operational_contingencies_management"] });
      qc.invalidateQueries({ queryKey: ["operational_field_answers"] });
      qc.invalidateQueries({ queryKey: ["operational_review_field_reviews"] });
      qc.invalidateQueries({ queryKey: ["operational_messages"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { transition };
}
