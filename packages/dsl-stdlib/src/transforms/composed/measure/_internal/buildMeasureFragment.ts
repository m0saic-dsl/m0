import type { M0Axis } from "@m0saic/dsl";

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
 * Build a measure-mode split fragment string.
 *
 * @param axis    `"col"` → `N(...)`, `"row"` → `N[...]`
 * @param N       Total number of slots
 * @param groups  Normalized kept groups
 */
export function buildMeasureFragment(
  axis: M0Axis,
  N: number,
  groups: MeasureRange[],
): string {
  const tokens = buildMeasureTokens(N, groups);
  const inner = tokens.join(",");
  return axis === "col" ? `${N}(${inner})` : `${N}[${inner}]`;
}
