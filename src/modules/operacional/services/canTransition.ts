/**
 * Guard central de transição de status (camada declarativa).
 *
 * Espelha VALID_TRANSITIONS do useOperationalTransition + adiciona checagem de papel.
 * O hook continua sendo o executor real. Este arquivo é apenas verificação pura
 * (sem I/O) usada para desabilitar botões/validar antes de chamar a mutation.
 */
import type { OperationalRole } from "./operationalRbac";

export const VALID_TRANSITIONS: Record<string, string[]> = {
  pendente: ["em_andamento"],
  em_andamento: ["aguardando_avaliacao", "contingenciado"],
  aguardando_avaliacao: ["em_avaliacao"],
  em_avaliacao: ["aguardando_aprovacao", "concluida", "devolvida", "contingenciado", "reprovada"],
  contingenciado: ["aguardando_aprovacao"],
  aguardando_aprovacao: ["aprovada", "devolvida", "concluida"],
  devolvida: ["em_andamento"],
  concluida: ["em_andamento"],
  aprovada: ["em_andamento"],
  reprovada: ["em_andamento"],
  nao_executada: ["em_andamento"],
};

/** Quem pode disparar cada transição de destino. ADMIN sempre permitido. */
const ROLE_FOR_TARGET: Record<string, OperationalRole[]> = {
  em_andamento:          ["EXECUTOR", "ADMIN"],
  aguardando_avaliacao:  ["EXECUTOR", "ADMIN"],
  em_avaliacao:          ["AVALIADOR", "ADMIN"],
  contingenciado:        ["EXECUTOR", "AVALIADOR", "ADMIN"],
  aguardando_aprovacao:  ["AVALIADOR", "ADMIN"],
  aprovada:              ["APROVADOR", "ADMIN"],
  concluida:             ["AVALIADOR", "APROVADOR", "ADMIN"],
  devolvida:             ["AVALIADOR", "APROVADOR", "ADMIN"],
  reprovada:             ["AVALIADOR", "ADMIN"],
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
