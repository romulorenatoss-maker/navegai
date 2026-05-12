/**
 * tarefas_statusConstants.ts — ÚNICA fonte de verdade dos status técnicos.
 *
 * Proibido strings soltas em componentes/hooks/services. Sempre importar daqui.
 *
 * Fase 1 — fluxo da tarefa avulsa (origem='ad_hoc'). Não altera rotinas.
 * Persistido como TEXTO em operational_assignments.status (sem migration).
 */

// ============================================================================
// STATUS CANÔNICOS
// ============================================================================
export const TASK_STATUS = {
  // Estados legados (fluxo rotina/inspeção) — mantidos
  PENDENTE: "pendente",
  EM_ANDAMENTO: "em_andamento",
  AGUARDANDO_AVALIACAO: "aguardando_avaliacao",
  EM_AVALIACAO: "em_avaliacao",
  CONTINGENCIADO: "contingenciado",
  AGUARDANDO_APROVACAO: "aguardando_aprovacao",
  DEVOLVIDA: "devolvida",
  REABERTA: "reaberta",
  CONCLUIDA: "concluida",
  APROVADA: "aprovada",
  REPROVADA: "reprovada",
  NAO_EXECUTADA: "nao_executada",

  // Fluxo avulsa (Fase 1) — novos status persistidos como texto
  ABERTA: "aberta",
  AGUARDANDO_ACEITE_PRAZO: "aguardando_aceite_prazo",
  AGUARDANDO_VALIDACAO: "aguardando_validacao",
  EM_PLANO_ACAO: "em_plano_acao",
  CANCELADA: "cancelada",
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

// ============================================================================
// CLASSIFICAÇÕES
// ============================================================================
export const FINAL_STATUSES: ReadonlyArray<TaskStatus> = [
  TASK_STATUS.CONCLUIDA,
  TASK_STATUS.APROVADA,
  TASK_STATUS.REPROVADA,
  TASK_STATUS.NAO_EXECUTADA,
  TASK_STATUS.CANCELADA,
];

/** Status onde SLA do executor está rodando. */
export const SLA_RUNNING_STATUSES: ReadonlyArray<TaskStatus> = [
  TASK_STATUS.ABERTA,
  TASK_STATUS.PENDENTE,
  TASK_STATUS.EM_ANDAMENTO,
  TASK_STATUS.REABERTA,
  TASK_STATUS.DEVOLVIDA,
  TASK_STATUS.EM_PLANO_ACAO, // D6: SLA continua rodando em plano de ação
  TASK_STATUS.CONTINGENCIADO,
];

/** Status onde solicitante AINDA pode cancelar a tarefa (D4). */
export const SOLICITANTE_CAN_CANCEL: ReadonlyArray<TaskStatus> = [
  TASK_STATUS.ABERTA,
  TASK_STATUS.AGUARDANDO_ACEITE_PRAZO,
  TASK_STATUS.EM_ANDAMENTO,
];

/** Status onde solicitante pode validar/devolver. */
export const SOLICITANTE_CAN_VALIDATE: ReadonlyArray<TaskStatus> = [
  TASK_STATUS.AGUARDANDO_VALIDACAO,
];

// ============================================================================
// LABEL VISUAL — sub-rótulos UI (D2)
// ============================================================================
export interface StatusVisualContext {
  /** Para `aguardando_validacao`: solicitante já visualizou a resposta? */
  seenBySolicitante?: boolean;
  /** Quando renegociação foi iniciada pelo executor? */
  negociacaoIniciadaPor?: "executor" | "solicitante";
}

export function getStatusLabel(status: string, ctx: StatusVisualContext = {}): string {
  switch (status) {
    case TASK_STATUS.ABERTA: return "Aguardando aceite do executor";
    case TASK_STATUS.AGUARDANDO_ACEITE_PRAZO:
      return ctx.negociacaoIniciadaPor === "solicitante"
        ? "Aguardando aceite de novo prazo (executor)"
        : "Renegociação de prazo (aguardando solicitante)";
    case TASK_STATUS.PENDENTE: return "Pendente";
    case TASK_STATUS.EM_ANDAMENTO: return "Em execução";
    case TASK_STATUS.REABERTA: return "Reaberta";
    case TASK_STATUS.AGUARDANDO_VALIDACAO:
      return ctx.seenBySolicitante
        ? "Aguardando validação do solicitante"
        : "Respondida pelo executor";
    case TASK_STATUS.DEVOLVIDA: return "Devolvida ao executor";
    case TASK_STATUS.EM_PLANO_ACAO: return "Em plano de ação";
    case TASK_STATUS.AGUARDANDO_AVALIACAO: return "Aguardando avaliação técnica";
    case TASK_STATUS.EM_AVALIACAO: return "Em avaliação";
    case TASK_STATUS.AGUARDANDO_APROVACAO: return "Aguardando aprovação";
    case TASK_STATUS.APROVADA: return "Aprovada";
    case TASK_STATUS.CONCLUIDA: return "Concluída";
    case TASK_STATUS.REPROVADA: return "Reprovada";
    case TASK_STATUS.CONTINGENCIADO: return "Em contingência";
    case TASK_STATUS.CANCELADA: return "Cancelada";
    case TASK_STATUS.NAO_EXECUTADA: return "Não executada";
    default: return status?.replace(/_/g, " ") ?? "—";
  }
}

export function isFinalStatus(status: string): boolean {
  return FINAL_STATUSES.includes(status as TaskStatus);
}

export function isSlaRunning(status: string): boolean {
  return SLA_RUNNING_STATUSES.includes(status as TaskStatus);
}
