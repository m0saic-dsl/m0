import type { M0Axis } from "@m0saic/dsl";
import type { ReductionMode } from "../../../types";

export interface MeasureRange {
  a: number;
  b: number;
}

/**
 * Validate measure split range inputs.
 *
 * Centralizes the precondition checks shared by measureSplitBySpan and
 * measureSplitByLogicalIndex: N >= 2, non-empty ranges, a <= b, bounds.
 */
export function validateMeasureRanges(N: number, ranges: MeasureRange[]): void {
  if (!Number.isFinite(N) || N < 2)
    throw new Error("N must be >= 2");
  if (ranges.length === 0)
    throw new Error("ranges must not be empty");

  for (const r of ranges) {
    if (r.a > r.b) throw new Error(`Invalid range: a(${r.a}) > b(${r.b})`);
    if (r.a < 0 || r.b >= N)
      throw new Error(`Range [${r.a}..${r.b}] out of bounds for N=${N}`);
  }
}

/**
 * Normalize an array of kept ranges: sort by start, merge only true overlaps.
 *
 * Overlapping ranges (`cur.a <= last.b`) are merged into a single group.
 * Adjacent ranges (`cur.a === last.b + 1`) are **not** merged — they remain
 * distinct kept groups so each produces its own `> ... F` run.
 */
export function normalizeGroups(ranges: MeasureRange[]): MeasureRange[] {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((x, y) => x.a - y.a || x.b - y.b);
  const merged: MeasureRange[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = merged[merged.length - 1];
    // Merge only true overlaps, NOT adjacency
    if (cur.a <= last.b) {
      last.b = Math.max(last.b, cur.b);
    } else {
      merged.push({ ...cur });
    }
  }

  return merged;
}

/**
 * Build an array of measure tokens for an N-slot split.
 *
 * Each kept group `[a..b]` produces:
 *   - positions `a..b-1` → `">"`  (passthrough)
 *   - position `b` → `"F"`        (claimant)
 *
 * Each uncovered gap produces:
 *   - all but last position → `">"`  (passthrough)
 *   - last position → `"-"`          (null/sink)
 *
 * @param N       Total number of slots (>= 2)
 * @param groups  Normalized, non-overlapping, sorted kept groups
 * @returns       Array of N token strings
 */
export function buildMeasureTokens(N: number, groups: MeasureRange[]): string[] {
  const tokens: (string | null)[] = new Array(N).fill(null);

  // Fill kept groups: > run ending in F
  for (const { a, b } of groups) {
    for (let i = a; i < b; i++) tokens[i] = ">";
    tokens[b] = "F";
  }

  // Fill gaps: > run ending in -
  let gapStart: number | null = null;
  for (let i = 0; i <= N; i++) {
    if (i < N && tokens[i] === null) {
      if (gapStart === null) gapStart = i;
    } else {
      if (gapStart !== null) {
        const gapEnd = i - 1;
        for (let j = gapStart; j < gapEnd; j++) tokens[j] = ">";
        tokens[gapEnd] = "-";
        gapStart = null;
      }
    }
  }

  // Sanity: every slot must be assigned
  for (let i = 0; i < N; i++) {
    if (tokens[i] === null) {
      throw new Error(`buildMeasureTokens: slot ${i} unassigned (bug)`);
    }
  }

  return tokens as string[];
}

/**
 * GCD of two non-negative integers (assumes a >= 0, b >= 0).
 */
function gcd(a: number, b: number): number {
  while (b !== 0) { [a, b] = [b, a % b]; }
  return a;
}

/**
 * Reduce a measure split by GCD when all run lengths share a common divisor.
 *
 * Example: N=100, groups=[{0,24},{25,99}] → lengths [25, 75].
 * GCD(25, 75) = 25. Reduced: N=4, groups=[{0,0},{1,3}].
 *
 * Returns the reduced { N, groups } or the input unchanged if no reduction
 * is possible (GCD === 1 or boundaries don't align).
 */
export function reduceMeasureGroups(
  N: number,
  groups: MeasureRange[],
): { N: number; groups: MeasureRange[] } {
  if (N < 2 || groups.length === 0) return { N, groups };

  // Compute all run lengths in order: leading gap, groups, inter-group gaps, trailing gap.
  const lengths: number[] = [];
  let cursor = 0;
  for (const g of groups) {
    if (g.a > cursor) lengths.push(g.a - cursor); // gap before group
    lengths.push(g.b - g.a + 1); // kept group
    cursor = g.b + 1;
  }
  if (cursor < N) lengths.push(N - cursor); // trailing gap

  // With only one run length, there's nothing to GCD against — reducing
  // by `d = lengths[0]` would collapse the fragment to a single slot,
  // which is invalid m0 (a 1-slot split is illegal). The reduction
  // story only makes sense when multiple runs share a divisor.
  if (lengths.length < 2) return { N, groups };

  // GCD of all run lengths
  let d = lengths[0];
  for (let i = 1; i < lengths.length && d > 1; i++) d = gcd(d, lengths[i]);
  if (d <= 1) return { N, groups };

  // Guard against any other path that would collapse N below 2.
  if (N / d < 2) return { N, groups };

  // Scale down
  const reducedGroups: MeasureRange[] = groups.map((g) => ({
    a: g.a / d,
    b: (g.b + 1) / d - 1,
  }));
  return { N: N / d, groups: reducedGroups };
}

/**
 * Build a measure-mode split fragment string.
 *
 * @param axis    `"col"` → `N(...)`, `"row"` → `N[...]`
 * @param N       Total number of slots
 * @param groups  Normalized kept groups
 * @param mode    `"optimized"` (default) reduces by GCD; `"literal"` preserves N
 */
export function buildMeasureFragment(
  axis: M0Axis,
  N: number,
  groups: MeasureRange[],
  mode: ReductionMode = "optimized",
): string {
  const { N: outN, groups: outGroups } =
    mode === "optimized" ? reduceMeasureGroups(N, groups) : { N, groups };
  const tokens = buildMeasureTokens(outN, outGroups);
  const inner = tokens.join(",");
  return axis === "col" ? `${outN}(${inner})` : `${outN}[${inner}]`;
}
