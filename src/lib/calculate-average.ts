/**
 * Centralized average calculation utility.
 * 
 * Rules:
 * - Only counts valid numeric values (ignores null, undefined, NaN, empty strings)
 * - Divides by count of valid values, NOT fixed totals
 * - Rounds only the final result to 2 decimal places
 * - Returns 0 if no valid values
 * 
 * Example: calculateAverage([100, 100, 100, 90]) => 97.5
 */
export function calculateAverage(values: (number | null | undefined | string)[]): number {
  const valid = values.filter(
    (v): v is number | string =>
      v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v))
  );

  if (valid.length === 0) return 0;

  const sum = valid.reduce<number>((acc, v) => acc + Number(v), 0);
  const avg = sum / valid.length;

  return Number(avg.toFixed(2));
}

/**
 * Weighted average: given an array of { value, weight } pairs,
 * computes sum(value * weight) / sum(weight).
 * Ignores entries with null/undefined/NaN values or zero weight.
 * Rounds only the final result to 2 decimal places.
 */
export function calculateWeightedAverage(
  entries: { value: number | null | undefined; weight: number }[]
): number {
  const valid = entries.filter(
    (e) =>
      e.value !== null &&
      e.value !== undefined &&
      !Number.isNaN(e.value) &&
      e.weight > 0
  );

  if (valid.length === 0) return 0;

  const totalWeight = valid.reduce((acc, e) => acc + e.weight, 0);
  if (totalWeight === 0) return 0;

  const weightedSum = valid.reduce((acc, e) => acc + Number(e.value!) * e.weight, 0);

  return Number((weightedSum / totalWeight).toFixed(2));
}
