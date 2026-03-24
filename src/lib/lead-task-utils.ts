/**
 * Shared utilities for lead task scheduling and expiration.
 * Weekend rule: Saturday and Sunday do NOT count as delays.
 * Tasks that fall on weekends have their deadline extended to Monday 12:00.
 * After Monday 12:00, if still not done, they are marked as delayed.
 *
 * IMPORTANT: All hour-based logic uses Brazil timezone (America/Sao_Paulo).
 * This avoids discrepancies when the browser/server runs in a different timezone.
 */

const BRAZIL_TZ = "America/Sao_Paulo";

/**
 * Returns the current hour and day-of-week in Brazil timezone for a given Date.
 */
function getBrazilParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BRAZIL_TZ,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);

  const get = (type: string) => parts.find(p => p.type === type)?.value || "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: parseInt(get("year")),
    month: parseInt(get("month")),
    day: parseInt(get("day")),
    hour: parseInt(get("hour")),
    minute: parseInt(get("minute")),
    weekday: weekdayMap[get("weekday")] ?? new Date(date).getDay(),
  };
}

/**
 * Creates a Date object representing a specific date+hour in Brazil timezone.
 */
function brazilDate(year: number, month: number, day: number, hour: number, minute = 0): Date {
  // Build an ISO string with an estimated offset, then adjust
  const pad = (n: number) => String(n).padStart(2, "0");
  // Brazil is typically UTC-3; we'll create a rough date and then fine-tune
  const guess = new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00-03:00`);
  // Verify the Brazil hour matches; adjust if DST differs
  const actual = getBrazilParts(guess);
  const diffH = hour - actual.hour;
  if (diffH !== 0) {
    guess.setTime(guess.getTime() + diffH * 3600000);
  }
  return guess;
}

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
 * Returns true if the given date falls on Saturday (6) or Sunday (0) in Brazil timezone.
 */
export function isWeekend(date: Date): boolean {
  const { weekday } = getBrazilParts(date);
  return weekday === 0 || weekday === 6;
}

/**
 * Given a deadline date, if it falls on a weekend, extend it to Monday 12:00 Brazil time.
 * Otherwise return the deadline at the period end hour in Brazil time.
 */
export function getEffectiveDeadline(tarefaDate: Date, periodo: string): Date {
  const br = getBrazilParts(tarefaDate);
  const endHour = getPeriodoEndHour(periodo);
  // Handle "noite" (24) as next day 00:00
  let deadlineYear = br.year;
  let deadlineMonth = br.month;
  let deadlineDay = br.day;
  let deadlineHour = endHour;

  if (endHour >= 24) {
    // Noite ends at midnight = next day 00:00
    const nextDay = new Date(tarefaDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextBr = getBrazilParts(nextDay);
    deadlineYear = nextBr.year;
    deadlineMonth = nextBr.month;
    deadlineDay = nextBr.day;
    deadlineHour = 0;
  }

  let deadline = brazilDate(deadlineYear, deadlineMonth, deadlineDay, deadlineHour);

  if (isWeekend(deadline)) {
    // Move to next Monday at 12:00 Brazil time
    const { weekday } = getBrazilParts(deadline);
    const daysUntilMonday = weekday === 0 ? 1 : (8 - weekday); // Sunday=1, Saturday=2
    const monday = new Date(deadline);
    monday.setDate(monday.getDate() + daysUntilMonday);
    const monBr = getBrazilParts(monday);
    deadline = brazilDate(monBr.year, monBr.month, monBr.day, 12);
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

  // If right now is weekend in Brazil, nothing is expired
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
  const { weekday } = getBrazilParts(result);
  if (weekday === 6) result.setDate(result.getDate() + 2); // Saturday → Monday
  if (weekday === 0) result.setDate(result.getDate() + 1); // Sunday → Monday
  return result;
}

/**
 * Sets the hour of a Date in Brazil timezone, returning a new Date.
 * Use this instead of date.setHours() for Brazil-timezone-aware scheduling.
 */
export function setBrazilHour(date: Date, hour: number, minute = 0): Date {
  const br = getBrazilParts(date);
  return brazilDate(br.year, br.month, br.day, hour, minute);
}
