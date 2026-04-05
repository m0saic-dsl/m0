/**
 * m0 Parser & Validator
 *
 * Reference implementation of the m0 DSL — the source of truth for
 * validation, canonicalization, and deterministic frame subdivision.
 *
 * The original parser was a single Java file called VFProfileValidator
 * (2020), built test-by-test in a debugger. The core model survives:
 * token-rule matrix validation, outside-in remainder distribution,
 * 0-run "donate space forward" semantics, and recursive overlays
 * via {}. Everything else has been rewritten and expanded, but the
 * invariants are intentionally preserved.
 *
 * Developed by Quentin Simoneaux.
 * © 2020–2026 m0saic LLC. See LICENSE.
 */

import type {
  EditorFrame,
  FullGraphWithTraversal,
  LogicalFrame,
  M0Axis,
  M0Precision,
  M0Warning,
  RenderFrame as DslRenderFrame,
  M0NodeIdentity,
  M0NodeKind,
  M0Rect,
  M0ResolutionDiagnostics,
  M0IR,
  M0Span,
  M0TraversalEvent,
  ParseM0Options,
  ParseM0Result,
  PassthroughOwner,
  StableKey,
} from "../types";
import { makeValidationError } from "../errors";
import { makeWarning } from "../warnings";
import { isValidM0String, validateM0String } from "../validate/m0StringValidator";
import { toCanonicalM0String } from "../format/m0StringFormat";
import { sortDeferredOverlays, type DeferredOverlayItem } from "./sortDeferredOverlays";

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Engine frame type with logicalOrder and stackOrder.
 */
interface EngineFrame {
  id: number;
  width: number;
  height: number;
  x: number;
  y: number;
  nullRender: boolean;
  zeroFrame: boolean;
  logicalOrder: number;
  stackOrder: number;

  // structural nesting (groups)
  structDepth: number;

  // overlay nesting ({})
  overlayDepth: number;

  parentFrameId: number;
  isLogicalOwner: boolean;
  /** Split direction for group frames. true = row ([] splits height), false = col (() splits width). */
  row?: boolean;
}

/**
 * Test helper that parses and returns frames with logicalOrder/stackOrder for assertions.
 * Uses engine semantics: overlay growth on zeros, filters 0-size frames.
 */
/** @internal — test-only helper, not part of the public API. */
export function parseM0StringTestRunner(
  s: string,
  width: number,
  height: number,
  mode: "LOGICAL" | "PAINT"
): EngineFrame[] {
  s = toCanonicalM0String(s);
  if (!isValidM0String(s)) {
    return [];
  }

  const { frames } = EngineM0Parser.parse(s, width, height);

  // Filter out 0-size frames (infeasible splits)
  const valid = frames.filter((f) => f.width > 0 && f.height > 0);

  // If any frame was filtered out, the parse is invalid
  if (valid.length !== frames.length) {
    return [];
  }

  // Filter to rendered frames only
  const rendered = valid.filter((f) => !f.nullRender);

  // Sort by requested mode
  if (mode === "LOGICAL") {
    rendered.sort((a, b) => a.logicalOrder - b.logicalOrder);
  } else {
    rendered.sort((a, b) => a.stackOrder - b.stackOrder);
  }

  return rendered;
}

/**
 * Geometry-only parse — fastest path for rendered tile rectangles.
 *
 * Use this for previews, feasibility checks, and any path where you only
 * need tile positions and sizes without structural identity.
 *
 * @returns `RenderFrame[]` sorted by paint order. Each frame has
 *          `{ x, y, width, height, paintOrder, logicalIndex, meta }`.
 *          Returns `[]` if the input is invalid or infeasible at the given resolution.
 *
 * **Note:** `meta.stableKey` values are synthetic placeholders (`f0`, `f1`, …),
 * not real structural paths. Use `parseM0StringToLogicalFrames` or
 * `parseM0StringComplete` when you need real stableKeys.
 */
export function parseM0StringToRenderFrames(
  s: string,
  width: number,
  height: number
): DslRenderFrame[] {
  const canonical = toCanonicalM0String(s);
  const validation = validateM0String(canonical);
  if (validation.ok === false) return [];

  const { frames: engineFrames } = EngineM0Parser.parse(canonical, width, height);
  const valid = engineFrames.filter((f) => f.width > 0 && f.height > 0);
  if (valid.length === 0) return [];

  const rendered = valid.filter((f) => !f.nullRender);
  const paintSorted = [...rendered].sort((a, b) => a.stackOrder - b.stackOrder);
  const logicalSorted = [...rendered].sort((a, b) => a.logicalOrder - b.logicalOrder);

  const logicalIndexByFrameId = new Map<number, number>();
  for (let i = 0; i < logicalSorted.length; i++) {
    logicalIndexByFrameId.set(logicalSorted[i].id, i);
  }

  // Lightweight placeholder identity — no DFS, no stableKey hierarchy
  return paintSorted.map((f, i) => ({
    width: f.width,
    height: f.height,
    x: f.x,
    y: f.y,
    paintOrder: i,
    logicalIndex: logicalIndexByFrameId.get(f.id)!,
    meta: {
      kind: "frame" as const,
      stableKey: `f${logicalIndexByFrameId.get(f.id)}` as StableKey,
      parentStableKey: null,
      structuralDepth: f.structDepth,
      span: null,
    },
  }));
}

// ─────────────────────────────────────────────────────────────
// Parser implementation
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Engine Parser (with overlay growth semantics and proper stackOrder)
// ─────────────────────────────────────────────────────────────

/**
 * Engine-focused parser with proper overlay growth semantics and stackOrder.
 *
 * Key behaviors:
 * - 0{...} overlays apply to MERGED region so far, not the individual 0-slot rect
 * - Multiple 0{...} in a run: overlays "grow" (360 then 720), then claimant absorbs rest
 * - Zero overlays DEFER painting until after their claimant
 * - Multiple zero overlays paint largest-first (smaller on top)
 * - Group overlays paint after their children
 * - Filters out 0-size frames (infeasible splits return empty array)
 *
 * This matches the original Java VFProfileValidator engine behavior.
 */
type EngineParseResult = {
  frames: EngineFrame[];
  zeroClaimantMap: ReadonlyMap<number, number>;
  overlayFrameIds: ReadonlySet<number>;
};

class EngineM0Parser {
  private idCounter = 1;
  private logicalCounter = 0; // 0 indexing

  // Tracking for stackOrder assignment
  private zeroClaimant = new Map<number, number>(); // zeroFrameId -> claimantFrameId
  private overlayRenderedByOwner = new Map<number, number[]>(); // ownerId -> rendered ids
  private overlayFrameIds = new Set<number>(); // all frame ids inside any overlay

  // Offset-based cursor into the source string (avoids O(n²) substring copies)
  private src = "";
  private pos = 0;

  static parse(s: string, width: number, height: number): EngineParseResult {
    if (s === "") return { frames: [], zeroClaimantMap: new Map(), overlayFrameIds: new Set() };

    const parser = new EngineM0Parser();
    parser.src = s.replace(/\s+/g, "");
    parser.pos = 0;
    const frames = parser.parseInternal(parser.src.length, width, height, 0, 0, 1, true, 0, -1, 0);
    const ordered = parser.assignStackOrder(frames);

    return {
      frames: ordered,
      zeroClaimantMap: parser.zeroClaimant,
      overlayFrameIds: parser.overlayFrameIds,
    };
  }

  /**
   * Assign stackOrder to all rendered frames using proper deferral semantics:
   * - Base tiles paint first, then their overlays
   * - Zero overlays defer to their claimant (or claimant's last descendant if GROUP)
   * - Deferred zero overlays paint largest-first (smaller on top)
   */
  private assignStackOrder(frames: EngineFrame[]): EngineFrame[] {
    const byId = new Map<number, EngineFrame>();
    for (const fr of frames) byId.set(fr.id, fr);

    // parent -> children (in creation id order)
    const childrenByParent = new Map<number, number[]>();
    for (const fr of frames) {
      if (fr.parentFrameId < 0) continue;
      const arr = childrenByParent.get(fr.parentFrameId) ?? [];
      arr.push(fr.id);
      childrenByParent.set(fr.parentFrameId, arr);
    }
    for (const arr of childrenByParent.values()) arr.sort((a, b) => a - b);

    const getChildren = (id: number) => childrenByParent.get(id) ?? [];

    // Find rendered descendants of a node (sorted by logicalOrder)
    const findRenderedDescendants = (rootId: number): EngineFrame[] => {
      const out: EngineFrame[] = [];
      const stack: number[] = [rootId];
      while (stack.length) {
        const id = stack.pop()!;
        const fr = byId.get(id);
        if (!fr) continue;
        if (!fr.nullRender) out.push(fr);
        const kids = getChildren(id);
        for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
      }
      out.sort((a, b) => a.logicalOrder - b.logicalOrder);
      return out;
    };

    const lastRenderedDescendantId = (rootId: number): number | null => {
      const rendered = findRenderedDescendants(rootId);
      if (rendered.length === 0) return null;
      return rendered[rendered.length - 1].id;
    };

    // Build overlay roots for each owner
    const overlayRootsByOwner = new Map<number, number[]>();
    for (const fr of frames) {
      if (fr.parentFrameId < 0) continue;
      if (!this.overlayFrameIds.has(fr.id)) continue;
      const prev = overlayRootsByOwner.get(fr.parentFrameId) ?? [];
      prev.push(fr.id);
      overlayRootsByOwner.set(fr.parentFrameId, prev);
    }
    for (const arr of overlayRootsByOwner.values()) arr.sort((a, b) => a - b);

    // Emission state
    const emitted = new Set<number>();
    let stackCounter = 1;

    // paint-anchor -> list of deferred overlay roots (zero overlays)
    const deferredByAnchor = new Map<number, DeferredOverlayItem[]>();

    const emitRendered = (id: number) => {
      if (emitted.has(id)) return;
      const fr = byId.get(id);
      if (!fr || fr.nullRender) return;
      emitted.add(id);
      fr.stackOrder = stackCounter++;
    };

    const addDeferredZeroOverlay = (zeroOwnerId: number, overlayRootId: number) => {
      const zeroOwner = byId.get(zeroOwnerId);
      if (!zeroOwner) return;

      const claimantId = this.zeroClaimant.get(zeroOwnerId);
      if (claimantId == null) return;

      const claimant = byId.get(claimantId);
      if (!claimant) return;

      // If claimant renders, defer after claimant itself.
      // If claimant doesn't render (GROUP / -), defer after LAST rendered descendant.
      const anchorId = claimant.nullRender
        ? lastRenderedDescendantId(claimantId)
        : claimantId;

      if (anchorId == null) return;

      const area = zeroOwner.width * zeroOwner.height;
      const prev = deferredByAnchor.get(anchorId) ?? [];
      prev.push({ area, rootId: overlayRootId });
      deferredByAnchor.set(anchorId, prev);
    };

    // Emit deferred overlays after a rendered frame, sorted largest->smallest (smallest on top)
    const flushDeferredAfter = (anchorRenderedId: number) => {
      const list = deferredByAnchor.get(anchorRenderedId);
      if (!list || list.length === 0) return;

      sortDeferredOverlays(list);

      for (const item of list) emitNode(item.rootId);

      deferredByAnchor.delete(anchorRenderedId);
    };


    // Iterative with explicit stack to avoid V8 call-stack overflow
    // on deeply nested but valid DSL inputs (nesting depth >2000).
    const emitNode = (startNodeId: number) => {
      type EmitWork =
        | { type: "process"; nodeId: number }
        | { type: "flush"; nodeId: number };
      const workStack: EmitWork[] = [{ type: "process", nodeId: startNodeId }];

      while (workStack.length > 0) {
        const work = workStack.pop()!;

        if (work.type === "flush") {
          flushDeferredAfter(work.nodeId);
          continue;
        }

        const nodeId = work.nodeId;
        const node = byId.get(nodeId);
        if (!node) continue;

        // If this is a rendered tile, paint it
        if (!node.nullRender) {
          emitRendered(nodeId);

          // Push flush FIRST onto stack (processed last — after overlay roots)
          workStack.push({ type: "flush", nodeId });

          // Then push overlay roots in reverse for correct LIFO order
          const overlayRoots = overlayRootsByOwner.get(nodeId) ?? [];
          for (let i = overlayRoots.length - 1; i >= 0; i--) {
            workStack.push({ type: "process", nodeId: overlayRoots[i] });
          }
          continue;
        }

        // nullRender nodes:
        // - zeroFrame: does not paint itself; its overlays defer to claimant
        if (node.zeroFrame) {
          const overlayRoots = overlayRootsByOwner.get(nodeId) ?? [];
          for (const ovRoot of overlayRoots) addDeferredZeroOverlay(nodeId, ovRoot);
          continue;
        }

        // other nullRender container (GROUP / - / logical tile):
        // Paint BASE subtree first, then own overlay subtree
        const kids = getChildren(nodeId);
        const overlayRoots = overlayRootsByOwner.get(nodeId) ?? [];

        // Push overlay roots FIRST (processed last — after base kids)
        for (let i = overlayRoots.length - 1; i >= 0; i--) {
          workStack.push({ type: "process", nodeId: overlayRoots[i] });
        }

        // Push base kids in reverse (processed first in correct order)
        for (let i = kids.length - 1; i >= 0; i--) {
          if (this.overlayFrameIds.has(kids[i])) continue;
          workStack.push({ type: "process", nodeId: kids[i] });
        }
      }
    };

    // Start from top-level roots (parentFrameId === -1), in creation order
    const roots = frames
      .filter((fr) => fr.parentFrameId === -1)
      .map((fr) => fr.id)
      .sort((a, b) => a - b);

    for (const rid of roots) emitNode(rid);

    // Safety: if anything rendered was missed, assign remaining stackOrder
    const leftovers = frames
      .filter((fr) => !fr.nullRender && !emitted.has(fr.id))
      .sort((a, b) => a.logicalOrder - b.logicalOrder);

    for (const fr of leftovers) emitRendered(fr.id);

    return frames;
  }

  /**
   * Offset-based token reader. Reads the next token starting at `this.pos`
   * within the range `[this.pos, end)`. Advances `this.pos` past the token.
   * Returns the token string. Only allocates the token itself (1-6 chars).
   */
  private nextToken(end: number): string {
    if (this.pos >= end) return "";
    const ch = this.src.charAt(this.pos);

    // Multi-digit number: 2-9 followed by more digits
    if (ch >= "1" && ch <= "9" && this.pos + 1 < end) {
      let j = this.pos + 1;
      while (j < end && this.src.charCodeAt(j) >= 48 && this.src.charCodeAt(j) <= 57) j++;
      const t = this.src.substring(this.pos, j);
      this.pos = j;
      return t;
    }

    // Single character token
    this.pos++;
    return ch;
  }

  /**
   * Find the matching close bracket for the opener at `this.pos - 1`.
   * Returns the position (absolute in `this.src`) of the closing bracket.
   */
  private findClose(openChar: string, end: number): number {
    let depth = 1;
    const close = openChar === "(" ? ")" : openChar === "[" ? "]" : "}";
    let i = this.pos;
    while (i < end && depth > 0) {
      const ch = this.src.charAt(i);
      if (ch === openChar) depth++;
      else if (ch === close) depth--;
      i++;
    }
    return i - 1; // position of the closing bracket
  }

  // Iterative with explicit stack to avoid V8 call-stack overflow
  // on deeply nested but valid DSL inputs (nesting depth >2000).
  private parseInternal(
    startEnd: number,
    startWidth: number,
    startHeight: number,
    startX: number,
    startY: number,
    startM: number,
    startRow: boolean,
    startStructDepth: number,
    startParentId: number,
    startOverlayDepth: number
  ): EngineFrame[] {
    const allFrames: EngineFrame[] = [];

    const clampInt = (n: number) => {
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, Math.trunc(n));
    };

    const splitEven = (total: number, parts: number): number[] => {
      const T = clampInt(total);
      const P = Math.max(1, clampInt(parts));
      const base = Math.trunc(T / P);
      const rem = T - base * P;

      const out = new Array(P).fill(base);

      let k = 0;
      let left = 0;
      let right = P - 1;

      while (k < rem && left <= right) {
        out[left] += 1;
        k += 1;
        if (k >= rem) break;
        if (right !== left) {
          out[right] += 1;
          k += 1;
        }
        left += 1;
        right -= 1;
      }

      return out;
    };

    const isNumberToken = (t: string) => {
      if (t.length === 0) return false;
      for (let i = 0; i < t.length; i++) {
        const c = t.charCodeAt(i);
        if (c < 48 || c > 57) return false;
      }
      return true;
    };

    // Post-processing types for the explicit stack
    const enum PostKind { Container, Overlay }

    interface SavedContext {
      // Iteration state
      end: number;
      width: number;
      height: number;
      sizes: number[];
      idx: number;
      carry: number;
      carryActive: boolean;
      runStartX: number;
      runStartY: number;
      pendingZeroIds: number[];
      cursorX: number;
      cursorY: number;
      m: number;
      row: boolean;
      structDepth: number;
      parentId: number;
      overlayDepth: number;
      // Post-processing info
      postKind: PostKind;
      closePos: number;
      seg: number;
      rectW: number;
      rectH: number;
      rectX: number;
      rectY: number;
      ownerId: number;
      overlayFrameStart: number; // index into allFrames where sub-call frames begin
    }

    // Current level state (initialized from start params)
    let end = startEnd;
    let width = startWidth;
    let height = startHeight;
    let row = startRow;
    let structDepth = startStructDepth;
    let parentId = startParentId;
    let overlayDepth = startOverlayDepth;
    let m = startM;

    let axisTotal = row ? height : width;
    let sizes = splitEven(axisTotal, m);
    let idx = 0;
    let carry = 0;
    let carryActive = false;
    let runStartX = startX;
    let runStartY = startY;
    let pendingZeroIds: number[] = [];
    let cursorX = startX;
    let cursorY = startY;

    const contextStack: SavedContext[] = [];

    const peekHasOverlay = (): boolean =>
      this.pos < end && this.src.charAt(this.pos) === "{";

    // Helper to apply overlay post-processing when returning from an overlay sub-call
    const applyOverlayPost = (ctx: SavedContext) => {
      this.pos = ctx.closePos + 1; // skip past '}'

      // Mark all frames added by the sub-call as overlay frames
      for (let fi = ctx.overlayFrameStart; fi < allFrames.length; fi++) {
        this.overlayFrameIds.add(allFrames[fi].id);
      }

      // Track rendered overlay frames
      const rendered: number[] = [];
      for (let fi = ctx.overlayFrameStart; fi < allFrames.length; fi++) {
        if (!allFrames[fi].nullRender) rendered.push(allFrames[fi].id);
      }
      if (rendered.length > 0) {
        const prev = this.overlayRenderedByOwner.get(ctx.ownerId) ?? [];
        this.overlayRenderedByOwner.set(ctx.ownerId, prev.concat(rendered));
      }
    };

    // Helper to apply container post-processing when returning from a container sub-call
    const applyContainerPost = (ctx: SavedContext) => {
      this.pos = ctx.closePos + 1; // skip past closing bracket

      // Container overlay check — must use ctx.end (parent's end), not current `end`
      if (this.pos < ctx.end && this.src.charAt(this.pos) === "{") {
        // Need to descend into overlay — save context again
        this.pos++; // consume '{'
        const ovClosePos = this.findClose("{", ctx.end);
        const ovInnerEnd = ovClosePos;

        const saved: SavedContext = {
          end: ctx.end,
          width: ctx.width,
          height: ctx.height,
          sizes: ctx.sizes,
          idx: ctx.idx,
          carry: ctx.carry,
          carryActive: ctx.carryActive,
          runStartX: ctx.runStartX,
          runStartY: ctx.runStartY,
          pendingZeroIds: ctx.pendingZeroIds,
          cursorX: ctx.cursorX,
          cursorY: ctx.cursorY,
          m: ctx.m,
          row: ctx.row,
          structDepth: ctx.structDepth,
          parentId: ctx.parentId,
          overlayDepth: ctx.overlayDepth,
          postKind: PostKind.Overlay,
          closePos: ovClosePos,
          seg: ctx.seg,
          rectW: ctx.rectW,
          rectH: ctx.rectH,
          rectX: ctx.rectX,
          rectY: ctx.rectY,
          ownerId: ctx.ownerId,
          overlayFrameStart: allFrames.length,
        };
        contextStack.push(saved);

        // Set up new level for overlay content
        end = ovInnerEnd;
        width = ctx.rectW;
        height = ctx.rectH;
        row = true;
        structDepth = ctx.structDepth;
        parentId = ctx.ownerId;
        overlayDepth = ctx.overlayDepth + 1;
        m = 1;
        axisTotal = row ? height : width;
        sizes = splitEven(axisTotal, m);
        idx = 0;
        carry = 0;
        carryActive = false;
        runStartX = ctx.rectX;
        runStartY = ctx.rectY;
        pendingZeroIds = [];
        cursorX = ctx.rectX;
        cursorY = ctx.rectY;
        return true; // signal: pushed new level
      }

      // No overlay — restore parent state and advance cursor
      end = ctx.end;
      width = ctx.width;
      height = ctx.height;
      sizes = ctx.sizes;
      idx = ctx.idx;
      carry = ctx.carry;
      carryActive = ctx.carryActive;
      runStartX = ctx.runStartX;
      runStartY = ctx.runStartY;
      pendingZeroIds = ctx.pendingZeroIds;
      cursorX = ctx.cursorX;
      cursorY = ctx.cursorY;
      m = ctx.m;
      row = ctx.row;
      structDepth = ctx.structDepth;
      parentId = ctx.parentId;
      overlayDepth = ctx.overlayDepth;

      if (row) cursorY += ctx.seg;
      else cursorX += ctx.seg;
      idx += 1;
      return false; // signal: restored, continue loop
    };

    // Main loop
    for (;;) {
      // Process current level's tokens
      while (idx < m) {
        let t = this.nextToken(end);

        if (t === ",") continue;
        if (t.length === 0) t = "-";

        const seg = sizes[idx] ?? 0;

        // --- 0 slot (zero-frame) with overlay growth ---
        if (t === "0") {
          if (!carryActive) {
            carryActive = true;
            carry = 0;
            runStartX = cursorX;
            runStartY = cursorY;
          }
          carry += seg;

          const mw = row ? width : carry;
          const mh = row ? carry : height;

          const f0: EngineFrame = {
            id: this.idCounter++,
            width: mw,
            height: mh,
            x: runStartX,
            y: runStartY,
            nullRender: true,
            zeroFrame: true,
            logicalOrder: -1,
            stackOrder: -1,
            structDepth,
            overlayDepth,
            parentFrameId: parentId,
            isLogicalOwner: false,
          };
          allFrames.push(f0);
          pendingZeroIds.push(f0.id);

          if (peekHasOverlay()) {
            // Save current state and descend into overlay
            this.pos++; // consume '{'
            const closePos = this.findClose("{", end);
            const innerEnd = closePos;

            const saved: SavedContext = {
              end, width, height, sizes, idx, carry, carryActive,
              runStartX, runStartY, pendingZeroIds: pendingZeroIds.slice(),
              cursorX, cursorY, m, row, structDepth, parentId, overlayDepth,
              postKind: PostKind.Overlay,
              closePos,
              seg,
              rectW: mw,
              rectH: mh,
              rectX: runStartX,
              rectY: runStartY,
              ownerId: f0.id,
              overlayFrameStart: allFrames.length,
            };
            contextStack.push(saved);

            // Set up new level for overlay content
            end = innerEnd;
            width = mw;
            height = mh;
            m = 1;
            row = true;
            // structDepth stays the same for overlays
            parentId = f0.id;
            overlayDepth = overlayDepth + 1;
            axisTotal = row ? height : width;
            sizes = splitEven(axisTotal, m);
            idx = 0;
            carry = 0;
            carryActive = false;
            runStartX = saved.rectX;
            runStartY = saved.rectY;
            pendingZeroIds = [];
            cursorX = saved.rectX;
            cursorY = saved.rectY;
            continue; // restart inner while loop at new level
          }

          if (row) cursorY += seg;
          else cursorX += seg;
          idx += 1;
          continue;
        }

        // --- claimant (1 / - / NUMBER...) absorbs carry ---
        let rectX = cursorX;
        let rectY = cursorY;
        let mergedAxis = seg;

        const runWasActive = carryActive;
        if (carryActive) {
          rectX = runStartX;
          rectY = runStartY;
          mergedAxis = carry + seg;
        }

        const rectW = row ? width : mergedAxis;
        const rectH = row ? mergedAxis : height;

        // inline resetCarry
        const doResetCarry = () => {
          carryActive = false;
          carry = 0;
          if (row) {
            runStartY = cursorY + seg;
          } else {
            runStartX = cursorX + seg;
          }
        };

        // --- hyphen (null-render) ---
        if (t === "-") {
          const hasOverlay = peekHasOverlay();
          const isLogicalOwner = hasOverlay;

          const f: EngineFrame = {
            id: this.idCounter++,
            width: rectW,
            height: rectH,
            x: rectX,
            y: rectY,
            nullRender: true,
            zeroFrame: false,
            logicalOrder: -1,
            stackOrder: -1,
            structDepth,
            overlayDepth,
            parentFrameId: parentId,
            isLogicalOwner,
          };
          allFrames.push(f);

          if (runWasActive) {
            for (const zid of pendingZeroIds) this.zeroClaimant.set(zid, f.id);
            pendingZeroIds = [];
          }
          doResetCarry();

          if (hasOverlay) {
            // Save current state and descend into overlay
            this.pos++; // consume '{'
            const closePos = this.findClose("{", end);
            const innerEnd = closePos;

            const saved: SavedContext = {
              end, width, height, sizes, idx, carry, carryActive,
              runStartX, runStartY, pendingZeroIds: pendingZeroIds.slice(),
              cursorX, cursorY, m, row, structDepth, parentId, overlayDepth,
              postKind: PostKind.Overlay,
              closePos,
              seg,
              rectW,
              rectH,
              rectX,
              rectY,
              ownerId: f.id,
              overlayFrameStart: allFrames.length,
            };
            contextStack.push(saved);

            // Set up new level for overlay content
            end = innerEnd;
            width = rectW;
            height = rectH;
            m = 1;
            row = true;
            parentId = f.id;
            overlayDepth = overlayDepth + 1;
            axisTotal = row ? height : width;
            sizes = splitEven(axisTotal, m);
            idx = 0;
            carry = 0;
            carryActive = false;
            runStartX = rectX;
            runStartY = rectY;
            pendingZeroIds = [];
            cursorX = rectX;
            cursorY = rectY;
            continue; // restart inner while loop at new level
          }

          if (row) cursorY += seg;
          else cursorX += seg;
          idx += 1;
          continue;
        }

        // --- 1 (rendered tile) ---
        if (t === "1") {
          const f: EngineFrame = {
            id: this.idCounter++,
            width: rectW,
            height: rectH,
            x: rectX,
            y: rectY,
            nullRender: false,
            zeroFrame: false,
            logicalOrder: this.logicalCounter++,
            stackOrder: -1,
            structDepth,
            overlayDepth,
            parentFrameId: parentId,
            isLogicalOwner: false,
          };
          allFrames.push(f);

          if (runWasActive) {
            for (const zid of pendingZeroIds) this.zeroClaimant.set(zid, f.id);
            pendingZeroIds = [];
          }
          doResetCarry();

          if (peekHasOverlay()) {
            // Save current state and descend into overlay
            this.pos++; // consume '{'
            const closePos = this.findClose("{", end);
            const innerEnd = closePos;

            const saved: SavedContext = {
              end, width, height, sizes, idx, carry, carryActive,
              runStartX, runStartY, pendingZeroIds: pendingZeroIds.slice(),
              cursorX, cursorY, m, row, structDepth, parentId, overlayDepth,
              postKind: PostKind.Overlay,
              closePos,
              seg,
              rectW,
              rectH,
              rectX,
              rectY,
              ownerId: f.id,
              overlayFrameStart: allFrames.length,
            };
            contextStack.push(saved);

            // Set up new level for overlay content
            end = innerEnd;
            width = rectW;
            height = rectH;
            m = 1;
            row = true;
            parentId = f.id;
            overlayDepth = overlayDepth + 1;
            axisTotal = row ? height : width;
            sizes = splitEven(axisTotal, m);
            idx = 0;
            carry = 0;
            carryActive = false;
            runStartX = rectX;
            runStartY = rectY;
            pendingZeroIds = [];
            cursorX = rectX;
            cursorY = rectY;
            continue; // restart inner while loop at new level
          }

          if (row) cursorY += seg;
          else cursorX += seg;
          idx += 1;
          continue;
        }

        // --- numeric container ---
        if (isNumberToken(t)) {
          const mult = parseInt(t, 10);

          const t2 = this.nextToken(end);
          const enclosureOpen = t2.charAt(0);
          const r = enclosureOpen !== "("; // [ means row split

          const closePos = this.findClose(enclosureOpen, end);
          const innerEnd = closePos;

          // Create GROUP frame
          const group: EngineFrame = {
            id: this.idCounter++,
            width: rectW,
            height: rectH,
            x: rectX,
            y: rectY,
            nullRender: true,
            zeroFrame: false,
            logicalOrder: -1,
            stackOrder: -1,
            structDepth,
            overlayDepth,
            parentFrameId: parentId,
            isLogicalOwner: false,
            row: r,
          };
          allFrames.push(group);

          if (runWasActive) {
            for (const zid of pendingZeroIds) this.zeroClaimant.set(zid, group.id);
            pendingZeroIds = [];
          }
          doResetCarry();

          // Save current state and descend into container children
          const saved: SavedContext = {
            end, width, height, sizes, idx, carry, carryActive,
            runStartX, runStartY, pendingZeroIds: pendingZeroIds.slice(),
            cursorX, cursorY, m, row, structDepth, parentId, overlayDepth,
            postKind: PostKind.Container,
            closePos,
            seg,
            rectW,
            rectH,
            rectX,
            rectY,
            ownerId: group.id,
            overlayFrameStart: allFrames.length,
          };
          contextStack.push(saved);

          // Set up new level for container children
          end = innerEnd;
          width = rectW;
          height = rectH;
          m = mult;
          row = r;
          structDepth = structDepth + 1;
          parentId = group.id;
          // overlayDepth stays the same for containers
          axisTotal = row ? height : width;
          sizes = splitEven(axisTotal, m);
          idx = 0;
          carry = 0;
          carryActive = false;
          runStartX = rectX;
          runStartY = rectY;
          pendingZeroIds = [];
          cursorX = rectX;
          cursorY = rectY;
          continue; // restart inner while loop at new level
        }

        // --- catch-all ---
        idx += 1;
      }

      // Current level is complete (idx >= m). Pop from stack.
      if (contextStack.length === 0) break;

      const ctx = contextStack.pop()!;

      if (ctx.postKind === PostKind.Overlay) {
        // Apply overlay post-processing
        applyOverlayPost(ctx);

        // Restore parent state
        end = ctx.end;
        width = ctx.width;
        height = ctx.height;
        sizes = ctx.sizes;
        idx = ctx.idx;
        carry = ctx.carry;
        carryActive = ctx.carryActive;
        runStartX = ctx.runStartX;
        runStartY = ctx.runStartY;
        pendingZeroIds = ctx.pendingZeroIds;
        cursorX = ctx.cursorX;
        cursorY = ctx.cursorY;
        m = ctx.m;
        row = ctx.row;
        structDepth = ctx.structDepth;
        parentId = ctx.parentId;
        overlayDepth = ctx.overlayDepth;

        // Advance cursor and idx
        if (row) cursorY += ctx.seg;
        else cursorX += ctx.seg;
        idx += 1;
      } else {
        // PostKind.Container — apply container post-processing
        // applyContainerPost may push a new level for container overlay
        const pushed = applyContainerPost(ctx);
        if (pushed) {
          // A new overlay level was pushed; continue processing it
          continue;
        }
        // Otherwise, state has been restored and cursor/idx advanced
      }
    }

    return allFrames;
  }
}

// ─────────────────────────────────────────────────────────────
// Precision computation
// ─────────────────────────────────────────────────────────────

/**
 * Compute precision metadata from an already-canonicalized m0 string.
 *
 * **Internal**: expects the string to be canonicalized (no aliases, no whitespace).
 * External callers should use `computePrecisionFromString` instead, which
 * canonicalizes the input first.
 *
 * Scans for numeric tokens > 0 followed immediately by `(` (col-split → maxSplitX)
 * or `[` (row-split → maxSplitY). Numbers not followed by `(` or `[` are ignored.
 */
export function computePrecisionFromCanonicalString(s: string): M0Precision {
  let maxSplitX = 1;
  let maxSplitY = 1;

  let i = 0;
  while (i < s.length) {
    const ch = s.charAt(i);

    // Look for start of a numeric token (non-zero digit)
    if (ch >= "1" && ch <= "9") {
      let numStr = ch;
      let j = i + 1;
      while (j < s.length && s.charAt(j) >= "0" && s.charAt(j) <= "9") {
        numStr += s.charAt(j);
        j++;
      }

      const n = parseInt(numStr, 10);

      // Check what follows the number
      if (j < s.length) {
        const next = s.charAt(j);
        if (next === "(") {
          maxSplitX = Math.max(maxSplitX, n);
        } else if (next === "[") {
          maxSplitY = Math.max(maxSplitY, n);
        }
      }

      i = j;
    } else {
      i++;
    }
  }

  return {
    maxSplitX,
    maxSplitY,
    maxSplitAny: Math.max(maxSplitX, maxSplitY),
  };
}

/**
 * Compute precision metadata from a raw m0 string (may contain aliases
 * like `F`, `>`, and whitespace).
 *
 * Canonicalizes the input first, then delegates to
 * `computePrecisionFromCanonicalString`.
 */
export function computePrecisionFromString(input: string): M0Precision {
  return computePrecisionFromCanonicalString(toCanonicalM0String(input));
}

// ─────────────────────────────────────────────────────────────
// Complete parse API
// ─────────────────────────────────────────────────────────────

// ─── Structural stableKey generation ─────────────────────────

function makeStableKeySegment(
  kind: M0NodeKind,
  childIndex: number | null,
  axis?: M0Axis,
): string {
  if (kind === "root") return "r";
  if (childIndex == null) throw new Error(`childIndex required for kind=${kind}`);

  switch (kind) {
    case "group": {
      if (!axis) throw new Error("axis required for group");
      return `g${axis}c${childIndex}`;
    }
    case "frame":
      return `fc${childIndex}`;
    case "passthrough":
      return `pc${childIndex}`;
    case "null":
      return `nc${childIndex}`;
    default:
      return `uc${childIndex}`;
  }
}

function makeStableKey(
  parentStableKey: StableKey | null,
  kind: M0NodeKind,
  childIndex: number | null,
  axis?: M0Axis,
): StableKey {
  const seg = makeStableKeySegment(kind, childIndex, axis);
  const key = parentStableKey ? `${parentStableKey}/${seg}` : seg;
  return key as StableKey;
}

/**
 * Build a M0NodeIdentity from structural tree position.
 *
 * stableKey is deterministic: based on the path of (kind, axis?, childIndex) from root.
 * Root stableKey is exactly "r". Groups include axis in their segment.
 */
export function buildIdentity(args: {
  kind: M0NodeKind;
  axis?: M0Axis;
  parentStableKey: StableKey | null;
  structuralDepth: number;
  childIndex: number | null;
}): M0NodeIdentity {
  const { kind, axis, parentStableKey, structuralDepth, childIndex } = args;

  const base = {
    stableKey: makeStableKey(parentStableKey, kind, childIndex, axis),
    parentStableKey,
    structuralDepth,
    span: null as M0Span | null,
  };

  if (kind === "root" || kind === "group") {
    if (!axis) throw new Error(`axis required for kind=${kind}`);
    return { ...base, kind, axis };
  }

  return { ...base, kind };
}

// ─── Node span computation (keyed by debugPath) ─────────────

/**
 * Compute character spans for **every** node in a canonical m0 string,
 * keyed by `debugPath` — the same path strings used by `buildIdentityMap`.
 *
 * Spans are keyed by debugPath rather than indexed by leaf order because
 * the overlay visitation order in `buildIdentityMap` (which separates base
 * children from overlay children) differs from the left-to-right string
 * order.  Path-based keying ensures reliable span assignment regardless
 * of traversal order.
 *
 * Node span rules:
 * - **Leaf** (`1`/`F`, `0`/`>`, `-`): `{ start: pos, end: pos + 1 }`
 * - **Container** (`N(…)` or `N[…]`): start at first digit, end after `)`/`]`
 * - **Overlay wrapper** (`{…}`): start at `{`, end after `}`.
 *   Assigned to the top-level node inside the overlay (the node that gets
 *   the `.ov{depth}.{k}` debugPath in `buildIdentityMap`).
 *
 * @param s  Canonical (whitespace-free) m0 string.
 * @returns  Map from debugPath → M0Span.
 */
// Iterative with explicit stack to avoid V8 call-stack overflow
// on deeply nested but valid DSL inputs (nesting depth >2000).
export function computeNodeSpansByPath(s: string): Map<string, M0Span> {
  const map = new Map<string, M0Span>();
  let pos = 0;

  type SpanWork =
    | { type: "node"; path: string; overlayDepth: number }
    | { type: "container_end"; path: string; start: number; overlayDepth: number }
    | { type: "children"; parentPath: string; count: number; nextIdx: number; overlayDepth: number }
    | { type: "check_overlay"; ownerPath: string; overlayDepth: number }
    | { type: "overlay_end"; ownerPath: string; overlayDepth: number; braceStart: number };

  const workStack: SpanWork[] = [{ type: "node", path: "root", overlayDepth: 0 }];

  while (workStack.length > 0) {
    const work = workStack.pop()!;

    if (work.type === "overlay_end") {
      // After the overlay inner node has been walked, skip '}'
      pos++; // skip '}'
      // Store brace-inclusive span on the wrapper key (no .0 suffix).
      // The inner node at wrapperPath keeps its own expression span.
      map.set(`${work.ownerPath}.ov${work.overlayDepth + 1}`, { start: work.braceStart, end: pos });
      continue;
    }

    if (work.type === "check_overlay") {
      // If pos is at '{', walk the overlay block
      if (pos >= s.length || s[pos] !== "{") continue;
      const newDepth = work.overlayDepth + 1;
      const braceStart = pos;
      pos++; // skip '{'
      const wrapperPath = `${work.ownerPath}.ov${newDepth}.0`;
      // Push overlay_end first (processed after inner node)
      workStack.push({ type: "overlay_end", ownerPath: work.ownerPath, overlayDepth: work.overlayDepth, braceStart });
      // Then push inner node (processed first)
      workStack.push({ type: "node", path: wrapperPath, overlayDepth: newDepth });
      continue;
    }

    if (work.type === "container_end") {
      // After children have been walked, skip closing bracket and set span
      pos++; // skip closing bracket
      map.set(work.path, { start: work.start, end: pos });
      // Check for overlay after the container
      workStack.push({ type: "check_overlay", ownerPath: work.path, overlayDepth: work.overlayDepth });
      continue;
    }

    if (work.type === "children") {
      // Process next child in siblings
      const { parentPath, count, overlayDepth } = work;
      const nextIdx = work.nextIdx;

      // Skip commas
      while (pos < s.length && s[pos] === ",") pos++;
      if (pos >= s.length || nextIdx >= count) continue;

      // Push remaining children first (processed after this child)
      if (nextIdx + 1 < count) {
        workStack.push({ type: "children", parentPath, count, nextIdx: nextIdx + 1, overlayDepth });
      }
      // Push this child node (processed first)
      workStack.push({ type: "node", path: `${parentPath}.${nextIdx}`, overlayDepth });
      continue;
    }

    // type === "node"
    const { path, overlayDepth } = work;
    if (pos >= s.length) continue;
    const ch = s[pos];

    // ── Always-leaf tokens: 0 / > / - / F ───────────────────
    if (ch === "0" || ch === ">" || ch === "-" || ch === "F") {
      map.set(path, { start: pos, end: pos + 1 });
      pos++;
      workStack.push({ type: "check_overlay", ownerPath: path, overlayDepth });
      continue;
    }

    // ── '1': leaf, 1-child container, or multi-digit start ──
    if (ch === "1") {
      const start = pos;
      // Multi-digit number starting with 1 (e.g. 10, 12, …)
      if (pos + 1 < s.length && s[pos + 1] >= "0" && s[pos + 1] <= "9") {
        while (pos < s.length && s[pos] >= "0" && s[pos] <= "9") pos++;
        const count = parseInt(s.substring(start, pos), 10);
        pos++; // skip opening bracket
        // Push container_end first (processed after children)
        workStack.push({ type: "container_end", path, start, overlayDepth });
        // Then push children (processed first)
        if (count > 0) {
          workStack.push({ type: "children", parentPath: path, count, nextIdx: 0, overlayDepth });
        }
        continue;
      }
      pos++; // consume '1'
      // Regular leaf tile
      map.set(path, { start, end: start + 1 });
      workStack.push({ type: "check_overlay", ownerPath: path, overlayDepth });
      continue;
    }

    // ── Digits 2-9: always a container count ─────────────────
    if (ch >= "2" && ch <= "9") {
      const start = pos;
      while (pos < s.length && s[pos] >= "0" && s[pos] <= "9") pos++;
      const count = parseInt(s.substring(start, pos), 10);
      pos++; // skip opening bracket
      // Push container_end first (processed after children)
      workStack.push({ type: "container_end", path, start, overlayDepth });
      // Then push children (processed first)
      if (count > 0) {
        workStack.push({ type: "children", parentPath: path, count, nextIdx: 0, overlayDepth });
      }
      continue;
    }
  }

  return map;
}

// ─── Frame classification & identity map ─────────────────────

/**
 * Determine the M0NodeKind for an EngineFrame.
 *
 * Root-level frames (parentFrameId === -1) are always "root".
 *
 * A structural GROUP is:
 * - nullRender === true
 * - zeroFrame === false
 * - isLogicalOwner !== true
 * - hasChildren === true
 *
 * Overlay children alone do NOT turn a node into a group.
 * Rendered frames, passthrough (0), and logical owners (-{}) retain their leaf kind.
 */
function classifyKind(
  f: EngineFrame,
  hasChildren: boolean,
  isRoot: boolean,
): M0NodeKind {
  if (isRoot) {
    return "root";
  }

  // Passthrough (0)
  if (f.zeroFrame) {
    return "passthrough";
  }

  // Structural numeric container (e.g. 2(...), 3[...])
  if (
    f.nullRender &&
    hasChildren &&
    !f.zeroFrame &&
    !f.isLogicalOwner
  ) {
    return "group";
  }

  // Null slot (- or -{})
  if (f.nullRender) {
    return "null";
  }

  // Rendered frame (1 / F)
  return "frame";
}


/**
 * Derive M0Axis from an EngineFrame's row flag.
 * Defaults to "col" when row is undefined (e.g. bare tiles, overlay parents).
 */
function axisFromRow(row?: boolean): M0Axis {
  return row ? "row" : "col";
}

/**
 * Build an identity map for all frames via DFS.
 * Maps each EngineFrame id to its structural M0NodeIdentity.
 *
 * Overlay invariant: overlay frames do NOT affect structural stableKeys.
 * - Structural (base) children are assigned childIndex among base siblings only.
 * - Overlay children are assigned keys in a separate `/ov{depth}c{k}` namespace
 *   so they cannot collide with or shift structural keys.
 * - `meta.depth` always reflects structural depth (`f.structDepth`), even for
 *   overlay frames. Overlay depth is tracked on `EditorFrame.depth`.
 */
function buildIdentityMap(
  allFrames: EngineFrame[],
  overlayIds: ReadonlySet<number>,
  spanByPath?: ReadonlyMap<string, M0Span>,
): Map<number, M0NodeIdentity> {
  const map = new Map<number, M0NodeIdentity>();

  const childrenOf = new Map<number, EngineFrame[]>();
  const roots: EngineFrame[] = [];

  for (const f of allFrames) {
    if (f.parentFrameId === -1) {
      roots.push(f);
    } else {
      const children = childrenOf.get(f.parentFrameId) ?? [];
      children.push(f);
      childrenOf.set(f.parentFrameId, children);
    }
  }

  for (const children of childrenOf.values()) {
    children.sort((a, b) => a.id - b.id);
  }

  // Iterative with explicit stack to avoid V8 call-stack overflow
  // on deeply nested but valid DSL inputs (nesting depth >2000).
  type IdentityWork =
    | { type: "structural"; f: EngineFrame; isRoot: boolean; childIndex: number | null; parentStableKey: StableKey | null; debugPath: string }
    | { type: "overlay"; f: EngineFrame; stableKey: StableKey; parentStableKey: StableKey; debugPath: string };

  if (roots.length !== 1) {
    throw new Error(`Expected exactly 1 root frame, got ${roots.length}`);
  }

  const identityStack: IdentityWork[] = [
    { type: "structural", f: roots[0], isRoot: true, childIndex: null, parentStableKey: null, debugPath: "root" },
  ];

  while (identityStack.length > 0) {
    const work = identityStack.pop()!;

    if (work.type === "structural") {
      const { f, isRoot, childIndex, parentStableKey, debugPath } = work;

      // Single-pass partition instead of two filter() calls
      const allChildren = childrenOf.get(f.id) ?? [];
      const baseChildren: EngineFrame[] = [];
      const overlayChildren: EngineFrame[] = [];
      for (const c of allChildren) {
        (overlayIds.has(c.id) ? overlayChildren : baseChildren).push(c);
      }

      const kind = classifyKind(f, baseChildren.length > 0, isRoot);
      const axis: M0Axis | undefined =
        (kind === "root" || kind === "group") ? axisFromRow(f.row) : undefined;

      const id = buildIdentity({
        kind,
        axis,
        parentStableKey,
        structuralDepth: f.structDepth,
        childIndex,
      });

      // Assign span from path-based map (debugPath is transient, not stored on identity)
      if (spanByPath) {
        id.span = spanByPath.get(debugPath) ?? null;
      }

      map.set(f.id, id);

      // Push overlay children in reverse order (processed after base children)
      for (let k = overlayChildren.length - 1; k >= 0; k--) {
        const ov = overlayChildren[k];
        const ovKey = `${id.stableKey}/ov${ov.overlayDepth}c${k}` as StableKey;
        identityStack.push({
          type: "overlay",
          f: ov,
          stableKey: ovKey,
          parentStableKey: id.stableKey,
          debugPath: `${debugPath}.ov${ov.overlayDepth}.${k}`,
        });
      }

      // Push base children in reverse order (processed first in correct order)
      for (let i = baseChildren.length - 1; i >= 0; i--) {
        identityStack.push({
          type: "structural",
          f: baseChildren[i],
          isRoot: false,
          childIndex: i,
          parentStableKey: id.stableKey,
          debugPath: `${debugPath}.${i}`,
        });
      }
    } else {
      // type === "overlay"
      const { f, stableKey, parentStableKey, debugPath } = work;

      // Single-pass partition: base children (same overlay depth) vs nested overlays
      const allChildren = childrenOf.get(f.id) ?? [];
      const baseChildren: EngineFrame[] = [];
      const nestedOverlays: EngineFrame[] = [];
      for (const c of allChildren) {
        (c.overlayDepth <= f.overlayDepth ? baseChildren : nestedOverlays).push(c);
      }

      const kind = classifyKind(f, baseChildren.length > 0, false);
      const axis: M0Axis | undefined =
        (kind === "root" || kind === "group") ? axisFromRow(f.row) : undefined;

      const base = {
        stableKey,
        parentStableKey,
        structuralDepth: f.structDepth,
        span: null as M0Span | null,
      };

      let identity: M0NodeIdentity;
      if (kind === "root" || kind === "group") {
        if (!axis) throw new Error(`axis required for kind=${kind}`);
        identity = { ...base, kind, axis };
      } else {
        identity = { ...base, kind };
      }

      if (spanByPath) {
        identity.span = spanByPath.get(debugPath) ?? null;
      }

      map.set(f.id, identity);

      // Push nested overlays in reverse order (processed after base children)
      for (let k = nestedOverlays.length - 1; k >= 0; k--) {
        const ov = nestedOverlays[k];
        const ovKey = `${stableKey}/ov${ov.overlayDepth}c${k}` as StableKey;
        identityStack.push({
          type: "overlay",
          f: ov,
          stableKey: ovKey,
          parentStableKey: stableKey,
          debugPath: `${debugPath}.ov${ov.overlayDepth}.${k}`,
        });
      }

      // Push base children in reverse order (processed first in correct order)
      for (let i = baseChildren.length - 1; i >= 0; i--) {
        const child = baseChildren[i];
        const childKind = classifyKind(child, (childrenOf.get(child.id) ?? []).some(c2 => c2.overlayDepth <= child.overlayDepth), false);
        const childAxis: M0Axis | undefined =
          (childKind === "root" || childKind === "group") ? axisFromRow(child.row) : undefined;
        const childKey = makeStableKey(stableKey, childKind, i, childAxis);
        identityStack.push({
          type: "overlay",
          f: child,
          stableKey: childKey,
          parentStableKey: stableKey,
          debugPath: `${debugPath}.${i}`,
        });
      }
    }
  }

  return map;
}

/**
 * Build traversal events from the engine's flat frame list via DFS.
 * Uses the pre-built identity map for structural stableKeys.
 */
function buildTraversal(
  allFrames: EngineFrame[],
  identityMap: Map<number, M0NodeIdentity>,
): M0TraversalEvent[] {
  const events: M0TraversalEvent[] = [];

  // Build parent -> children map
  const childrenOf = new Map<number, EngineFrame[]>();
  const roots: EngineFrame[] = [];

  for (const f of allFrames) {
    if (f.parentFrameId === -1) {
      roots.push(f);
    } else {
      const children = childrenOf.get(f.parentFrameId) ?? [];
      children.push(f);
      childrenOf.set(f.parentFrameId, children);
    }
  }

  // Sort children by id (creation order = DFS order)
  for (const children of childrenOf.values()) {
    children.sort((a, b) => a.id - b.id);
  }

  let leafIdx = 0;
  let seqCounter = 0;

  // Iterative with explicit stack to avoid V8 call-stack overflow
  // on deeply nested but valid DSL inputs (nesting depth >2000).
  type TraversalWork =
    | { type: "enter"; f: EngineFrame }
    | { type: "exit"; id: M0NodeIdentity; rect: M0Rect };

  const visitStack: TraversalWork[] = [];

  // Push roots in reverse order for correct LIFO processing
  for (let i = roots.length - 1; i >= 0; i--) {
    visitStack.push({ type: "enter", f: roots[i] });
  }

  while (visitStack.length > 0) {
    const work = visitStack.pop()!;

    if (work.type === "exit") {
      events.push({
        type: "exit",
        id: work.id,
        seq: seqCounter++,
        rect: work.rect,
      });
      continue;
    }

    const f = work.f;
    const children = childrenOf.get(f.id) ?? [];
    const id = identityMap.get(f.id)!;
    const rect: M0Rect = { x: f.x, y: f.y, width: f.width, height: f.height };

    const isLeaf = children.length === 0;
    const isRenderedLeaf = isLeaf && !f.nullRender;

    if (isRenderedLeaf) {
      events.push({
        type: "emitLeaf",
        id,
        seq: seqCounter++,
        rect,
        leafIndex: leafIdx++,
      });
    } else {
      events.push({
        type: "enter",
        id,
        seq: seqCounter++,
        rect,
      });

      // Push exit first (processed after all children)
      visitStack.push({ type: "exit", id, rect });

      // Push children in reverse order (processed first in correct order)
      for (let i = children.length - 1; i >= 0; i--) {
        visitStack.push({ type: "enter", f: children[i] });
      }
    }
  }

  return events;
}

/**
 * Full parse of a m0 string — the most complete output.
 *
 * Use this when you need both render frames and structural metadata
 * (editor graph, precision, warnings) in a single call, or when you need
 * to distinguish valid vs invalid input via the `ok` discriminant.
 *
 * @returns `ParseM0Result`, a discriminated union:
 *   - `{ ok: true, ir, precision, warnings }` — `ir` contains `renderFrames`,
 *     `editorFrames`, `width`, `height`, and optional `traversal` (when `opts.trace`).
 *   - `{ ok: false, error, precision, warnings }` — `error` is a `M0ValidationError`.
 *
 * `precision` and `warnings` are always present regardless of `ok`.
 */
export function parseM0StringComplete(
  input: string,
  width: number,
  height: number,
  opts?: ParseM0Options,
): ParseM0Result {
  const s = toCanonicalM0String(input);

  // Compute precision + warnings regardless of validity
  const precision = computePrecisionFromCanonicalString(s);
  const norm = opts?.precisionNorm ?? 100;
  const warnings: M0Warning[] = [];

  if (precision.maxSplitAny > norm) {
    warnings.push(
      makeWarning({
        code: "PRECISION_EXCEEDS_NORM",
        message: `Precision ${precision.maxSplitAny} exceeds norm ${norm}. Max split: ${precision.maxSplitX}\u00d7${precision.maxSplitY} (col\u00d7row).`,
        details: { norm, ...precision },
      }),
    );
  }

  const validationResult = validateM0String(s);
  if (validationResult.ok === false) {
    return {
      ok: false,
      error: validationResult.error,
      precision,
      warnings,
    };
  }

  const { frames: engineFrames, zeroClaimantMap, overlayFrameIds: overlayIds } = EngineM0Parser.parse(s, width, height);

  // Check for 0-size frames (infeasible splits at given dimensions)
  const valid = engineFrames.filter((f) => f.width > 0 && f.height > 0);
  if (valid.length !== engineFrames.length || valid.length === 0) {
    return {
      ok: false,
      error: makeValidationError({
        code: "SPLIT_EXCEEDS_AXIS",
        message:
          "Split produced a 0-size frame (infeasible at given width/height).",
        details: {
          width,
          height,
          maxSplitX: precision.maxSplitX,
          maxSplitY: precision.maxSplitY,
        },
      }),
      precision,
      warnings,
    };
  }

  // Build structural identity map (DFS assigns stableKeys to all frames)
  // overlayIds already destructured from parse result above
  // Always build the full structural graph. Callers that only need
  // geometry should use parseM0StringToRenderFrames instead.
  const includeDebugPayload = true;

  // Rendered frames sorted by stackOrder (paint order)
  const rendered = valid.filter((f) => !f.nullRender);
  const paintSorted = [...rendered].sort((a, b) => a.stackOrder - b.stackOrder);

  // Logical order — needed for logicalIndex mapping
  const logicalSorted = [...rendered].sort((a, b) => a.logicalOrder - b.logicalOrder);

  // Map engine frame id → 0-based logical tile index
  const logicalIndexByFrameId = new Map<number, number>();
  for (let i = 0; i < logicalSorted.length; i++) {
    logicalIndexByFrameId.set(logicalSorted[i].id, i);
  }

  // Identity map — only built when the full graph is requested.
  // For the fast path (renderFrames only), build lightweight placeholders.
  let identityMap: Map<number, M0NodeIdentity>;
  if (includeDebugPayload) {
    const spanByPath = computeNodeSpansByPath(s);
    identityMap = buildIdentityMap(valid, overlayIds, spanByPath);
  } else {
    // Lightweight: minimal identity for rendered frames only.
    // No stableKey hierarchy, no spans — just enough for the canvas.
    identityMap = new Map();
    for (let i = 0; i < logicalSorted.length; i++) {
      const f = logicalSorted[i];
      identityMap.set(f.id, {
        kind: "frame",
        stableKey: `f${i}` as StableKey,
        parentStableKey: null,
        structuralDepth: f.structDepth,
        span: null,
      });
    }
  }

  // Build RenderFrame[] (paint order)
  const renderFrames: DslRenderFrame[] = paintSorted.map((f, i) => ({
    width: f.width,
    height: f.height,
    x: f.x,
    y: f.y,
    paintOrder: i,
    logicalIndex: logicalIndexByFrameId.get(f.id)!,
    meta: identityMap.get(f.id)!,
  }));

  // ── Full graph construction (only when requested) ────────
  // The heavy work below (55K EditorFrame objects, passthrough owner
  // DFS, children maps, resolution diagnostics) is gated behind
  // includeDebugPayload. Without it, only renderFrames are returned.
  // Resolution diagnostics — computed from renderFrames (always cheap)
  let resolutionDiagnostics: M0ResolutionDiagnostics | undefined;
  if (renderFrames.length > 0) {
    let tightestWidthPx = Infinity;
    let tightestHeightPx = Infinity;
    let tightestWidthStableKey: StableKey | null = null;
    let tightestHeightStableKey: StableKey | null = null;
    for (const frame of renderFrames) {
      if (frame.width < tightestWidthPx) {
        tightestWidthPx = frame.width;
        tightestWidthStableKey = frame.meta.stableKey;
      }
      if (frame.height < tightestHeightPx) {
        tightestHeightPx = frame.height;
        tightestHeightStableKey = frame.meta.stableKey;
      }
    }
    resolutionDiagnostics = { tightestWidthPx, tightestHeightPx, tightestWidthStableKey, tightestHeightStableKey };
  }

  let editorFrames: EditorFrame[] = [];
  let traversal: M0TraversalEvent[] | undefined;

  if (includeDebugPayload) {
    const byId = new Map<number, EngineFrame>();
    for (const f of valid) byId.set(f.id, f);

    const editorChildrenOf = new Map<number, number[]>();
    for (const f of valid) {
      if (f.parentFrameId >= 0) {
        const arr = editorChildrenOf.get(f.parentFrameId) ?? [];
        arr.push(f.id);
        editorChildrenOf.set(f.parentFrameId, arr);
      }
    }
    for (const arr of editorChildrenOf.values()) arr.sort((a, b) => a - b);

    function firstRenderedDescendant(rootId: number): EngineFrame | null {
      let best: EngineFrame | null = null;
      const stack = [rootId];
      while (stack.length) {
        const id = stack.pop()!;
        const fr = byId.get(id);
        if (!fr) continue;
        if (!fr.nullRender && fr.logicalOrder >= 0) {
          if (!best || fr.logicalOrder < best.logicalOrder) best = fr;
        }
        const kids = editorChildrenOf.get(id) ?? [];
        for (let i = kids.length - 1; i >= 0; i--) {
          const childId = kids[i];
          if (overlayIds.has(childId)) continue;
          stack.push(childId);
        }
      }
      return best;
    }

    function computePassthroughOwner(f: EngineFrame): PassthroughOwner | undefined {
      const claimantId = zeroClaimantMap.get(f.id);
      if (claimantId == null) return undefined;
      const claimant = byId.get(claimantId);
      if (!claimant) return undefined;
      const ownerStableKey = identityMap.get(claimant.id)!.stableKey;
      if (!claimant.nullRender) {
        return { kind: "frame", logicalIndex: claimant.logicalOrder, ownerStableKey };
      }
      const anchor = firstRenderedDescendant(claimantId);
      if (!anchor) return undefined;
      return { kind: "group", ownerStableKey };
    }

    editorFrames = valid.map((f) => {
      const identity = identityMap.get(f.id)!;
      const passthroughOwner = f.zeroFrame ? computePassthroughOwner(f) : undefined;
      return {
        x: f.x, y: f.y, width: f.width, height: f.height,
        overlayDepth: f.overlayDepth,
        nullFrame: f.nullRender,
        passthroughFrame: f.zeroFrame,
        isLogicalOwner: f.isLogicalOwner || undefined,
        kind: identity.kind,
        axis: (identity.kind === "root" || identity.kind === "group") ? identity.axis : undefined,
        logicalIndex: f.logicalOrder >= 0 ? f.logicalOrder : undefined,
        stackOrder: f.stackOrder >= 0 ? f.stackOrder : undefined,
        meta: identity,
        passthroughOwner,
      };
    });

    if (opts?.trace) {
      traversal = buildTraversal(valid, identityMap);
    }
  }

  const ir: M0IR = {
    width,
    height,
    renderFrames,
    editorFrames,
    traversal,
  };

  return {
    ok: true,
    ir,
    precision,
    resolutionDiagnostics,
    warnings,
  };
}

/**
 * Parse a m0 string into LogicalFrame objects in DSL appearance order.
 *
 * Use this when you need rendered tiles in source order with real stableKeys
 * but don't need the full structural graph or paint ordering.
 *
 * @returns `LogicalFrame[]` where each frame has `{ x, y, width, height,
 *          logicalIndex, meta }`. Array index === logicalIndex.
 *          Returns `[]` if the input is invalid.
 */
export function parseM0StringToLogicalFrames(
  s: string,
  width: number,
  height: number,
): LogicalFrame[] {
  const result = parseM0StringComplete(s, width, height);
  if (!result.ok) return [];
  return result.ir.renderFrames
    .slice()
    .sort((a, b) => a.logicalIndex - b.logicalIndex)
    .map((f) => ({
      logicalIndex: f.logicalIndex,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      meta: f.meta!,
    }));
}

/**
 * Parse a m0 string into the full structural graph.
 *
 * Use this for editor UIs that need to visualize split boundaries,
 * passthrough chains, overlay nesting, and structural hierarchy.
 *
 * @returns `EditorFrame[]` — every node: root, groups, frames, passthroughs,
 *          nulls, and overlay subtrees. Each has `{ x, y, width, height, kind,
 *          overlayDepth, meta }` with real `meta.stableKey` paths.
 *          Returns `[]` if the input is invalid.
 */
export function parseM0StringToFullGraph(
  s: string,
  width: number,
  height: number,
): EditorFrame[] {
  const result = parseM0StringComplete(s, width, height);
  if (!result.ok) return [];
  return result.ir.editorFrames ?? [];
}

/**
 * Parse a m0 string into the full structural graph + DFS traversal events.
 *
 * Use this when you need to replay the parse as a stream of enter/emitLeaf/exit
 * events (e.g., for custom renderers or analysis that walks the tree).
 *
 * @returns `FullGraphWithTraversal` — `{ editorFrames: EditorFrame[],
 *          traversal: M0TraversalEvent[] }`.
 *          Returns `{ editorFrames: [], traversal: [] }` if the input is invalid.
 *
 * Heaviest parse path. Use `parseM0StringToFullGraph` if you don't need
 * the traversal stream.
 */
export function parseM0StringToFullGraphWithTraversal(
  s: string,
  width: number,
  height: number,
): FullGraphWithTraversal {
  const result = parseM0StringComplete(s, width, height, { trace: true });
  if (!result.ok) return { editorFrames: [], traversal: [] };
  return {
    editorFrames: result.ir.editorFrames ?? [],
    traversal: result.ir.traversal ?? [],
  };
}

export function assertOk(
  result: ParseM0Result
): asserts result is Extract<ParseM0Result, { ok: true }> {
  if (result.ok) return;
  if ("error" in result) {
    throw new Error(result.error.message);
  }
  throw new Error("Unexpected parse result state");
}
