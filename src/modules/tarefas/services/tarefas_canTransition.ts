/**
 * Guard central de transição de status (camada declarativa).
 *
 * Espelha VALID_TRANSITIONS + checagem de papel.
 * Hook useOperationalTransition é o executor real.
 *
 * Adições da Fase 1 são puramente aditivas — fluxo legado intacto.
 */
import type { OperationalRole } from "./tarefas_rbac";
import { TASK_STATUS } from "./tarefas_statusConstants";

export const VALID_TRANSITIONS: Record<string, string[]> = {
  // Legado
  [TASK_STATUS.PENDENTE]: [TASK_STATUS.EM_ANDAMENTO, TASK_STATUS.AGUARDANDO_ACEITE_PRAZO, TASK_STATUS.CANCELADA],
  [TASK_STATUS.EM_ANDAMENTO]: [
    TASK_STATUS.AGUARDANDO_AVALIACAO,
    TASK_STATUS.AGUARDANDO_VALIDACAO,
    TASK_STATUS.CONTINGENCIADO,
    TASK_STATUS.AGUARDANDO_ACEITE_PRAZO, // renegociação no meio da execução
    TASK_STATUS.CANCELADA,                // cancelar pelo solicitante
  ],
  [TASK_STATUS.AGUARDANDO_AVALIACAO]: [TASK_STATUS.EM_AVALIACAO],
  [TASK_STATUS.EM_AVALIACAO]: [
    TASK_STATUS.AGUARDANDO_APROVACAO,
    TASK_STATUS.CONCLUIDA,
    TASK_STATUS.DEVOLVIDA,
    TASK_STATUS.CONTINGENCIADO,
    TASK_STATUS.REPROVADA,
    TASK_STATUS.EM_PLANO_ACAO,
  ],
  [TASK_STATUS.CONTINGENCIADO]: [TASK_STATUS.AGUARDANDO_APROVACAO, TASK_STATUS.EM_ANDAMENTO],
  [TASK_STATUS.AGUARDANDO_APROVACAO]: [TASK_STATUS.APROVADA, TASK_STATUS.DEVOLVIDA, TASK_STATUS.CONCLUIDA],
  [TASK_STATUS.AGUARDANDO_VALIDACAO]: [
    TASK_STATUS.APROVADA,
    TASK_STATUS.CONCLUIDA,
    TASK_STATUS.DEVOLVIDA,
    TASK_STATUS.EM_PLANO_ACAO,
    TASK_STATUS.AGUARDANDO_AVALIACAO,
  ],
  [TASK_STATUS.DEVOLVIDA]: [TASK_STATUS.EM_ANDAMENTO, TASK_STATUS.CANCELADA],
  [TASK_STATUS.CONCLUIDA]: [TASK_STATUS.EM_ANDAMENTO],
  [TASK_STATUS.APROVADA]: [TASK_STATUS.EM_ANDAMENTO],
  [TASK_STATUS.REPROVADA]: [TASK_STATUS.EM_ANDAMENTO],
  [TASK_STATUS.NAO_EXECUTADA]: [TASK_STATUS.EM_ANDAMENTO],

  // Fase 1
  [TASK_STATUS.ABERTA]: [
    TASK_STATUS.EM_ANDAMENTO,
    TASK_STATUS.AGUARDANDO_ACEITE_PRAZO,
    TASK_STATUS.CANCELADA,
  ],
  [TASK_STATUS.AGUARDANDO_ACEITE_PRAZO]: [
    TASK_STATUS.EM_ANDAMENTO,
    TASK_STATUS.ABERTA,
    TASK_STATUS.CANCELADA,
  ],
  [TASK_STATUS.EM_PLANO_ACAO]: [
    TASK_STATUS.EM_ANDAMENTO,
    TASK_STATUS.AGUARDANDO_VALIDACAO,
  ],
  [TASK_STATUS.REABERTA]: [TASK_STATUS.EM_ANDAMENTO],
  [TASK_STATUS.CANCELADA]: [TASK_STATUS.EM_ANDAMENTO], // somente admin pode "des-cancelar"
};

/** Quem pode disparar cada transição de destino. ADMIN sempre permitido. */
const ROLE_FOR_TARGET: Record<string, OperationalRole[]> = {
  [TASK_STATUS.EM_ANDAMENTO]:           ["EXECUTOR", "CRIADOR_DESIGNANTE", "ADMIN"],
  [TASK_STATUS.AGUARDANDO_AVALIACAO]:   ["EXECUTOR", "CRIADOR_DESIGNANTE", "ADMIN"],
  [TASK_STATUS.AGUARDANDO_VALIDACAO]:   ["EXECUTOR", "ADMIN"],
  [TASK_STATUS.AGUARDANDO_ACEITE_PRAZO]:["EXECUTOR", "CRIADOR_DESIGNANTE", "ADMIN"],
  [TASK_STATUS.EM_AVALIACAO]:           ["AVALIADOR", "ADMIN"],
  [TASK_STATUS.CONTINGENCIADO]:         ["EXECUTOR", "AVALIADOR", "ADMIN"],
  [TASK_STATUS.AGUARDANDO_APROVACAO]:   ["AVALIADOR", "ADMIN"],
  [TASK_STATUS.APROVADA]:               ["APROVADOR", "CRIADOR_DESIGNANTE", "ADMIN"],
  [TASK_STATUS.CONCLUIDA]:              ["AVALIADOR", "APROVADOR", "CRIADOR_DESIGNANTE", "EXECUTOR", "ADMIN"],
  [TASK_STATUS.DEVOLVIDA]:              ["AVALIADOR", "APROVADOR", "CRIADOR_DESIGNANTE", "ADMIN"],
  [TASK_STATUS.REPROVADA]:              ["AVALIADOR", "ADMIN"],
  [TASK_STATUS.EM_PLANO_ACAO]:          ["CRIADOR_DESIGNANTE", "AVALIADOR", "ADMIN"],
  [TASK_STATUS.CANCELADA]:              ["CRIADOR_DESIGNANTE", "ADMIN"], // restrição extra de status atual no service
  [TASK_STATUS.REABERTA]:               ["CRIADOR_DESIGNANTE", "ADMIN"],
  [TASK_STATUS.ABERTA]:                 ["EXECUTOR", "CRIADOR_DESIGNANTE", "ADMIN"],
};

export interface TransitionCheck {
  allowed: boolean;
  reason?: string;
}

export function canTransition(
  currentStatus: string,
  nextStatus: string,
  role: OperationalRole | null,
): TransitionCheck {
  const allowedNext = VALID_TRANSITIONS[currentStatus] ?? [];
  if (!allowedNext.includes(nextStatus)) {
    return { allowed: false, reason: `Transição inválida: ${currentStatus} → ${nextStatus}.` };
  }
  if (role === "ADMIN") return { allowed: true };
  const roles = ROLE_FOR_TARGET[nextStatus] ?? [];
  if (!role || !roles.includes(role)) {
    return { allowed: false, reason: `Seu perfil não permite levar a tarefa para "${nextStatus}".` };
  }
  return { allowed: true };
}
