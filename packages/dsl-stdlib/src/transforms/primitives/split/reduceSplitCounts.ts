import {
  parseM0StringToFullGraph,
  parseM0StringToRenderFrames,
  type M0String,
  type RenderFrame,
} from "@m0saic/dsl";
import { getNextToken, findMatchingClose } from "../../_internal/lexUtils";
import {
  validateInputOrThrow,
  finalizeM0Output,
  type OpOutputOptions,
} from "../../_internal/output";
import { gcdArray } from "./_internal/buildSplitFragment";

/**
 * Reduce split COUNTS to their minimum representation.
 *
 * A split whose per-cell weights share a common divisor encodes the same
 * proportions at a smaller count — e.g. a 10-way split with cell weights
 * `[2,8]` (`10(0,1,0,0,0,0,0,0,0,1)`) is the same geometry as a 5-way
 * `[1,4]` (`5(1,0,0,0,1)`). Dividing every cell weight by the GCD shrinks
 * the DSL without changing the layout's ratios.
 *
 * ## Lossless is NOT free in general
 *
 * The ratio is preserved exactly, but the engine quantizes each split's
 * pixel remainder symmetrically from the edges inward, and that
 * distribution depends on the COUNT (see `splitEven` in the parser).
 * Reducing `N → N/d` can therefore shift an integer pixel boundary by up
 * to ~1px at any canvas size the original count does not divide evenly —
 * and that shift re-quantizes everything nested under the split. It is
 * pixel-identical exactly when the count divides the cell's extent
 * (common for clean layouts on 1080/1920).
 *
 * So this transform is **drift-budgeted**, not blindly structural:
 *
 *   - `maxDriftPx: 0` (default) — STRICT LOSSLESS. A split is reduced only
 *     when the reduction is verified pixel-identical at `(width,height)`
 *     against the real quantizer (over the whole document, so propagated
 *     drift is caught). Splits that would shift any edge are left as-is.
 *   - `maxDriftPx > 0` — bounded LOSSY. A split is reduced when its
 *     reduction moves no edge by more than the budget. Maximizes savings
 *     while guaranteeing the geometry never shifts "a lot".
 *
 * Reductions are decided independently per container and only applied
 * together when each is within budget; strict (0px) reductions compose
 * exactly (a contained zero-drift change plus another stays zero-drift).
 *
 * Rendered-leaf count and paint order are invariant — only passthrough
 * (`0`) slots are dropped, never a claimant — so positional sidecars
 * (sources / masks / fills) stay attached. Container stableKeys are
 * stable (a count is not part of key derivation); the keys of cells
 * INSIDE a reduced split change (their child index shifts).
 *
 * This is the LOSSLESS counterpart to `compactDocument`'s lossy
 * `gcdDriftPercent` GCD-snap, which MOVES edges to a coarser grid.
 *
 * Pure and deterministic. No I/O.
 */

export interface ReduceSplitCountsOptions {
  /** Canvas width in px (drift-verification space). Positive integer. */
  width: number;
  /** Canvas height in px. Positive integer. */
  height: number;
  /**
   * Maximum per-edge pixel drift a reduction may introduce. 0 (default)
   * = strict lossless (only pixel-identical reductions). > 0 = bounded
   * lossy.
   */
  maxDriftPx?: number;
  /** Output format preference (canonical | pretty). */
  output?: OpOutputOptions;
}

export interface ReduceSplitCountsResult {
  /** The reduced document. */
  m0: M0String;
  /** Splits that were reduced: container stableKey + count before/after. */
  reduced: Array<{ stableKey: string; from: number; to: number }>;
  /**
   * Splits with a reducible GCD that were LEFT unreduced because the
   * reduction exceeded the drift budget (or could not be safely encoded).
   */
  skipped: Array<{ stableKey: string; from: number; gcd: number }>;
  /** Max per-edge drift across the applied reductions (0 in strict mode). */
  maxDriftPx: number;
}

// ── Internal: a reducible-split candidate ─────────────────────────────

interface Candidate {
  /** Absolute start offset of the count digit in the canonical string. */
  spanStart: number;
  /**
   * Container stableKey, looked up from the editor walk by span start.
   * Empty when unavailable (e.g. the walk collapses a degenerate split at
   * an infeasible canvas) — reduction is identity-independent, this label
   * is purely diagnostic.
   */
  stableKey: string;
  /** Original count. */
  from: number;
  /** GCD of the per-cell weights (> 1). */
  gcd: number;
}

interface RebuildOutcome {
  rebuilt: string;
  /** Offset just past the consumed expression. */
  end: number;
  /** The base (pre-overlay) token: single char for leaves, digits for containers. */
  baseToken: string;
  /** Whether the base carried at least one `{...}` overlay. */
  baseHadOverlay: boolean;
}

const LEAF_TOKENS = new Set(["1", "F", "-", "0", ">"]);

/**
 * Recursively rebuild the expression at `pos`, reducing every container
 * whose span-start offset is in `accept`. Records reducible candidates
 * into `candidates` (keyed by spanStart, deduped) regardless of `accept`.
 */
function rebuildExpr(
  s: string,
  pos: number,
  accept: ReadonlySet<number>,
  keyBySpanStart: Map<number, string>,
  candidates: Map<number, Candidate>,
): RebuildOutcome {
  const token = getNextToken(s.slice(pos));

  // ── Leaf primitive (1 / F / - / 0 / >) ──
  if (LEAF_TOKENS.has(token)) {
    return wrapOverlays(s, pos, pos + 1, token, accept, keyBySpanStart, candidates);
  }

  // ── Container N(...) / N[...] ──
  const open = s.charAt(pos + token.length);
  if (open !== "(" && open !== "[") {
    // Unknown shape — emit verbatim single token (defensive; validated input
    // shouldn't reach here).
    return wrapOverlays(s, pos, pos + token.length, token, accept, keyBySpanStart, candidates);
  }
  const close = open === "(" ? ")" : "]";
  const innerStart = pos + token.length + 1;
  const closeOffset = findMatchingClose(s.slice(innerStart), open);
  const innerEnd = innerStart + closeOffset; // s[innerEnd] === close
  const count = Number(token);

  // Walk children, rebuilding each (nested reductions applied).
  const childRebuilts: string[] = [];
  const childIsZero: boolean[] = [];
  const childZeroHasOverlay: boolean[] = [];
  let p = innerStart;
  let malformed = false;
  while (p < innerEnd) {
    if (s.charAt(p) === ",") {
      // Empty child (e.g. `,,`) — canonical input shouldn't emit these;
      // bail out of reduction for this container if encountered.
      malformed = true;
      break;
    }
    const child = rebuildExpr(s, p, accept, keyBySpanStart, candidates);
    childRebuilts.push(child.rebuilt);
    childIsZero.push(child.baseToken === "0");
    childZeroHasOverlay.push(child.baseToken === "0" && child.baseHadOverlay);
    p = child.end;
    if (p < innerEnd && s.charAt(p) === ",") p += 1;
  }

  const rebuiltInner = childRebuilts.join(",");

  // Decide reducibility (clean parse: exactly `count` children, no
  // overlay-bearing passthroughs, weights share a divisor > 1).
  let reducedFragment: string | null = null;
  if (!malformed && childRebuilts.length === count && !childZeroHasOverlay.some(Boolean)) {
    const cells = toCells(childRebuilts, childIsZero);
    // A single-cell split (e.g. `4(0,0,0,1)`) would reduce to a count-1
    // split (`1(1)`), which is not valid m0 — that's a "trivial unwrap",
    // out of scope for count reduction. Only multi-cell splits qualify.
    if (cells != null && cells.length >= 2) {
      const d = gcdArray(cells.map((c) => c.weight));
      if (d > 1) {
        if (!candidates.has(pos)) {
          candidates.set(pos, {
            spanStart: pos,
            stableKey: keyBySpanStart.get(pos) ?? "",
            from: count,
            gcd: d,
          });
        }
        if (accept.has(pos)) {
          reducedFragment = emitReduced(cells, d, open, close);
        }
      }
    }
  }

  const containerText =
    reducedFragment ?? `${count}${open}${rebuiltInner}${close}`;

  return wrapOverlays(
    s,
    pos,
    innerEnd + 1,
    token,
    accept,
    keyBySpanStart,
    candidates,
    containerText,
  );
}

/** A cell = a run of leading passthroughs + one claimant; weight = run + 1. */
interface Cell {
  weight: number;
  claimant: string;
}

function toCells(childRebuilts: string[], childIsZero: boolean[]): Cell[] | null {
  const cells: Cell[] = [];
  let zeros = 0;
  for (let i = 0; i < childRebuilts.length; i++) {
    if (childIsZero[i]) {
      zeros += 1;
      continue;
    }
    cells.push({ weight: zeros + 1, claimant: childRebuilts[i] });
    zeros = 0;
  }
  // Trailing passthroughs with no claimant to merge into — not a clean
  // weight encoding; refuse to reduce.
  if (zeros > 0) return null;
  return cells;
}

function emitReduced(cells: Cell[], d: number, open: string, close: string): string {
  const parts: string[] = [];
  let total = 0;
  for (const c of cells) {
    const w = c.weight / d;
    for (let i = 0; i < w - 1; i++) parts.push("0");
    parts.push(c.claimant);
    total += w;
  }
  return `${total}${open}${parts.join(",")}${close}`;
}

/**
 * Consume any trailing `{...}` overlay chain after a base expression,
 * rebuilding each overlay's content recursively, and return the combined
 * text. `baseText` overrides the literal base slice (used by containers
 * whose inner was rebuilt); leaves pass it undefined.
 */
function wrapOverlays(
  s: string,
  basePos: number,
  baseEnd: number,
  baseToken: string,
  accept: ReadonlySet<number>,
  keyBySpanStart: Map<number, string>,
  candidates: Map<number, Candidate>,
  baseText?: string,
): RebuildOutcome {
  let out = baseText ?? s.slice(basePos, baseEnd);
  let cursor = baseEnd;
  let hadOverlay = false;
  while (cursor < s.length && s.charAt(cursor) === "{") {
    hadOverlay = true;
    const contentStart = cursor + 1;
    const contentOffset = findMatchingClose(s.slice(contentStart), "{");
    const contentEnd = contentStart + contentOffset; // s[contentEnd] === '}'
    const overlay = rebuildExpr(s, contentStart, accept, keyBySpanStart, candidates);
    out += `{${overlay.rebuilt}}`;
    cursor = contentEnd + 1;
  }
  return { rebuilt: out, end: cursor, baseToken, baseHadOverlay: hadOverlay };
}

// ── Drift measurement ─────────────────────────────────────────────────

function maxEdgeDrift(a: readonly RenderFrame[], b: readonly RenderFrame[]): number {
  if (a.length !== b.length) return Infinity;
  let mx = 0;
  for (let i = 0; i < a.length; i++) {
    const fa = a[i];
    const fb = b[i];
    mx = Math.max(
      mx,
      Math.abs(fa.x - fb.x),
      Math.abs(fa.y - fb.y),
      Math.abs(fa.x + fa.width - (fb.x + fb.width)),
      Math.abs(fa.y + fa.height - (fb.y + fb.height)),
    );
  }
  return mx;
}

// ── Main ──────────────────────────────────────────────────────────────

export function reduceSplitCounts(
  m0: string,
  opts: ReduceSplitCountsOptions,
): ReduceSplitCountsResult {
  const { width, height } = opts;
  if (!Number.isInteger(width) || width < 1)
    throw new Error(`reduceSplitCounts: width must be a positive integer, got ${width}`);
  if (!Number.isInteger(height) || height < 1)
    throw new Error(`reduceSplitCounts: height must be a positive integer, got ${height}`);
  const budget = opts.maxDriftPx ?? 0;
  if (!Number.isFinite(budget) || budget < 0)
    throw new Error(`reduceSplitCounts: maxDriftPx must be a non-negative number, got ${budget}`);

  const canonical = validateInputOrThrow("reduceSplitCounts", m0);

  // Container stableKey by span start (authoritative identity).
  const keyBySpanStart = new Map<number, string>();
  for (const f of parseM0StringToFullGraph(canonical, width, height)) {
    if ((f.meta.kind === "root" || f.meta.kind === "group") && f.meta.span != null) {
      keyBySpanStart.set(f.meta.span.start, String(f.meta.stableKey));
    }
  }

  // Pass 1 — enumerate reducible candidates (accept nothing).
  const candidates = new Map<number, Candidate>();
  rebuildExpr(canonical, 0, new Set<number>(), keyBySpanStart, candidates);

  const baseFrames = parseM0StringToRenderFrames(canonical, width, height);

  // Pass 2 — decide each candidate independently against the original.
  const accepted = new Set<number>();
  const reduced: ReduceSplitCountsResult["reduced"] = [];
  const skipped: ReduceSplitCountsResult["skipped"] = [];
  for (const cand of candidates.values()) {
    const only = new Set<number>([cand.spanStart]);
    const trial = rebuildExpr(canonical, 0, only, keyBySpanStart, new Map()).rebuilt;
    const drift = maxEdgeDrift(baseFrames, parseM0StringToRenderFrames(trial, width, height));
    if (drift <= budget) {
      accepted.add(cand.spanStart);
      reduced.push({ stableKey: cand.stableKey, from: cand.from, to: cand.from / cand.gcd });
    } else {
      skipped.push({ stableKey: cand.stableKey, from: cand.from, gcd: cand.gcd });
    }
  }

  if (accepted.size === 0) {
    return {
      m0: finalizeM0Output("reduceSplitCounts", canonical, opts.output) as M0String,
      reduced: [],
      skipped,
      maxDriftPx: 0,
    };
  }

  // Pass 3 — apply all accepted reductions together; measure actual drift.
  const finalStr = rebuildExpr(canonical, 0, accepted, keyBySpanStart, new Map<number, Candidate>()).rebuilt;
  const finalFrames = parseM0StringToRenderFrames(finalStr, width, height);
  if (finalFrames.length !== baseFrames.length) {
    throw new Error(
      "reduceSplitCounts: internal invariant — reduction changed the rendered frame count",
    );
  }
  const maxDriftPx = maxEdgeDrift(baseFrames, finalFrames);

  return {
    m0: finalizeM0Output("reduceSplitCounts", finalStr, opts.output) as M0String,
    reduced,
    skipped,
    maxDriftPx,
  };
}
