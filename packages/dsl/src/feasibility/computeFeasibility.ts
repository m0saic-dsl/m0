/**
 * Exact minimum feasible resolution for a m0 DSL string.
 *
 * ## Design note
 *
 * **Old approach (pre-v1):**
 * Binary search over candidate resolutions, calling `parseM0StringComplete`
 * at each probe. Exact but extremely slow: O(log(maxDim) × parseTime). A 130K
 * string took ~7.5 seconds (15 probes × 500ms each).
 *
 * **New approach:**
 * Parse the canonical string into a lightweight AST (no geometry, no frames),
 * then run a direct semantic analysis that computes the exact minimum width
 * and height in a single recursive pass.
 *
 * **What we compute:**
 * The minimum integer width W and height H such that parsing at (W, H) produces
 * no 0-size frames. A frame gets 0 size when `splitEven(axisTotal, N)` assigns 0
 * to some child position. The minimum is a structural property of the DSL tree
 * and the `splitEven` outside-in remainder distribution.
 *
 * **Why it is exact:**
 * For each split node with N children, we analytically solve for the minimum
 * axis-total T such that `splitEven(T, N)` satisfies every child's recursive
 * requirement. We enumerate all N possible remainder values (0..N-1) and pick
 * the smallest T. Passthrough carry chains, overlay constraints, and nested
 * same-axis splits are all handled explicitly.
 *
 * **Complexity:**
 * O(n) to parse the AST + O(Σ Nᵢ²) for the analysis, where Nᵢ is the child
 * count of each split node. For typical layouts this is effectively O(n).
 */

import type { M0Feasibility } from "../types";
import { toCanonicalM0String } from "../format/m0StringFormat";
import { validateM0String } from "../validate/m0StringValidator";

// ─────────────────────────────────────────────────────────────
// Lightweight AST
// ─────────────────────────────────────────────────────────────

type LightNode =
  | { kind: "frame"; overlay?: LightNode }
  | { kind: "null"; overlay?: LightNode }
  | { kind: "passthrough"; overlay?: LightNode }
  | { kind: "split"; axis: "col" | "row"; count: number; children: LightNode[]; overlay?: LightNode };

// ─────────────────────────────────────────────────────────────
// Lightweight parser (canonical string → AST)
// ─────────────────────────────────────────────────────────────

function parseLightAST(s: string): LightNode {
  let pos = 0;

  function parseNode(): LightNode {
    if (pos >= s.length) return { kind: "null" }; // shouldn't happen on valid input

    const ch = s[pos];

    // Null: -
    if (ch === "-") {
      pos++;
      return { kind: "null", overlay: tryOverlay() };
    }

    // Passthrough: 0
    if (ch === "0") {
      pos++;
      return { kind: "passthrough", overlay: tryOverlay() };
    }

    // Number (1-9 followed by more digits, or bare 1)
    const numStart = pos;
    pos++;
    while (pos < s.length && s[pos] >= "0" && s[pos] <= "9") pos++;
    const num = parseInt(s.substring(numStart, pos), 10);

    // Check if followed by ( or [ → split
    if (pos < s.length && (s[pos] === "(" || s[pos] === "[")) {
      const axis: "col" | "row" = s[pos] === "(" ? "col" : "row";
      pos++; // skip open bracket

      const children: LightNode[] = [];
      for (let i = 0; i < num; i++) {
        if (i > 0 && pos < s.length && s[pos] === ",") pos++; // skip comma
        children.push(parseNode());
      }
      pos++; // skip close bracket

      return { kind: "split", axis, count: num, children, overlay: tryOverlay() };
    }

    // Bare number (must be 1 in canonical validated input)
    return { kind: "frame", overlay: tryOverlay() };
  }

  function tryOverlay(): LightNode | undefined {
    if (pos < s.length && s[pos] === "{") {
      pos++; // skip {
      const node = parseNode();
      pos++; // skip }
      return node;
    }
    return undefined;
  }

  return parseNode();
}

// ─────────────────────────────────────────────────────────────
// Outside-in rank computation
//
// Computes the order in which splitEven distributes remainder.
// rank[i] is the priority of position i: lower rank = gets bonus first.
// Position i gets a bonus pixel iff rank[i] < rem.
// ─────────────────────────────────────────────────────────────

function computeOutsideInRank(n: number): number[] {
  const rank = new Array(n);
  let k = 0;
  let left = 0;
  let right = n - 1;

  while (left <= right) {
    rank[left] = k++;
    if (left !== right) {
      rank[right] = k++;
    }
    left++;
    right--;
  }

  return rank;
}

// ─────────────────────────────────────────────────────────────
// Axis requirements
// ─────────────────────────────────────────────────────────────

type AxisReq = { col: number; row: number };

/**
 * Compute the minimum pixels needed on each axis for a node to be feasible.
 *
 * For a leaf (1, -, 0): at least 1 on each axis, or more if the overlay demands it.
 * For a split: recursive analysis via findMinTotal on the split axis, max of
 * children on the cross axis.
 */
function computeMinReq(node: LightNode): AxisReq {
  if (node.kind === "frame" || node.kind === "null" || node.kind === "passthrough") {
    const base: AxisReq = { col: 1, row: 1 };
    if (node.overlay) {
      const ov = computeMinReq(node.overlay);
      return { col: Math.max(base.col, ov.col), row: Math.max(base.row, ov.row) };
    }
    return base;
  }

  // Split node
  const { axis, children, overlay } = node;
  const childReqs = children.map(c => computeMinReq(c));

  const splitAxis = axis; // "col" or "row"
  const crossAxis = axis === "col" ? "row" : "col";

  // Split axis: find minimum total via analytical solver
  const splitReq = findMinTotal(children, childReqs, splitAxis);

  // Cross axis: each child gets the full cross-axis dimension,
  // so we need the max of all children's cross-axis requirements.
  let crossReq = 1;
  for (const cr of childReqs) {
    if (cr[crossAxis] > crossReq) crossReq = cr[crossAxis];
  }

  const result: AxisReq = { col: 1, row: 1 };
  result[splitAxis] = splitReq;
  result[crossAxis] = crossReq;

  if (overlay) {
    const ov = computeMinReq(overlay);
    result.col = Math.max(result.col, ov.col);
    result.row = Math.max(result.row, ov.row);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// Core solver: find minimum total T for splitEven(T, N)
//
// Given N children with requirements on the split axis, and
// passthrough carry-chain semantics, finds the smallest T such
// that splitEven(T, N) satisfies all constraints.
//
// Strategy: enumerate all N possible remainder values (0..N-1).
// For each remainder, compute the minimum base from constraints,
// then T = base * N + rem. Return the global minimum.
// ─────────────────────────────────────────────────────────────

function findMinTotal(
  children: LightNode[],
  childReqs: AxisReq[],
  splitAxis: "col" | "row",
): number {
  const N = children.length;
  if (N === 0) return 1;
  if (N === 1) {
    // Single child gets the full total. Minimum = child's requirement.
    return childReqs[0][splitAxis];
  }

  // Per-child requirement on the split axis
  const req: number[] = childReqs.map(r => r[splitAxis]);

  // Outside-in rank for each position
  const rank = computeOutsideInRank(N);

  // Precompute prefix sums of "is bonus" for each rem value
  // bonusPrefix[rem][i] = count of positions in [0..i-1] with rank < rem
  // This allows O(1) bonus_count(j, k, rem) = bonusPrefix[rem][k+1] - bonusPrefix[rem][j]

  // Decompose children into claim segments.
  // A segment is: [passthrough*, claimant]
  // The claimant is any non-passthrough child (frame, null, or split).
  // Trailing passthroughs are validator-rejected, so the last child is always a claimant.

  type Segment = {
    start: number; // first position in segment
    end: number;   // claimant position (inclusive)
    // Positions start..end-1 are passthroughs, end is the claimant
  };

  const segments: Segment[] = [];
  let segStart = 0;
  for (let i = 0; i < N; i++) {
    if (children[i].kind !== "passthrough") {
      segments.push({ start: segStart, end: i });
      segStart = i + 1;
    }
  }

  // Find minimum T across all possible rem values
  let bestT = Infinity;

  for (let rem = 0; rem < N; rem++) {
    // Build bonus prefix sum for this rem
    const bp = new Array(N + 1);
    bp[0] = 0;
    for (let i = 0; i < N; i++) {
      bp[i + 1] = bp[i] + (rank[i] < rem ? 1 : 0);
    }
    const bonusCount = (j: number, k: number) => bp[k + 1] - bp[j];

    let minBase = 0;

    for (const seg of segments) {
      const { start, end } = seg;

      // --- Passthrough carry constraints ---
      // Each passthrough at position p needs carry > 0 at that position.
      // carry_at_p = sum(sizes[start..p]) = (p - start + 1) * base + bonusCount(start, p)
      // Need: carry_at_p >= req[p]  (req[p] = 1 if no overlay, or overlay's split-axis req)
      for (let p = start; p < end; p++) {
        const prefixLen = p - start + 1;
        const bc = bonusCount(start, p);
        const needed = req[p] - bc;
        if (needed > 0) {
          minBase = Math.max(minBase, Math.ceil(needed / prefixLen));
        }
      }

      // --- Claimant constraint ---
      // sum(sizes[start..end]) >= req[end]
      const segLen = end - start + 1;
      const bc = bonusCount(start, end);
      const needed = req[end] - bc;
      if (needed > 0) {
        minBase = Math.max(minBase, Math.ceil(needed / segLen));
      }
    }

    const T = minBase * N + rem;
    if (T < bestT) bestT = T;
  }

  return Math.max(bestT, 1);
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Compute the exact minimum feasible resolution for a m0 string.
 *
 * Returns a `M0Feasibility` with the true minimum integer width and
 * height at which parsing produces no 0-size frames. Uses O(n) structural
 * analysis — no repeated parse probing.
 *
 * This is the authoritative feasibility API. Use it wherever you need
 * exact minimum pixel dimensions (metadata, build reports, feasibility
 * checks). For cheap structural metrics without pixel guarantees, use
 * `computePrecisionFromString` instead.
 *
 * @throws {Error} If the input is not a valid m0 string.
 */
export function computeFeasibility(input: string): M0Feasibility {
  const canonical = toCanonicalM0String(input);

  const validation = validateM0String(canonical);
  if (!validation.ok && "error" in validation) {
    throw new Error(
      `Invalid m0 string [${validation.error.code}]: ${validation.error.message}`,
    );
  }

  if (canonical === "1" || canonical === "") {
    return { minWidthPx: 1, minHeightPx: 1 };
  }

  const ast = parseLightAST(canonical);
  const req = computeMinReq(ast);

  return { minWidthPx: req.col, minHeightPx: req.row };
}
