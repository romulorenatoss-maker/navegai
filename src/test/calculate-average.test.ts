import { describe, it, expect } from "vitest";
import { calculateAverage, calculateWeightedAverage } from "@/lib/calculate-average";

describe("calculateAverage", () => {
  it("returns 97.5 for [100, 100, 100, 90]", () => {
    expect(calculateAverage([100, 100, 100, 90])).toBe(97.5);
  });

  it("returns 0 for empty array", () => {
    expect(calculateAverage([])).toBe(0);
  });

  it("ignores null and undefined values", () => {
    expect(calculateAverage([100, null, 100, undefined, 90])).toBe(96.67);
  });

  it("ignores NaN values", () => {
    expect(calculateAverage([100, NaN, 80])).toBe(90);
  });

  it("ignores empty strings", () => {
    expect(calculateAverage([100, "", 80])).toBe(90);
  });

  it("handles string numbers", () => {
    expect(calculateAverage(["100", "90"])).toBe(95);
  });

  it("returns exact value for single element", () => {
    expect(calculateAverage([75.55])).toBe(75.55);
  });

  it("rounds only the final result", () => {
    // 10 + 20 + 30 = 60, 60/3 = 20 exactly
    expect(calculateAverage([10, 20, 30])).toBe(20);
    // 1 + 2 = 3, 3/3 = 1 exactly, but with a value that causes repeating decimal
    expect(calculateAverage([33.33, 33.33, 33.34])).toBe(33.33);
  });
});

describe("calculateWeightedAverage", () => {
  it("calculates weighted average correctly", () => {
    const result = calculateWeightedAverage([
      { value: 80, weight: 3 },
      { value: 90, weight: 2 },
    ]);
    // (80*3 + 90*2) / (3+2) = (240+180)/5 = 84
    expect(result).toBe(84);
  });

  it("ignores null values", () => {
    const result = calculateWeightedAverage([
      { value: 100, weight: 1 },
      { value: null, weight: 1 },
    ]);
    expect(result).toBe(100);
  });

  it("returns 0 for empty input", () => {
    expect(calculateWeightedAverage([])).toBe(0);
  });
});
