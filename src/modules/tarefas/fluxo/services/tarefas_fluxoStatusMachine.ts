/**
 * tarefas_fluxoStatusMachine.ts
 *
 * Máquina de status do fluxo executor → aprovador → auditor.
 * Funções PURAS que tomam status + planos pendentes e retornam permissões.
 *
 * Regras obrigatórias (do documento de rebuild):
 *  - executor só edita original ANTES de enviar
 *  - em DEVOLVIDA, executor só responde plano do aprovador (não edita original)
 *  - aprovador NÃO aprova se há plano pendente (do aprovador ou do auditor)
 *  - aprovador NÃO cria plano livre quando há plano do auditor pendente,
 *    exceto na pergunta liberada pelo auditor (mesmo field_id)
 *  - auditor só age em AGUARDANDO_AUDITORIA
 */

import {
  TAREFAS_FLUXO_STATUS,
  type TarefasFluxoStatus,
  type PlanoAprovador,
  type PlanoAuditor,
} from "../types/tarefas_fluxoTypes";

const FINAL_STATUSES: Set<string> = new Set([
  TAREFAS_FLUXO_STATUS.CONCLUIDA,
  TAREFAS_FLUXO_STATUS.APROVADA,
  TAREFAS_FLUXO_STATUS.REPROVADA,
]);

export function isFinal(status: string): boolean {
  return FINAL_STATUSES.has(status);
}

/**
 * Executor pode editar a resposta original?
 * Sim apenas em pendente/em_andamento. Em devolvida o original já está
 * congelado — executor só responde plano (regra 19.2).
 */
export function canExecutorEditOriginal(status: string): boolean {
  return (
    status === TAREFAS_FLUXO_STATUS.PENDENTE ||
    status === TAREFAS_FLUXO_STATUS.EM_ANDAMENTO
  );
}

/**
 * Executor pode enviar as respostas originais (RPC tarefas_rpc_executor_enviar_respostas)?
 */
export function canExecutorEnviarRespostas(status: string): boolean {
  return (
    status === TAREFAS_FLUXO_STATUS.PENDENTE ||
    status === TAREFAS_FLUXO_STATUS.EM_ANDAMENTO ||
    status === TAREFAS_FLUXO_STATUS.DEVOLVIDA
  );
}

/**
 * Executor pode responder algum plano do aprovador?
 * Sim se status é devolvida E há plano pendente.
 */
export function canExecutorResponderPlanoAprovador(
  status: string,
  planosAprovadorPendentes: PlanoAprovador[],
): boolean {
  return (
    status === TAREFAS_FLUXO_STATUS.DEVOLVIDA &&
    planosAprovadorPendentes.length > 0
  );
}

/**
 * Aprovador pode criar plano para executor numa pergunta específica?
 *
 * Regras:
 *  - status precisa estar em aguardando_aprovacao (ou em_andamento)
 *  - se há plano do auditor pendente, só pode criar plano na pergunta
 *    EXATAMENTE liberada pelo auditor (mesmo field_id em algum plano auditor pendente)
 */
export function canAprovadorCriarPlanoExecutor(
  status: string,
  planosAuditorPendentes: PlanoAuditor[],
  fieldId: string,
): boolean {
  const statusOk =
    status === TAREFAS_FLUXO_STATUS.AGUARDANDO_APROVACAO ||
    status === TAREFAS_FLUXO_STATUS.EM_ANDAMENTO;
  if (!statusOk) return false;

  if (planosAuditorPendentes.length === 0) return true;

  // Só permite na pergunta liberada pelo auditor
  return planosAuditorPendentes.some((p) => p.field_id === fieldId);
}

/**
 * Aprovador pode aprovar e enviar para auditoria?
 *
 * Bloqueia se há plano (do aprovador ou do auditor) pendente.
 */
export function canAprovadorAprovarParaAuditoria(
  status: string,
  planosAprovadorPendentes: PlanoAprovador[],
  planosAuditorPendentes: PlanoAuditor[],
): boolean {
  if (status !== TAREFAS_FLUXO_STATUS.AGUARDANDO_APROVACAO) return false;
  if (planosAprovadorPendentes.length > 0) return false;
  if (planosAuditorPendentes.length > 0) return false;
  return true;
}

/**
 * Aprovador pode responder algum plano do auditor?
 * Sim quando status volta para aguardando_aprovacao E há plano pendente.
 */
export function canAprovadorResponderPlanoAuditor(
  status: string,
  planosAuditorPendentes: PlanoAuditor[],
): boolean {
  return (
    status === TAREFAS_FLUXO_STATUS.AGUARDANDO_APROVACAO &&
    planosAuditorPendentes.length > 0
  );
}

/**
 * Auditor pode criar plano para aprovador?
 * Só em aguardando_auditoria.
 */
export function canAuditorCriarPlanoAprovador(status: string): boolean {
  return status === TAREFAS_FLUXO_STATUS.AGUARDANDO_AUDITORIA;
}

/**
 * Auditor pode aprovar/concluir a auditoria?
 * Status precisa ser aguardando_auditoria E sem planos pendentes do auditor.
 */
export function canAuditorAprovar(
  status: string,
  planosAuditorPendentes: PlanoAuditor[],
): boolean {
  return (
    status === TAREFAS_FLUXO_STATUS.AGUARDANDO_AUDITORIA &&
    planosAuditorPendentes.length === 0
  );
}

// ============================================================================
// Helpers de rótulo para UI
// ============================================================================
export function statusLabel(status: string): string {
  switch (status) {
    case TAREFAS_FLUXO_STATUS.PENDENTE:
      return "Pendente";
    case TAREFAS_FLUXO_STATUS.EM_ANDAMENTO:
      return "Em execução";
    case TAREFAS_FLUXO_STATUS.AGUARDANDO_APROVACAO:
      return "Aguardando aprovação";
    case TAREFAS_FLUXO_STATUS.DEVOLVIDA:
      return "Devolvida ao executor";
    case TAREFAS_FLUXO_STATUS.AGUARDANDO_AUDITORIA:
      return "Aguardando auditoria";
    case TAREFAS_FLUXO_STATUS.CONCLUIDA:
      return "Concluída";
    case TAREFAS_FLUXO_STATUS.APROVADA:
      return "Aprovada";
    case TAREFAS_FLUXO_STATUS.REPROVADA:
      return "Reprovada";
    default:
      return status?.replace(/_/g, " ") ?? "—";
  }
}
