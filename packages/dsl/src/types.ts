/**
 * @m0saic/dsl – Public types
 *
 * Canonical type definitions for m0 string parsing, traversal, and
 * frame layout structure. File format types (.m0 / .m0c) are in
 * @m0saic/dsl-file-formats.
 */

import type { M0ValidationError } from "./errors";

// ─────────────────────────────────────────────────────────────
// Branded DSL string
// ─────────────────────────────────────────────────────────────

/**
 * Canonical, validated m0 string (pure spatial layout).
 *
 * Construction contract:
 *   1. `toCanonicalM0String(raw)` — normalize whitespace, aliases
 *   2. `validateM0String(canonical)` — must succeed
 *   3. Brand the result as `M0String`
 *
 * The branding path performs NO structural rewrites. If the input
 * contains overlay chains (`}{`), validation will reject it.
 *
 * Callers that generate intermediate strings which may contain overlay
 * chains (e.g., document flattening, composition) must explicitly
 * normalize BEFORE branding:
 *
 *   import { rewriteOverlayChains } from "@m0saic/dsl-stdlib";
 *   const normalized = rewriteOverlayChains(canonical);
 *   // then validate + brand
 *
 * Runtime representation is a plain `string`.
 * The brand exists purely for compile-time nominal safety.
 */
declare const __m0Brand: unique symbol;

export type M0String = string & {
  readonly [__m0Brand]: true;
};

// ─────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────

// axis: row = [] splits height, col = () splits width
export type M0Axis = "row" | "col";

// root        - the root node of the m0 string
// group       - e.g. 2(), 2[]
// frame       - e.g. 1 / F (a rendered leaf)
// passthrough - e.g. 0 / >
// null        - e.g. -
export type M0NodeKind = "root" | "group" | "frame" | "passthrough" | "null";

// start inclusive, end exclusive, utf-16 index (JS string index)
export type M0Span = { start: number; end: number };

export type M0Rect = { x: number; y: number; width: number; height: number };

// ─────────────────────────────────────────────────────────────
// Identity metadata
// ─────────────────────────────────────────────────────────────

export type StableKey = string & { __brand: "StableKey" };

type M0NodeIdentityBase = {
  stableKey: StableKey;
  parentStableKey: StableKey | null;

  /**
   * Structural depth (NOT overlay depth).
   *
   * Counts nesting in the structural tree (root → numeric groups → leafish nodes),
   * based on DFS path used to generate stableKey.
   *
   * Overlay depth is tracked separately on EditorFrame.overlayDepth (nesting inside `{}`).
   */
  structuralDepth: number;

  kind: M0NodeKind;
  span: M0Span | null;
};

type M0NodeIdentityGroup = M0NodeIdentityBase & {
  kind: "root" | "group";
  axis: M0Axis;
};

type M0NodeIdentityLeafish = M0NodeIdentityBase & {
  kind: "frame" | "passthrough" | "null";
  axis?: never;
};

export type M0NodeIdentity = M0NodeIdentityGroup | M0NodeIdentityLeafish;

// ─────────────────────────────────────────────────────────────
// Traversal / ops stream
// ─────────────────────────────────────────────────────────────

export type M0TraversalEvent =
  | {
    type: "enter";
    id: M0NodeIdentity;
    seq: number;
    rect: M0Rect;
    split?: {
      axis: M0Axis;
      requested: number[];
      resolved: number[];
      remainder: number;
    };
    carry?: {
      kind: "passthrough";
      axis: M0Axis;
      pixels: number;
    };
    overlay?: {
      ownerStableKey: StableKey;
      overlayStableKey: StableKey;
      mode: "inherit-rect";
      ownerRule?: "group-owns-overlay";
    };
  }
  | {
    type: "emitLeaf";
    id: M0NodeIdentity;
    seq: number;
    rect: M0Rect;
    leafIndex: number;
    paintOrder?: number;
    logicalIndex?: number;
    carryClaim?: { fromStableKeys: StableKey[]; pixels: number };
    overlayContext?: { ownerStableKey: StableKey; overlayStableKey: StableKey };
  }
  | {
    type: "exit";
    id: M0NodeIdentity;
    seq: number;
    rect: M0Rect;
  };

// ─────────────────────────────────────────────────────────────
// Core rectangle + identity
// ─────────────────────────────────────────────────────────────

/**
 * M0RectNode
 *
 * A rectangular region in root-canvas coordinates.
 *
 * Coordinate system:
 * - Origin (0,0) is the top-left corner of the root canvas.
 * - +x moves right.
 * - +y moves down.
 * - width and height are in pixels.
 */
export type M0RectNode = M0Rect & {
  meta: M0NodeIdentity;
};

// ─────────────────────────────────────────────────────────────
// Leaf outputs (rendered tiles only)
// ─────────────────────────────────────────────────────────────

/**
 * LogicalFrame
 *
 * Lightweight representation of a rendered frame (`1` / `F`) in logical order.
 *
 * - Array index === logicalIndex.
 * - `frames[i]` corresponds to the i-th rendered tile
 *   in DFS / left-to-right source order.
 *
 * logicalIndex:
 * - 0-based structural index.
 * - Stable for a given m0 string.
 *
 * Invariants:
 * - logicalIndex === array index
 */
export type LogicalFrame = M0RectNode & {
  /** 0-based structural index (array index). */
  logicalIndex: number;
};

// ─────────────────────────────────────────────────────────────
// Editor output (full structural tree)
// ─────────────────────────────────────────────────────────────

/**
 * PassthroughOwner
 *
 * Describes which structural node ultimately absorbs a passthrough (`0` / `>`)
 * frame’s donated space.
 *
 * - kind: "frame"
 *   The passthrough is claimed directly by a rendered frame.
 *   `logicalIndex` corresponds to that frame’s 0-based logical index.
 *
 * - kind: "group"
 *   The passthrough is claimed by a structural container
 *   (e.g. numeric split like `2(...)` or `3[...]`).
 *
 * `ownerStableKey` always identifies the structural owner region.
 */
export type PassthroughOwner =
  | { kind: "frame"; logicalIndex: number; ownerStableKey: StableKey }
  | { kind: "group"; ownerStableKey: StableKey };

/**
 * EditorFrame
 *
 * Full structural representation of a parsed m0 layout.
 *
 * Includes:
 * - rendered frames (`1` / `F`)
 * - passthrough frames (`0` / `>`)
 * - null-render slots (`-`)
 * - structural containers created by numeric splits (`2(...)`, `3[...]`)
 *
 * Unlike RenderFrame (which only includes rendered tiles), EditorFrame represents the complete structural tree,
 * enabling UI editors to:
 * - visualize split boundaries
 * - inspect passthrough donation chains
 * - traverse structural hierarchy via stable keys
 * - reason about overlay nesting (overlayDepth)
 *
 * Identity and parent-child relationships:
 * - `meta.stableKey` is the node's unique structural identity.
 * - `meta.parentStableKey` links to the parent node (`null` for root).
 * - Structural depth lives on `meta.structuralDepth`.
 * - Overlay depth is tracked separately as `overlayDepth` below.
 *
 * Use `meta.stableKey` for Maps, React keys, selection state, and
 * any identity that must survive across parses.
 */
export type EditorFrame = M0RectNode & {
  kind: M0NodeKind;
  axis?: M0Axis;

  /**
   * Overlay depth (NOT structural depth).
   * 0 = base layout (outside any `{}`).
   * 1 = inside a top-level `{}`.
   * 2+ = nested overlays.
   */
  overlayDepth: number;

  /** True if this node does not render visual content directly. */
  nullFrame: boolean;

  /** True if this node represents a passthrough (`0` / `>`). */
  passthroughFrame: boolean;

  /** Owner logical-ness (UI metadata; driven by `-` + `{}`). */
  isLogicalOwner?: boolean;

  logicalIndex?: number;
  stackOrder?: number;
  passthroughOwner?: PassthroughOwner;
};


// ─────────────────────────────────────────────────────────────
// Feasibility metadata (exact)
// ─────────────────────────────────────────────────────────────

/**
 * Exact minimum feasible resolution for a m0 layout.
 *
 * Computed via structural analysis of the DSL tree — accounts for
 * nested same-axis splits, passthrough carry chains, and overlay
 * constraints. These are the true minimum integer pixel dimensions
 * at which parsing produces no 0-size frames.
 *
 * Use `computeFeasibility(input)` to obtain this.
 */
export type M0Feasibility = {
  /** Exact minimum width in pixels to avoid any 0-size frame. */
  minWidthPx: number;
  /** Exact minimum height in pixels to avoid any 0-size frame. */
  minHeightPx: number;
};

// ─────────────────────────────────────────────────────────────
// Precision metadata (structural, O(n) scan)
// ─────────────────────────────────────────────────────────────

/**
 * Structural split metrics for a m0 string, computed via O(n) scan.
 *
 * These describe the largest single classifier count on each axis.
 * They are NOT exact minimum feasible resolutions — nested same-axis
 * splits may require larger canvases, and passthrough-heavy layouts
 * may work at smaller sizes. For exact feasibility, use
 * `computeFeasibility` (O(n) structural analysis).
 *
 * - maxSplitX: largest classifier count followed by `(`  (col-split)
 * - maxSplitY: largest classifier count followed by `[`  (row-split)
 * - maxSplitAny: max(maxSplitX, maxSplitY)
 */
export type M0Precision = {
  maxSplitX: number;
  maxSplitY: number;
  maxSplitAny: number;
};

/**
 * Static complexity metrics for a m0 string.
 *
 * Computed via lightweight canonical-string scanning — no geometry or
 * full tree parse required.
 */
export type ComplexityMetrics = {
  /** Rendered frame count (`1`/`F` leaves). Primary render cost signal. */
  frameCount: number;
  /** Passthrough count (`0`/`>` leaves). Primary editor/brain complexity signal — no render cost. */
  passthroughCount: number;
  /** Null count (`-` leaves). */
  nullCount: number;
  /** Group/container count (`N(…)` or `N[…]` split nodes). */
  groupCount: number;
  /** Total node count: groups + frames + passthroughs + nulls. */
  nodeCount: number;
  /** Max split factor on any single axis. Orthogonal to render/editor cost. */
  precisionCost: number;
  /** Full precision breakdown by axis. */
  precision: M0Precision;
};

export type M0ResolutionDiagnostics = {
  tightestWidthPx: number;
  tightestHeightPx: number;
  tightestWidthStableKey: StableKey | null;
  tightestHeightStableKey: StableKey | null;
};

// ─────────────────────────────────────────────────────────────
// Warnings
// ─────────────────────────────────────────────────────────────

/**
 * Warning code type. Derived from M0_WARNING_SPECS in warnings.ts.
 * Must stay in sync — add new codes in both places.
 */
export type M0WarningCode = "PRECISION_EXCEEDS_NORM";

export type M0Warning = {
  severity: "warning";
  code: M0WarningCode;
  message: string;
  span: M0Span | null;
  position: number | null;
  details?: Record<string, unknown>;
};

// ─────────────────────────────────────────────────────────────
// Canonical parse options / results (public)
// ─────────────────────────────────────────────────────────────

export type ParseM0Options = {
  trace?: boolean;
  precisionNorm?: number;
};

export type ParseM0Result =
  | {
    ok: true;
    ir: M0IR;
    precision: M0Precision;
    resolutionDiagnostics?: M0ResolutionDiagnostics;
    warnings: M0Warning[];
  }
  | {
    ok: false;
    error: M0ValidationError;
    precision: M0Precision;
    warnings: M0Warning[];
  };

export type RenderFrame = M0Rect & {
  meta: M0NodeIdentity;
  paintOrder: number;
  /** 0-based index in DFS/left-to-right tile order (same as LogicalFrame.logicalIndex). */
  logicalIndex: number;
};

export type M0IR = {
  /** Output canvas size used for resolution. */
  width: number;
  height: number;

  /**
   * Backend-ready resolved frames.
   * Deterministic paint order: paintOrder is contiguous 0..N-1.
   */
  renderFrames: RenderFrame[];

  /** Full structural graph. Always present from parseM0StringComplete. */
  editorFrames: EditorFrame[];

  /** DFS traversal event stream. Present only when opts.trace. */
  traversal?: M0TraversalEvent[];
};

/**
 * FullGraphWithTraversal
 *
 * Return type for parseM0StringToFullGraphWithTraversal.
 * Bundles the full structural graph with the DFS traversal event stream.
 */
export type FullGraphWithTraversal = {
  editorFrames: EditorFrame[];
  traversal: M0TraversalEvent[];
};

export type M0Label = { text: string; color?: string };
