/**
 * DSL complexity / cost analysis utilities.
 *
 * All functions operate on the canonical form of the DSL string via a single
 * character-by-character scan. No geometry computation or tree parse is
 * performed — these are O(n) in string length and allocation-free (aside from
 * the canonicalization itself).
 *
 * Every public function validates its input first and returns `null` for
 * invalid DSL strings.
 */

import { toCanonicalM0String } from "../format/m0StringFormat";
import { isValidM0String } from "../validate/m0StringValidator";
import { computePrecisionFromString } from "../parse";
import type { ComplexityMetrics } from "../types";

// ─────────────────────────────────────────────────────────────
// Internal scanner
// ─────────────────────────────────────────────────────────────

type NodeCounts = {
  frameCount: number;
  passthroughCount: number;
  nullCount: number;
  groupCount: number;
};

/**
 * Single-pass scan of a **canonical** DSL string.
 *
 * Token classification rules (canonical form: `F`→`1`, `>`→`0`):
 * - Digit sequence followed by `(` or `[` → group prefix
 * - Standalone `1` (followed by `,` `)` `]` `{` or EOF) → frame leaf
 * - Standalone `0` (same context — `0` never starts a group prefix) → passthrough leaf
 * - `-` → null leaf
 * - Everything else (`(`, `)`, `[`, `]`, `{`, `}`, `,`) → structural, not counted
 */
function scanCanonical(s: string): NodeCounts {
  let frameCount = 0;
  let passthroughCount = 0;
  let nullCount = 0;
  let groupCount = 0;

  let i = 0;
  while (i < s.length) {
    const ch = s[i];

    // Digit 1-9: either a group prefix (digits followed by ( or [) or a leaf `1`
    if (ch >= "1" && ch <= "9") {
      let j = i + 1;
      while (j < s.length && s[j] >= "0" && s[j] <= "9") j++;

      if (j < s.length && (s[j] === "(" || s[j] === "[")) {
        groupCount++;
      } else {
        // Standalone digit — in canonical form only `1` is a valid leaf
        frameCount++;
      }
      i = j;
      continue;
    }

    // `0` in canonical form is always a passthrough leaf (never starts a group prefix)
    if (ch === "0") {
      passthroughCount++;
      i++;
      continue;
    }

    if (ch === "-") {
      nullCount++;
      i++;
      continue;
    }

    // Structural characters — skip
    i++;
  }

  return { frameCount, passthroughCount, nullCount, groupCount };
}

/** Canonicalize + validate. Returns the canonical string or `null` if invalid. */
function prepareInput(input: string): string | null {
  const canonical = toCanonicalM0String(input);
  if (!isValidM0String(canonical)) return null;
  return canonical;
}

// ─────────────────────────────────────────────────────────────
// Public API — fast preflight (no validation)
// ─────────────────────────────────────────────────────────────

/**
 * Fast complexity scan — no validation, best-effort results.
 *
 * Canonicalizes and scans in a single pass. Does NOT validate.
 * For invalid input, returned counts are meaningless but harmless.
 * Use `getComplexityMetrics` (which validates) if you need to
 * reject invalid strings.
 *
 * This is the go-to for UI preflight — runs in microseconds
 * on any string length, never returns null, never throws.
 */
export function getComplexityMetricsFast(input: string): ComplexityMetrics {
  const canonical = toCanonicalM0String(input);
  const counts = scanCanonical(canonical);
  const precision = computePrecisionFromString(canonical);

  return {
    frameCount: counts.frameCount,
    passthroughCount: counts.passthroughCount,
    nullCount: counts.nullCount,
    groupCount: counts.groupCount,
    nodeCount: counts.groupCount + counts.frameCount + counts.passthroughCount + counts.nullCount,
    precisionCost: precision.maxSplitAny,
    precision,
  };
}

// ─────────────────────────────────────────────────────────────
// Public API — individual metrics
// ─────────────────────────────────────────────────────────────

/**
 * Count rendered frames (`1` / `F` leaves) in a DSL string.
 *
 * This is the primary **render cost** signal — each frame becomes a
 * composited layer in the output.
 *
 * Returns `null` if the input is not a valid m0 string.
 */
export function getFrameCount(input: string): number | null {
  const canonical = prepareInput(input);
  if (canonical === null) return null;
  return scanCanonical(canonical).frameCount;
}

/**
 * Count passthrough leaves (`0` / `>`) in a DSL string.
 *
 * This is the primary **editor / brain complexity** signal. Passthroughs
 * add structural complexity that the editor must track and visualize, but
 * they have **no render cost** — they are resolved away before compositing.
 *
 * Returns `null` if the input is not a valid m0 string.
 */
export function getPassthroughCount(input: string): number | null {
  const canonical = prepareInput(input);
  if (canonical === null) return null;
  return scanCanonical(canonical).passthroughCount;
}

/**
 * Count all structural nodes in a DSL string.
 *
 * Includes groups (split containers), frames, passthroughs, and nulls.
 * Useful as a total structural size metric.
 *
 * Returns `null` if the input is not a valid m0 string.
 */
export function getNodeCount(input: string): number | null {
  const canonical = prepareInput(input);
  if (canonical === null) return null;
  const c = scanCanonical(canonical);
  return c.groupCount + c.frameCount + c.passthroughCount + c.nullCount;
}

/**
 * Return the precision cost of a DSL string: the maximum split factor
 * on any single axis.
 *
 * This is orthogonal to render and editor cost — it reflects how finely
 * the canvas is subdivided and therefore the minimum resolution needed
 * to avoid zero-pixel frames.
 *
 * Returns `null` if the input is not a valid m0 string.
 */
export function getPrecisionCost(input: string): number | null {
  const canonical = prepareInput(input);
  if (canonical === null) return null;
  return computePrecisionFromString(canonical).maxSplitAny;
}

// ─────────────────────────────────────────────────────────────
// Public API — aggregate
// ─────────────────────────────────────────────────────────────

/**
 * Compute all complexity metrics for a DSL string in a single call.
 *
 * Performs one canonicalization, one validation, one node-count scan,
 * and one precision scan. Prefer this over calling individual getters
 * when you need multiple metrics.
 *
 * Returns `null` if the input is not a valid m0 string.
 */
export function getComplexityMetrics(input: string): ComplexityMetrics | null {
  const canonical = prepareInput(input);
  if (canonical === null) return null;

  const counts = scanCanonical(canonical);
  const precision = computePrecisionFromString(canonical);

  return {
    frameCount: counts.frameCount,
    passthroughCount: counts.passthroughCount,
    nullCount: counts.nullCount,
    groupCount: counts.groupCount,
    nodeCount: counts.groupCount + counts.frameCount + counts.passthroughCount + counts.nullCount,
    precisionCost: precision.maxSplitAny,
    precision,
  };
}
