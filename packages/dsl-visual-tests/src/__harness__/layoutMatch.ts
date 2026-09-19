/**
 * Layout-match — a font/AA-tolerant, cross-platform e2e layout check.
 *
 * Byte goldens are the wrong tool for this package: a font or anti-aliasing
 * change repaints thousands of pixels while the LAYOUT is unchanged. What
 * matters is that every declared rect renders WHERE IT SHOULD IN SPACE. This
 * verifies exactly that, with no stored image and no win32/darwin duplication:
 *
 *   1. Parse the m0 → render frames; assign each a UNIQUE flat color by
 *      logical index (`layoutColor`).
 *   2. Render the m0 with those per-cell fills → a "color map" of the layout.
 *   3. Sample an anchored PROBE point in each visible cell's interior (skipping
 *      edges, so AA never bites) and assert the pixel is the cell's color.
 *
 * The probes + expected colors are derived from the m0 and frozen into a
 * committed `<id>.match` file. If the render places a rect anywhere but where
 * the geometry says, some probe sees the wrong color → caught. Fonts / AA /
 * rasterizer differences don't move a flat-color cell INTERIOR, so a single
 * `.match` verifies identically on every platform.
 *
 * This RENDERS (ffmpeg), so it is an opt-in / release gate (`M0SAIC_LAYOUT_MATCH=1`),
 * separate from the fast, ffmpeg-free `.m0`-gate verify.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { queryFrames } from "@m0saic/dsl-stdlib";

/**
 * A probe must sit at least this many px clear of EVERY cell edge — its own and
 * any overlay cutting through it. That buffer absorbs the ≤1px disagreement
 * between the rounded-int geometry here and the engine's float→pixel placement
 * (a boundary rounding is rasterizer-level, not a layout error), plus edge AA.
 */
const PROBE_MARGIN = 4;
/** Min cell dimension (px) to hold a margin-buffered probe. Smaller cells skip. */
const MIN_PROBE_DIM = 2 * PROBE_MARGIN + 2;
/** Per-channel tolerance — deep-interior samples are exact; this only guards codec micro-shift. */
const COLOR_TOLERANCE = 24;

type SharpFactory = (input: string) => {
  raw(): { toBuffer(opts: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }> };
};

/**
 * `sharp` is only needed on the render path (`M0SAIC_LAYOUT_MATCH=1` /
 * update mode), so it is a devDependency loaded lazily — importing this
 * module must never require a native binary.
 */
function loadSharp(): SharpFactory {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("sharp") as SharpFactory | { default: SharpFactory };
    return (typeof mod === "function" ? mod : mod.default) as SharpFactory;
  } catch (err) {
    throw new Error(
      "layout-match needs the optional devDependency \"sharp\" to read rendered PNGs " +
        "(npm i -D sharp). " + (err instanceof Error ? err.message : String(err)),
    );
  }
}

export type Probe = { x: number; y: number; c: string };
export type MatchFile = { v: 1; width: number; height: number; probes: Probe[] };

// ── Deterministic distinct palette (golden-angle HSV → RGB) ──────────────────

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/** A unique, non-white flat color for the cell at this logical index. */
export function layoutColor(index: number): { r: number; g: number; b: number } {
  return hsvToRgb(index * 137.508, 0.66, 0.9);
}

const toHex = (c: { r: number; g: number; b: number }): string =>
  [c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, "0")).join("");

// ── Probes (from the m0 geometry) ────────────────────────────────────────────

type Rect = { x: number; y: number; w: number; h: number; li: number };

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Does rect `r` come within `m` px of the point (touch its margin box)? */
function nearPoint(r: Rect, px: number, py: number, m: number): boolean {
  return px >= r.x - m && px < r.x + r.w + m && py >= r.y - m && py < r.y + r.h + m;
}

/**
 * One probe per VISIBLE, big-enough cell: a point in the cell's interior that is
 * ≥ PROBE_MARGIN clear of its own edges AND of every overlay that could cover it.
 * Such a point renders the cell's flat color exactly and survives ≤1px boundary
 * rounding. Frames arrive base→top, so "later" (higher index) = painted on top.
 */
export function computeProbes(m0: string, width: number, height: number): MatchFile {
  const frames = queryFrames(m0, { width, height }).render();
  const rects: Rect[] = frames.map((f) => ({
    x: Math.max(0, Math.round(f.x)),
    y: Math.max(0, Math.round(f.y)),
    w: Math.max(1, Math.round(f.width)),
    h: Math.max(1, Math.round(f.height)),
    li: f.logicalIndex,
  }));

  const probes: Probe[] = [];
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r.w < MIN_PROBE_DIM || r.h < MIN_PROBE_DIM) continue; // no room for a buffered probe

    // Overlays that could cover this cell (later paint order + geometric overlap).
    const covers = rects.slice(i + 1).filter((c) => rectsOverlap(c, r));

    // Core = the cell inset by PROBE_MARGIN (clear of its own edges + abutting
    // non-overlapping neighbours, whose shared edge is this cell's edge).
    const cx0 = r.x + PROBE_MARGIN, cy0 = r.y + PROBE_MARGIN;
    const cw = r.w - 2 * PROBE_MARGIN, ch = r.h - 2 * PROBE_MARGIN;

    // Candidate grid over the core, centre first (7×7), so we prefer the centre
    // and only walk outward to dodge an overlay edge cutting through the cell.
    const N = 7;
    const order = [3, 2, 4, 1, 5, 0, 6]; // centre-out indices into 0..6
    let chosen: [number, number] | null = null;
    outer: for (const gi of order) {
      for (const gj of order) {
        const px = cx0 + Math.round((cw * gi) / (N - 1));
        const py = cy0 + Math.round((ch * gj) / (N - 1));
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        // Must be ≥ PROBE_MARGIN clear of every overlay (subsumes "uncovered").
        if (covers.some((c) => nearPoint(c, px, py, PROBE_MARGIN))) continue;
        chosen = [px, py];
        break outer;
      }
    }
    if (chosen) probes.push({ x: chosen[0], y: chosen[1], c: toHex(layoutColor(r.li)) });
  }
  return { v: 1, width, height, probes };
}

// ── Color-map render (each cell filled with its layoutColor) ─────────────────

function resolveCliBin(): string {
  const pkgRoot = path.resolve(__dirname, "..", "..", "..", "..");
  const repoBin = path.join(pkgRoot, "node_modules", ".bin", "m0saic");
  if (fs.existsSync(repoBin) || fs.existsSync(repoBin + ".cmd")) return repoBin;
  return "m0saic";
}

/** Render the m0 with one flat `layoutColor` per logical index → PNG. */
function renderColorMap(m0: string, width: number, height: number, outPath: string): void {
  const frames = queryFrames(m0, { width, height }).render();
  const nSources = frames.reduce((m, f) => Math.max(m, f.logicalIndex + 1), 0);
  const sources = Array.from({ length: nSources }, (_, i) => {
    const c = layoutColor(i);
    return { type: "lavfi" as const, color: `#${toHex(c)}` };
  });
  const doc = { kind: "mosaic_document", version: 1, m0, assets: {}, sources };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "m0-layout-"));
  try {
    const docPath = path.join(tmpDir, "colormap.mosaic");
    fs.writeFileSync(docPath, JSON.stringify(doc), "utf8");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const isWin = process.platform === "win32";
    const r = spawnSync(
      resolveCliBin(),
      ["make", docPath, "-w", String(width), "-h", String(height), "-o", outPath, "--quiet"],
      { stdio: "pipe", timeout: 120_000, windowsHide: true, shell: isWin },
    );
    if (r.error) throw new Error(`layout render: spawn m0saic failed: ${r.error.message}`);
    if (r.status !== 0) throw new Error(`layout render: make exited ${r.status}\n${r.stderr?.toString("utf8") ?? ""}`);
    if (!fs.existsSync(outPath)) throw new Error(`layout render: no output at ${outPath}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── Sample + compare ─────────────────────────────────────────────────────────

async function sampleMismatches(pngPath: string, probes: Probe[]): Promise<string[]> {
  const { data, info } = await loadSharp()(pngPath).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const fails: string[] = [];
  for (const p of probes) {
    if (p.x >= info.width || p.y >= info.height) {
      fails.push(`(${p.x},${p.y}) out of rendered bounds ${info.width}x${info.height}`);
      continue;
    }
    const o = (p.y * info.width + p.x) * ch;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const exp = p.c;
    const er = parseInt(exp.slice(0, 2), 16), eg = parseInt(exp.slice(2, 4), 16), eb = parseInt(exp.slice(4, 6), 16);
    if (Math.abs(r - er) > COLOR_TOLERANCE || Math.abs(g - eg) > COLOR_TOLERANCE || Math.abs(b - eb) > COLOR_TOLERANCE) {
      fails.push(`(${p.x},${p.y}) expected #${exp} got #${toHex({ r, g, b })}`);
    }
  }
  return fails;
}

// ── Public: mint / verify a case's `.match` ─────────────────────────────────

export function isLayoutMatchMode(): boolean {
  return process.env.M0SAIC_LAYOUT_MATCH === "1";
}

/** Write (mint) the `<id>.match` for a case — pure geometry, no render. */
export function writeMatch(goldensDir: string, id: string, m0: string, width: number, height: number): void {
  const matchPath = path.join(goldensDir, `${id}.match`);
  fs.mkdirSync(path.dirname(matchPath), { recursive: true });
  fs.writeFileSync(matchPath, JSON.stringify(computeProbes(m0, width, height), null, 0) + "\n", "utf8");
}

/**
 * Verify a case's layout by rendering the color map and sampling its committed
 * `<id>.match` probes. Async; throws on any mismatch. Only call under
 * `isLayoutMatchMode()`.
 */
export async function verifyLayoutMatch(
  goldensDir: string,
  id: string,
  m0: string,
  width: number,
  height: number,
): Promise<void> {
  const matchPath = path.join(goldensDir, `${id}.match`);
  if (!fs.existsSync(matchPath)) {
    throw new Error(`${id}: missing ${matchPath} — mint with M0SAIC_UPDATE_GOLDENS=1`);
  }
  const match: MatchFile = JSON.parse(fs.readFileSync(matchPath, "utf8"));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "m0-layout-out-"));
  try {
    const pngPath = path.join(tmpDir, `${path.basename(id)}.png`);
    renderColorMap(m0, width, height, pngPath);
    const fails = await sampleMismatches(pngPath, match.probes);
    if (fails.length > 0) {
      throw new Error(
        `${id}: layout mismatch at ${fails.length}/${match.probes.length} probe(s) — ` +
          `rects are not where the geometry says. Sample:\n  ${fails.slice(0, 6).join("\n  ")}`,
      );
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
