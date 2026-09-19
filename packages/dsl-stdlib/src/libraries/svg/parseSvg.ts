/**
 * Parse an SVG string into `{ paths, viewBox }`.
 *
 * Lifted from `packages/docs/svg-to-mosaic/tools/01-extract-geometry.ts`,
 * plus an extension for `<rect>` elements so callers that emit raw rects
 * (e.g. the `qrcode` npm package via `buildBrandQrV1Svg`) flow through the
 * same pipeline. Rects are converted to synthetic path `d` strings so
 * downstream stages (`extractGeometry`, `inferGrid`, `rectsToM0`) need no
 * special-casing — they only ever see `SvgPath` entries.
 *
 * DOM-less regex parser. Other SVG primitives (`<polygon>`, `<circle>`,
 * `<line>`, `<ellipse>`, ...) are still ignored — preprocess to paths or
 * rects first.
 *
 * Pure, deterministic, no I/O.
 */

import type { ParsedSvg, ShapeStyle, SvgPath, ViewBox } from "./types";

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([:@A-Za-z_][-:.A-Za-z0-9_]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(tag)) !== null) {
    const key = match[1];
    const value = match[3] ?? match[4] ?? "";
    attrs[key] = value;
  }
  return attrs;
}

function parseStyleAttribute(style: string | undefined): Record<string, string> {
  if (!style) return {};
  const out: Record<string, string> = {};
  for (const part of style.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;
    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function resolveStyle(attrs: Record<string, string>): ShapeStyle {
  const styleMap = parseStyleAttribute(attrs.style);
  return {
    fill: attrs.fill ?? styleMap.fill ?? null,
    stroke: attrs.stroke ?? styleMap.stroke ?? null,
    style: attrs.style ?? null,
  };
}

function parseViewBox(svg: string): ViewBox | null {
  const match = svg.match(/<svg\b[^>]*viewBox\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/i);
  if (!match) return null;
  const raw = match[2] ?? match[3] ?? null;
  if (!raw) return null;
  const parts = raw.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || !parts.every((n) => Number.isFinite(n))) return null;
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

type RectGeom = { x: number; y: number; w: number; h: number };

// Convert a <rect> element's attributes into a synthetic path `d` string.
// Down-stream stages only see `SvgPath` entries, so they're agnostic to
// whether the source was a <path> or a <rect>.
function parseRectGeom(attrs: Record<string, string>): RectGeom | null {
  const x = Number(attrs.x ?? "0");
  const y = Number(attrs.y ?? "0");
  const w = Number(attrs.width ?? "");
  const h = Number(attrs.height ?? "");
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

function rectGeomToPathD({ x, y, w, h }: RectGeom): string {
  // Closed axis-aligned rectangle. `svg-path-bounds` handles this trivially.
  return `M${x},${y}H${x + w}V${y + h}H${x}Z`;
}

// Treat a rect that fills ≥99% of the viewBox area as a background plate
// and skip it. Background rects are common in qrcode-emitted SVGs and in
// hand-authored brand SVGs; they would otherwise show up as the largest
// "shape" and break grid inference. The heuristic doesn't apply to <path>
// elements (path bounds aren't a reliable signal — a path can validly
// span the canvas).
function isBackgroundRect(r: RectGeom, viewBox: ViewBox): boolean {
  const rectArea = r.w * r.h;
  const vbArea = viewBox.width * viewBox.height;
  if (vbArea <= 0) return false;
  return rectArea / vbArea >= 0.99;
}

/**
 * Parse an SVG string into its `<path>` and `<rect>` elements and viewBox.
 *
 * `paths` is ordered by source-document order. Each entry retains a `d`
 * attribute (synthetic for rects) and resolved style.
 */
export function parseSvg(svg: string): ParsedSvg {
  if (typeof svg !== "string") {
    throw new Error("parseSvg: input must be a string");
  }

  const viewBox = parseViewBox(svg);
  const paths: SvgPath[] = [];

  // Single regex that captures the tag name + the attribute payload so we
  // preserve document order across mixed <path> / <rect> emitters.
  const tagRegex = /<(path|rect)\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(svg)) !== null) {
    const kind = match[1].toLowerCase();
    const tag = match[0];
    const attrs = parseAttributes(tag);
    if (kind === "path") {
      const d = attrs.d;
      if (!d) continue;
      paths.push({ d, style: resolveStyle(attrs) });
    } else if (kind === "rect") {
      const geom = parseRectGeom(attrs);
      if (!geom) continue;
      if (viewBox && isBackgroundRect(geom, viewBox)) continue;
      paths.push({ d: rectGeomToPathD(geom), style: resolveStyle(attrs) });
    }
  }

  return { paths, viewBox };
}
