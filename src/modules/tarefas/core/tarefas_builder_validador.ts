/**
 * Núcleo Validador: hidratação determinística sem normalização legado.
 *
 * Mantém configs visíveis (peso, SLA, evidência, opções, regras).
 * Apenas descarta entradas falsy (null/undefined) que possam vir de snapshots quebrados.
 */
export function rebuildValidadorChecks(checks: any[]) {
  return (checks || []).filter(Boolean);
}
