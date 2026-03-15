/**
 * Centralized score color thresholds:
 * >= 85% → green (success)
 * 75-84% → yellow (warning)
 * < 75%  → red (destructive)
 */
export function getScoreColorClass(score: number): string {
  if (score >= 85) return "text-success";
  if (score >= 75) return "text-warning";
  return "text-destructive";
}

export function getScoreBgClass(score: number): string {
  if (score >= 85) return "bg-success/10";
  if (score >= 75) return "bg-warning/10";
  return "bg-destructive/10";
}
