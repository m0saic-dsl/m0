/**
 * Single-copy golden harness — shared by the platform-INDEPENDENT visual-test
 * tiers (`realWorld`, `brand`, …), as opposed to the pixel-slotted stdlib /
 * coreDsl harness (`stdlib/__harness__/goldens.ts`).
 *
 * A tier keeps its corpus as committed `<id>.m0` seeds under its own
 * `__goldens__/` (subfolders allowed — discovery recurses). For each seed:
 *
 *   - `<id>.m0`       — the committed seed AND the byte-correctness GATE:
 *                       engine-independent text, verified identically on every
 *                       platform (valid + non-empty layout), git-tracked for
 *                       geometry drift.
 *   - `<id>.png`      — a single wireframe reference (minted in update mode).
 *                       NOT byte-compared — one copy can't match every
 *                       platform's rasterizer; the m0 geometry is the gate.
 *   - `<id>.still.png`— a reference still of the real render (primary cases;
 *                       `__no-inset` twins share the primary's). Minted OUTSIDE
 *                       this harness (per-tier scripts); existence is checked.
 *
 * Verify mode is cross-platform + ffmpeg-free (validity + reference-exists);
 * `M0SAIC_UPDATE_GOLDENS=1` re-mints the wireframe references.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { isValidM0String } from "@m0saic/dsl";
import { queryFrames } from "@m0saic/dsl-stdlib";
import { parseM0File } from "@m0saic/dsl-file-formats";
import { writeMatch } from "./layoutMatch";

/** Point at `src/` even when the compiled test runs from `dist/`. */
export function rewriteDistToSrc(p: string): string {
  const normalized = p.replace(/[\\/]/g, "/");
  return normalized.includes("/dist/")
    ? p.replace(/[\\/]dist[\\/]/, path.sep + "src" + path.sep)
    : p;
}

function shouldUpdate(): boolean {
  return process.env.M0SAIC_UPDATE_GOLDENS === "1";
}

/** Resolve the repo-root linked `m0saic` CLI binary. */
function resolveCliBin(): string {
  const pkgRoot = path.resolve(__dirname, "..", "..", "..", "..");
  const repoBin = path.join(pkgRoot, "node_modules", ".bin", "m0saic");
  if (fs.existsSync(repoBin) || fs.existsSync(repoBin + ".cmd")) return repoBin;
  return "m0saic";
}

/** Render a golden `.m0` to a single-copy wireframe reference PNG. */
function renderWireframeReference(
  m0Path: string,
  width: number,
  height: number,
  outputPath: string,
): void {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "m0-golden-"));
  try {
    // Opaque white canvas — same convention as the stdlib harness.
    const propsPath = path.join(tmpDir, "wireframe-props.json");
    fs.writeFileSync(propsPath, JSON.stringify({ background: "white" }), "utf8");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const bin = resolveCliBin();
    const isWin = process.platform === "win32";
    const args = [
      "make-wireframe",
      "--mfile",
      m0Path,
      "-w",
      String(width),
      "-h",
      String(height),
      "-o",
      outputPath,
      "--props",
      `@${propsPath}`,
      "--format",
      "image",
      "--quiet",
    ];
    const r = spawnSync(bin, args, {
      stdio: "pipe",
      timeout: 120_000,
      windowsHide: true,
      shell: isWin,
    });
    if (r.error) {
      throw new Error(
        `Failed to spawn m0saic CLI: ${r.error.message}\n` +
          `If EACCES/ENOENT, the CLI is not built + linked: ` +
          `(cd packages/cli && npm run build && npm link)`,
      );
    }
    if (r.status !== 0) {
      throw new Error(
        `make-wireframe exited ${r.status}\n${r.stderr?.toString("utf8") ?? ""}`,
      );
    }
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Wireframe render produced no output at ${outputPath}`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export type GoldenCase = { id: string; file: string };

/**
 * Discover a tier's corpus from its committed `<id>.m0` seeds — recursively, so
 * subfolders group related cases. The id is the path relative to `goldensDir`
 * (forward slashes); its `.png` / `.still.png` references are siblings.
 */
export function discoverSeeds(goldensDir: string, rel = ""): GoldenCase[] {
  const dir = rel ? path.join(goldensDir, rel) : goldensDir;
  if (!fs.existsSync(dir)) return [];
  const out: GoldenCase[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    if (fs.statSync(full).isDirectory()) {
      out.push(...discoverSeeds(goldensDir, relPath));
    } else if (name.endsWith(".m0") && !name.includes(".__actual__.")) {
      out.push({ id: relPath.replace(/\.m0$/, ""), file: relPath });
    }
  }
  return rel ? out : out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Assert one single-copy golden case. Throws (failing the test) on any problem.
 * In update mode, (re)mints the wireframe reference instead of verifying it.
 */
export function assertSingleCopyGolden(goldensDir: string, id: string, file: string): void {
  const m0Path = path.join(goldensDir, file);
  const parsed = parseM0File(fs.readFileSync(m0Path, "utf8"));
  const m0 = String(parsed.m0);
  const width = parsed.size?.width ?? 1080;
  const height = parsed.size?.height ?? 1080;

  // The .m0 IS the byte-correctness gate — it must stay a valid, non-empty
  // layout (cross-platform; no rasterizer involved).
  if (!isValidM0String(m0)) throw new Error(`${id}: not a valid m0 string`);
  if (queryFrames(m0, { width, height }).render().length === 0) {
    throw new Error(`${id}: m0 renders no frames at ${width}x${height}`);
  }

  const pngPath = path.join(goldensDir, `${id}.png`);
  if (shouldUpdate()) {
    renderWireframeReference(m0Path, width, height, pngPath);
    // Layout signature for the opt-in color-map e2e (M0SAIC_LAYOUT_MATCH=1).
    writeMatch(goldensDir, id, m0, width, height);
    return;
  }
  // Verify: the single-copy reference wireframe is committed next to the .m0.
  if (!fs.existsSync(pngPath)) {
    throw new Error(
      `${id}: missing wireframe reference ${pngPath} — re-mint with M0SAIC_UPDATE_GOLDENS=1`,
    );
  }
  // The layout signature must be committed too (the color-map e2e gate).
  if (!fs.existsSync(path.join(goldensDir, `${id}.match`))) {
    throw new Error(`${id}: missing layout signature ${id}.match — re-mint with M0SAIC_UPDATE_GOLDENS=1`);
  }
  // Primary cases also carry a still of the real render; `__no-inset` twins are
  // layout variants that share the primary's still.
  if (!id.endsWith("__no-inset")) {
    const stillPath = path.join(goldensDir, `${id}.still.png`);
    if (!fs.existsSync(stillPath)) {
      throw new Error(`${id}: missing still reference ${stillPath}`);
    }
  }
}
