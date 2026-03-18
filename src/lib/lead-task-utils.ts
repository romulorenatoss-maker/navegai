/**
 * Shared utilities for lead task scheduling and expiration.
 * Weekend rule: Saturday and Sunday do NOT count as delays.
 * Tasks that fall on weekends have their deadline extended to Monday 12:00.
 * After Monday 12:00, if still not done, they are marked as delayed.
 */

export function getPeriodoEndHour(periodo: string): number {
  if (periodo === "manha") return 12;
  if (periodo === "tarde") return 18;
  return 24; // noite → meia-noite
}

export const PERIODO_LABELS: Record<string, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
};

export const PERIODO_HORA: Record<string, number> = {
  manha: 9,
  tarde: 14,
  noite: 19,
};

/**
 * Returns true if the given date falls on Saturday (6) or Sunday (0).
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Given a deadline date, if it falls on a weekend, extend it to Monday 12:00.
 * Otherwise return the original deadline.
 */
export function getEffectiveDeadline(tarefaDate: Date, periodo: string): Date {
  const deadline = new Date(tarefaDate);
  deadline.setHours(getPeriodoEndHour(periodo), 0, 0, 0);

  if (isWeekend(deadline)) {
    // Move to next Monday at 12:00
    const day = deadline.getDay();
    const daysUntilMonday = day === 0 ? 1 : (8 - day); // Sunday=1, Saturday=2
    deadline.setDate(deadline.getDate() + daysUntilMonday);
    deadline.setHours(12, 0, 0, 0);
  }

  return deadline;
}

/**
 * Checks if a task is expired considering the weekend rule.
 * Tasks on weekends are NOT considered expired until Monday 12:00.
 */
export function isTarefaExpirada(tarefa: {
  data_contato: string;
  periodo: string;
  status: string;
}): boolean {
  if (tarefa.status === "realizado" || tarefa.status === "aguardando_visualizacao") {
    return false;
  }

  const now = new Date();

  // If right now is weekend, nothing is expired
  if (isWeekend(now)) {
    return false;
  }

  const dataContato = new Date(tarefa.data_contato);
  const deadline = getEffectiveDeadline(dataContato, tarefa.periodo);

  return now > deadline;
}

/**
 * Skips weekends when scheduling a future date.
 * If the resulting date falls on Saturday or Sunday, moves to next Monday.
 */
export function skipWeekend(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  if (day === 6) result.setDate(result.getDate() + 2); // Saturday → Monday
  if (day === 0) result.setDate(result.getDate() + 1); // Sunday → Monday
  return result;
}
