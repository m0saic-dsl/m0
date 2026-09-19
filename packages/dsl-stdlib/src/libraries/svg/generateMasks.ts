/**
 * Generate the dictionary-asset mask set for an inferred grid + composed M0.
 *
 * Lifted from `packages/docs/svg-to-mosaic/tools/06-generate-masks.ts`,
 * with the public output projected directly to the dictionary's
 * `MosaicMaskSetFile` shape (mirrored locally — see `MIRRORED_TYPES.md`):
 *
 *   { masks: Array<MosaicMaskEntry | null> }   length === sourceCount
 *
 * Where each slot is:
 *   - `null` if the shape's path is a simple axis-aligned rect (the layout
 *     already captures it; no clipping needed at render time).
 *   - `{ localPath, bounds }` if the path has any non-rect commands (e.g.
 *     diagonals, curves); the engine clips the tile to the local path
 *     scaled into its render bounds.
 *
 * Pure, deterministic, no I/O.
 */

import { parseM0StringToFullGraph, parseM0StringToRenderFrames } from "@m0saic/dsl";
import type { M0String } from "@m0saic/dsl";
import type { MosaicMaskEntry, MosaicMaskSetFile } from "../../mirroredTypes";
import type { Grid, GridShape, SnappedBounds } from "./types";

export type GenerateMasksOptions = {
  /**
   * Canvas dimensions used to materialize render frames from the m0 string.
   * Defaults to `grid.viewBox` (or the extent of the grid lines if the
   * grid has no viewBox). The choice matters for bounds rounding but not
   * for the rect-vs-masked classification.
   */
  canvasW?: number;
  canvasH?: number;
  /**
   * When true, polygon-clip each mask's `localPath` to its assigned
   * rect's bounds via {@link clipLocalPathToBounds}. Off by default to
   * preserve byte-for-byte parity with the legacy docs step-06 pipeline
   * (the dictionary build goldens lock that parity). The SVG → Mosaic
   * wizard enables it so drift-induced overflow doesn't produce
   * silhouettes that visibly poke out past their tiles. Paths containing
   * curve commands are left unclipped regardless — see
   * {@link clipLocalPathToBounds}.
   */
  clipToBounds?: boolean;
};

type FullGraphNode = {
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  meta?: { stableKey?: string };
};

type RenderFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
  meta?: { stableKey?: string };
};

// ── Path classification ───────────────────────────────────────────────

/**
 * A path is "masked" (needs a localPath clip at render time) if it has
 * ANY `L` commands OR doesn't match the simple `M_H_V_H_V_Z` axis-aligned
 * rectangle template. Lifted from step 06's `isMaskedPath`.
 */
export function isMaskedPath(d: string): boolean {
  const compact = d.replace(/\s+/g, "");
  if (/L/i.test(compact)) return true;
  const rectLike =
    /^M[-+0-9.]+[-+0-9.]+H[-+0-9.]+V[-+0-9.]+H[-+0-9.]+V[-+0-9.]+Z$/i.test(compact);
  return !rectLike;
}

// ── Local-path translation (subtract owner's top-left) ────────────────

function tokenizePath(d: string): string[] {
  return d.match(/[A-Za-z]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g) ?? [];
}

function formatNum(n: number): string {
  const v = Math.abs(n) < 1e-9 ? 0 : n;
  return Number(v.toFixed(4)).toString();
}

/**
 * Translate every coordinate in an SVG path string by subtracting the given
 * origin. Supports the full M/L/H/V/C/S/Q/A/Z command set in both absolute
 * (uppercase) and relative (lowercase) forms.
 *
 * Insight: translation only affects **absolute** coordinates. Relative
 * coordinates are offsets from the previous point — and since every previous
 * point has been translated by the same amount, the relative offset is
 * unchanged. So lowercase commands pass through verbatim.
 *
 * Special case: per the SVG spec, the FIRST `m` command in a path is treated
 * as absolute (positions the initial point), with any subsequent implicit
 * pairs becoming relative `l` line-tos. We honor that.
 */
export function toLocalPath(d: string, origin: { x: number; y: number }): string {
  const tokens = tokenizePath(d);
  const out: string[] = [];
  let cmd = "";
  let i = 0;
  // True until the first coordinate has been consumed; only matters for the
  // lowercase-`m`-at-start rule.
  let atPathStart = true;

  while (i < tokens.length) {
    const tok = tokens[i];
    if (/^[A-Za-z]$/.test(tok)) {
      cmd = tok;
      out.push(tok);
      i += 1;
      continue;
    }
    if (!cmd) {
      throw new Error(`generateMasks: malformed SVG path — numeric token before command in "${d}"`);
    }
    switch (cmd) {
      case "M":
      case "L": {
        const x = Number(tokens[i]);
        const y = Number(tokens[i + 1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new Error(`generateMasks: malformed ${cmd} command in "${d}"`);
        }
        out.push(formatNum(x - origin.x), formatNum(y - origin.y));
        i += 2;
        atPathStart = false;
        break;
      }
      case "m": {
        // Per SVG spec: first `m` in a path is absolute (positions initial
        // point). Subsequent implicit pairs are relative `l` line-tos.
        const x = Number(tokens[i]);
        const y = Number(tokens[i + 1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new Error(`generateMasks: malformed m command in "${d}"`);
        }
        if (atPathStart) {
          out.push(formatNum(x - origin.x), formatNum(y - origin.y));
          // Implicit-l rule: switch cmd so any further pairs in this command
          // are treated as relative line-tos.
          cmd = "l";
        } else {
          out.push(formatNum(x), formatNum(y));
        }
        i += 2;
        atPathStart = false;
        break;
      }
      case "l": {
        // Relative line-to — coords are offsets, pass through unchanged.
        const x = Number(tokens[i]);
        const y = Number(tokens[i + 1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new Error(`generateMasks: malformed l command in "${d}"`);
        }
        out.push(formatNum(x), formatNum(y));
        i += 2;
        atPathStart = false;
        break;
      }
      case "H": {
        const x = Number(tokens[i]);
        if (!Number.isFinite(x)) throw new Error(`generateMasks: malformed H in "${d}"`);
        out.push(formatNum(x - origin.x));
        i += 1;
        atPathStart = false;
        break;
      }
      case "h": {
        // Relative horizontal — offset, pass through.
        const x = Number(tokens[i]);
        if (!Number.isFinite(x)) throw new Error(`generateMasks: malformed h in "${d}"`);
        out.push(formatNum(x));
        i += 1;
        atPathStart = false;
        break;
      }
      case "V": {
        const y = Number(tokens[i]);
        if (!Number.isFinite(y)) throw new Error(`generateMasks: malformed V in "${d}"`);
        out.push(formatNum(y - origin.y));
        i += 1;
        atPathStart = false;
        break;
      }
      case "v": {
        // Relative vertical — offset, pass through.
        const y = Number(tokens[i]);
        if (!Number.isFinite(y)) throw new Error(`generateMasks: malformed v in "${d}"`);
        out.push(formatNum(y));
        i += 1;
        atPathStart = false;
        break;
      }
      case "C": {
        const vals = [0, 1, 2, 3, 4, 5].map((k) => Number(tokens[i + k]));
        if (vals.some((v) => !Number.isFinite(v))) {
          throw new Error(`generateMasks: malformed C in "${d}"`);
        }
        out.push(
          formatNum(vals[0] - origin.x), formatNum(vals[1] - origin.y),
          formatNum(vals[2] - origin.x), formatNum(vals[3] - origin.y),
          formatNum(vals[4] - origin.x), formatNum(vals[5] - origin.y),
        );
        i += 6;
        atPathStart = false;
        break;
      }
      case "c": {
        // Relative cubic Bezier — all 6 numbers are offsets, pass through.
        const vals = [0, 1, 2, 3, 4, 5].map((k) => Number(tokens[i + k]));
        if (vals.some((v) => !Number.isFinite(v))) {
          throw new Error(`generateMasks: malformed c in "${d}"`);
        }
        out.push(
          formatNum(vals[0]), formatNum(vals[1]),
          formatNum(vals[2]), formatNum(vals[3]),
          formatNum(vals[4]), formatNum(vals[5]),
        );
        i += 6;
        atPathStart = false;
        break;
      }
      case "S":
      case "Q": {
        const vals = [0, 1, 2, 3].map((k) => Number(tokens[i + k]));
        if (vals.some((v) => !Number.isFinite(v))) {
          throw new Error(`generateMasks: malformed ${cmd} in "${d}"`);
        }
        out.push(
          formatNum(vals[0] - origin.x), formatNum(vals[1] - origin.y),
          formatNum(vals[2] - origin.x), formatNum(vals[3] - origin.y),
        );
        i += 4;
        atPathStart = false;
        break;
      }
      case "s":
      case "q": {
        // Relative smooth-cubic / quadratic Bezier — offsets, pass through.
        const vals = [0, 1, 2, 3].map((k) => Number(tokens[i + k]));
        if (vals.some((v) => !Number.isFinite(v))) {
          throw new Error(`generateMasks: malformed ${cmd} in "${d}"`);
        }
        out.push(
          formatNum(vals[0]), formatNum(vals[1]),
          formatNum(vals[2]), formatNum(vals[3]),
        );
        i += 4;
        atPathStart = false;
        break;
      }
      case "A": {
        const vals = [0, 1, 2, 3, 4, 5, 6].map((k) => Number(tokens[i + k]));
        if (vals.some((v) => !Number.isFinite(v))) {
          throw new Error(`generateMasks: malformed A in "${d}"`);
        }
        // rx, ry, rotation, large-arc, sweep are NOT translated; only the endpoint.
        out.push(
          formatNum(vals[0]), formatNum(vals[1]), formatNum(vals[2]),
          formatNum(vals[3]), formatNum(vals[4]),
          formatNum(vals[5] - origin.x), formatNum(vals[6] - origin.y),
        );
        i += 7;
        atPathStart = false;
        break;
      }
      case "a": {
        // Relative arc — only the endpoint is a coordinate; for the absolute
        // form we translated it, here it's already an offset so pass through.
        const vals = [0, 1, 2, 3, 4, 5, 6].map((k) => Number(tokens[i + k]));
        if (vals.some((v) => !Number.isFinite(v))) {
          throw new Error(`generateMasks: malformed a in "${d}"`);
        }
        out.push(
          formatNum(vals[0]), formatNum(vals[1]), formatNum(vals[2]),
          formatNum(vals[3]), formatNum(vals[4]),
          formatNum(vals[5]), formatNum(vals[6]),
        );
        i += 7;
        atPathStart = false;
        break;
      }
      case "Z":
      case "z":
        i += 1;
        break;
      default:
        throw new Error(
          `generateMasks: unsupported SVG path command "${cmd}" in "${d}" (expected M/L/H/V/C/S/Q/A/Z, absolute or relative)`,
        );
    }
  }

  return out.join(" ");
}

// ── Clip-to-bounds ────────────────────────────────────────────────────

/**
 * Sutherland-Hodgman polygon clip of `localPath` against the rect
 * `[0, 0, width, height]` in local coordinates.
 *
 * Why this exists: `inferGrid` allows some drift (gcd-snap, cluster) to
 * find DSL-compressing grids. That can shrink a render frame relative to
 * the source SVG shape — so the path produced by `toLocalPath` may extend
 * past the rect it ends up assigned to and visually overflow at render
 * time. We clip the polygon to the rect so the silhouette stays inside
 * its tile, matching the dictionary's "masks can't break out of their
 * rects" guarantee.
 *
 * Scope: handles axis-aligned straight-line paths (M/L/H/V/Z, absolute and
 * relative). Paths containing curve commands (C/S/Q/A and their lowercase
 * relatives) are returned unchanged — Sutherland-Hodgman on tessellated
 * curves is a future refinement; the wizard's masks are almost always
 * polygonal silhouettes, so this covers the practical case.
 *
 * If the clipped polygon would be degenerate (zero area / no overlap with
 * the rect), returns the original path so the caller can decide what to
 * do (typically: keep the original; the visual issue is preferable to
 * losing the mask entirely).
 */
export function clipLocalPathToBounds(
  localPath: string,
  width: number,
  height: number,
): string {
  if (CURVE_CMD_RE.test(localPath)) return localPath;
  const verts = localPathToVertices(localPath);
  if (!verts || verts.length < 3) return localPath;
  const clipped = clipPolygonToRect(verts, width, height);
  if (clipped.length < 3) return localPath;
  return verticesToPath(clipped);
}

const CURVE_CMD_RE = /[CSQAcsqa]/;

type Vec2 = { x: number; y: number };

function localPathToVertices(localPath: string): Vec2[] | null {
  const tokens = tokenizePath(localPath);
  const verts: Vec2[] = [];
  let cx = 0;
  let cy = 0;
  let cmd = "";
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (/^[A-Za-z]$/.test(tok)) {
      cmd = tok;
      i += 1;
      continue;
    }
    if (!cmd) return null;
    switch (cmd) {
      case "M":
      case "L": {
        cx = Number(tokens[i]);
        cy = Number(tokens[i + 1]);
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
        verts.push({ x: cx, y: cy });
        i += 2;
        break;
      }
      case "m":
      case "l": {
        const dx = Number(tokens[i]);
        const dy = Number(tokens[i + 1]);
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
        cx += dx;
        cy += dy;
        verts.push({ x: cx, y: cy });
        i += 2;
        break;
      }
      case "H": {
        cx = Number(tokens[i]);
        if (!Number.isFinite(cx)) return null;
        verts.push({ x: cx, y: cy });
        i += 1;
        break;
      }
      case "h": {
        const dx = Number(tokens[i]);
        if (!Number.isFinite(dx)) return null;
        cx += dx;
        verts.push({ x: cx, y: cy });
        i += 1;
        break;
      }
      case "V": {
        cy = Number(tokens[i]);
        if (!Number.isFinite(cy)) return null;
        verts.push({ x: cx, y: cy });
        i += 1;
        break;
      }
      case "v": {
        const dy = Number(tokens[i]);
        if (!Number.isFinite(dy)) return null;
        cy += dy;
        verts.push({ x: cx, y: cy });
        i += 1;
        break;
      }
      case "Z":
      case "z":
        // Closing segment — Sutherland-Hodgman treats the polygon as
        // implicitly closed already, so no vertex emit.
        break;
      default:
        return null; // curve command → caller bails out
    }
  }
  // Drop a trailing duplicate of the first vertex (paths often end with a
  // line back to the start before Z). Sutherland-Hodgman closes implicitly.
  if (
    verts.length >= 2 &&
    verts[0].x === verts[verts.length - 1].x &&
    verts[0].y === verts[verts.length - 1].y
  ) {
    verts.pop();
  }
  return verts;
}

function clipPolygonToRect(verts: Vec2[], width: number, height: number): Vec2[] {
  // Clip against the four edges of [0, 0, width, height] in turn.
  let poly = verts;
  // Left edge: x >= 0
  poly = clipAgainstHalfPlane(
    poly,
    (v) => v.x >= 0,
    (a, b) => {
      const t = -a.x / (b.x - a.x);
      return { x: 0, y: a.y + t * (b.y - a.y) };
    },
  );
  // Right edge: x <= width
  poly = clipAgainstHalfPlane(
    poly,
    (v) => v.x <= width,
    (a, b) => {
      const t = (width - a.x) / (b.x - a.x);
      return { x: width, y: a.y + t * (b.y - a.y) };
    },
  );
  // Top edge: y >= 0
  poly = clipAgainstHalfPlane(
    poly,
    (v) => v.y >= 0,
    (a, b) => {
      const t = -a.y / (b.y - a.y);
      return { x: a.x + t * (b.x - a.x), y: 0 };
    },
  );
  // Bottom edge: y <= height
  poly = clipAgainstHalfPlane(
    poly,
    (v) => v.y <= height,
    (a, b) => {
      const t = (height - a.y) / (b.y - a.y);
      return { x: a.x + t * (b.x - a.x), y: height };
    },
  );
  return poly;
}

function clipAgainstHalfPlane(
  verts: Vec2[],
  inside: (v: Vec2) => boolean,
  intersect: (a: Vec2, b: Vec2) => Vec2,
): Vec2[] {
  if (verts.length === 0) return verts;
  const out: Vec2[] = [];
  for (let i = 0; i < verts.length; i++) {
    const a = verts[(i - 1 + verts.length) % verts.length];
    const b = verts[i];
    const aIn = inside(a);
    const bIn = inside(b);
    if (bIn) {
      if (!aIn) out.push(intersect(a, b));
      out.push(b);
    } else if (aIn) {
      out.push(intersect(a, b));
    }
  }
  return out;
}

function verticesToPath(verts: Vec2[]): string {
  if (verts.length === 0) return "";
  const parts: string[] = [];
  parts.push("M", formatNum(verts[0].x), formatNum(verts[0].y));
  for (let i = 1; i < verts.length; i++) {
    parts.push("L", formatNum(verts[i].x), formatNum(verts[i].y));
  }
  parts.push("Z");
  return parts.join(" ");
}

// ── Shape ordering + frame matching ───────────────────────────────────

/**
 * Reading-order sort by gridSpan — must match `rectsToM0`'s
 * `sortShapesReadingOrder` so canonical indices stay aligned.
 */
function sortShapesReadingOrder(shapes: GridShape[]): GridShape[] {
  return [...shapes].sort((a, b) => {
    if (a.gridSpan.yStart !== b.gridSpan.yStart) return a.gridSpan.yStart - b.gridSpan.yStart;
    if (a.gridSpan.xStart !== b.gridSpan.xStart) return a.gridSpan.xStart - b.gridSpan.xStart;
    if (a.gridSpan.yEnd !== b.gridSpan.yEnd) return a.gridSpan.yEnd - b.gridSpan.yEnd;
    if (a.gridSpan.xEnd !== b.gridSpan.xEnd) return a.gridSpan.xEnd - b.gridSpan.xEnd;
    return a.index - b.index;
  });
}

function roundBounds(b: { x: number; y: number; width: number; height: number }): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.round(b.width),
    height: Math.round(b.height),
  };
}

function boundsDistance(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  return (
    Math.abs(a.x - b.x) +
    Math.abs(a.y - b.y) +
    Math.abs(a.width - b.width) +
    Math.abs(a.height - b.height)
  );
}

function stableKeyDepth(stableKey: string): number {
  return stableKey.split("/").length;
}

/**
 * For masked shapes, walk the full editor graph to find the node whose
 * bounds are closest to the matched render frame's bounds. Prefer GROUP
 * nodes (the larger containers) over individual frames, then prefer
 * nearest bounds, then shortest stableKey path. Same heuristic as step 06.
 */
function resolveMaskedOwner(
  anchor: RenderFrame,
  fullNodes: readonly FullGraphNode[],
): FullGraphNode {
  const anchorBounds = roundBounds(anchor);
  const candidates = fullNodes.filter((n) => {
    if (!n.meta?.stableKey) return false;
    return boundsDistance(roundBounds(n), anchorBounds) <= 2;
  });
  if (candidates.length === 0) {
    throw new Error(
      `generateMasks: no full-graph node found near masked anchor ${JSON.stringify(anchorBounds)}`,
    );
  }
  candidates.sort((a, b) => {
    const aGroup = a.kind === "group" ? 0 : 1;
    const bGroup = b.kind === "group" ? 0 : 1;
    if (aGroup !== bGroup) return aGroup - bGroup;
    const distA = boundsDistance(roundBounds(a), anchorBounds);
    const distB = boundsDistance(roundBounds(b), anchorBounds);
    if (distA !== distB) return distA - distB;
    const depthA = stableKeyDepth(a.meta!.stableKey!);
    const depthB = stableKeyDepth(b.meta!.stableKey!);
    if (depthA !== depthB) return depthA - depthB;
    return a.meta!.stableKey!.localeCompare(b.meta!.stableKey!);
  });
  return candidates[0];
}

// ── Public API ────────────────────────────────────────────────────────

function inferCanvasDims(grid: Grid, opts: GenerateMasksOptions): { w: number; h: number } {
  if (opts.canvasW !== undefined && opts.canvasH !== undefined) {
    return { w: opts.canvasW, h: opts.canvasH };
  }
  if (grid.viewBox) {
    return {
      w: Math.round(grid.viewBox.width),
      h: Math.round(grid.viewBox.height),
    };
  }
  const w = Math.round(grid.xLines[grid.xLines.length - 1] - grid.xLines[0]);
  const h = Math.round(grid.yLines[grid.yLines.length - 1] - grid.yLines[0]);
  return { w, h };
}

/**
 * Generate per-source mask entries for the given grid + composed m0.
 *
 * @param grid  An inferred grid carrying the original `geometry.d` per
 *              shape (use `inferGrid(extractGeometry(parseSvg(svg).paths))`).
 * @param m0    The composed `M0String` produced by `rectsToM0(grid, opts)`.
 * @param opts  Optional canvas dim overrides.
 */
export function generateMasks(
  grid: Grid,
  m0: M0String | string,
  opts: GenerateMasksOptions = {},
): MosaicMaskSetFile {
  if (!Array.isArray(grid.shapes) || grid.shapes.length === 0) {
    throw new Error("generateMasks: grid has no shapes");
  }

  const { w: canvasW, h: canvasH } = inferCanvasDims(grid, opts);

  const renderFrames = parseM0StringToRenderFrames(String(m0), canvasW, canvasH) as RenderFrame[];
  const fullNodes = parseM0StringToFullGraph(String(m0), canvasW, canvasH) as FullGraphNode[];

  if (renderFrames.length !== grid.shapes.length) {
    throw new Error(
      `generateMasks: render frame count (${renderFrames.length}) ≠ grid shape count (${grid.shapes.length})`,
    );
  }

  // Canonical ordering — must agree with `rectsToM0`'s reading-order sort.
  const sorted = sortShapesReadingOrder(grid.shapes);

  // Greedy nearest-bounds match between rects (in canonical order) and
  // render frames. Each frame is consumed once.
  const frameUsed = new Array<boolean>(renderFrames.length).fill(false);
  const frameForShape = new Array<number>(sorted.length).fill(-1);
  for (let i = 0; i < sorted.length; i++) {
    const target = roundBounds(sorted[i].snappedBounds as SnappedBounds);
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let j = 0; j < renderFrames.length; j++) {
      if (frameUsed[j]) continue;
      const dist = boundsDistance(roundBounds(renderFrames[j]), target);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = j;
      }
    }
    if (bestIdx < 0 || bestDist > 8) {
      throw new Error(
        `generateMasks: no render frame matches shape "${sorted[i].id}" within tolerance (best L1 = ${bestDist})`,
      );
    }
    frameUsed[bestIdx] = true;
    frameForShape[i] = bestIdx;
  }

  // Build sparse `Array<MaskEntry | null>` of length = sourceCount.
  const masks: (MosaicMaskEntry | null)[] = new Array(sorted.length).fill(null);
  for (let canonicalIndex = 0; canonicalIndex < sorted.length; canonicalIndex++) {
    const shape = sorted[canonicalIndex];
    const frame = renderFrames[frameForShape[canonicalIndex]];
    const masked = isMaskedPath(shape.geometry.d);
    if (!masked) {
      masks[canonicalIndex] = null;
      continue;
    }
    const owner = resolveMaskedOwner(frame, fullNodes);
    const bounds = roundBounds(owner);
    const rawLocalPath = toLocalPath(shape.geometry.d, { x: bounds.x, y: bounds.y });
    // Opt-in clip: the wizard sets `clipToBounds: true` so drift-induced
    // overshoot doesn't produce silhouettes that visibly poke out past
    // their tiles. Off by default so the dictionary build's byte-for-byte
    // parity goldens against the docs step-06 pipeline keep passing.
    const localPath = opts.clipToBounds
      ? clipLocalPathToBounds(rawLocalPath, bounds.width, bounds.height)
      : rawLocalPath;
    masks[canonicalIndex] = { localPath, bounds };
  }

  return { masks };
}
