/**
 * DSL-local golden harness for @m0saic/dsl-visual-tests (stdlib + coreDsl tiers).
 *
 * ## Single-copy, platform-INDEPENDENT (founder ruling 2026-07-20)
 *
 * This package is about LOOK, not bytes — so it is NOT dual-platform. Each case
 * commits two files side by side in `__goldens__/`:
 *
 *   - `<id>.m0`  — the canonical layout string with deterministic metadata. This
 *     is the byte-correctness GATE: engine-independent text, byte-compared and
 *     identical on every platform.
 *   - `<id>.png` — a single wireframe reference for visual inspection, minted in
 *     update mode. It is NOT byte-compared (one copy can't match every
 *     platform's rasterizer); it is reviewed by eye in PR diffs. The realWorld /
 *     brand tiers use the same model via `../../__harness__/singleCopyGolden`.
 *
 * The OTHER visual suites — core `__tests__/*.spec.ts` and the dictionary
 * visual-tests — stay dual-platform + byte-exact (they are about bytes) and are
 * unaffected by this harness.
 *
 * ## Modes (env var)
 *
 *   M0SAIC_UPDATE_GOLDENS=1  →  Update: render the wireframe PNG + write the
 *                                sibling `.m0`, both directly into `__goldens__/`.
 *   (unset)                   →  Verify: byte-compare the `.m0` (the gate) and
 *                                assert the reference PNG exists. Cross-platform
 *                                and ffmpeg-free — no render, no toolchain pin.
 *
 *   M0SAIC_GOLDEN_VERBOSE=1   →  Print progress logs and stream CLI output.
 *
 * ## How to run
 *
 *   npm test -- --testPathPatterns dsl-visual-tests                       # verify
 *   M0SAIC_UPDATE_GOLDENS=1 npm test -- --testPathPatterns dsl-visual-tests  # mint
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";
import { serializeM0File } from "@m0saic/dsl-file-formats";
import { writeMatch } from "../../__harness__/layoutMatch";

/**
 * Temp-dir prefix shared by every m0saic tool (`[m0saic]_<descriptor>-`), so
 * the desktop's temp-cleanup sweep recognizes harness scratch dirs. Kept
 * local: this package must not depend on the private platform package.
 */
const M0SAIC_TMP_PREFIX = "[m0saic]_";
function makeM0saicTempPrefix(descriptor: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(descriptor)) {
    throw new Error(
      `makeM0saicTempPrefix: descriptor must match /^[A-Za-z0-9][A-Za-z0-9_-]*$/, got ${JSON.stringify(descriptor)}`,
    );
  }
  return `${M0SAIC_TMP_PREFIX}${descriptor}-`;
}

/** Fixed epoch for deterministic .m0 file headers in tests. */
const DETERMINISTIC_DATE = new Date("2026-04-15T00:00:00.000Z");

function isVerbose(): boolean {
  return process.env.M0SAIC_GOLDEN_VERBOSE === "1";
}

function log(msg: string): void {
  if (!isVerbose()) return;
  console.log(`[m0saic-golden] ${msg}`);
}

/**
 * Rewrite a path so it points into `src/` even when running from `dist/`.
 * This ensures goldens are always read/written in the source tree.
 */
function rewriteDistToSrc(p: string): string {
  const normalized = p.replace(/[\\/]/g, "/");
  if (normalized.includes("/dist/")) {
    return p.replace(/[\\/]dist[\\/]/, path.sep + "src" + path.sep);
  }
  return p;
}

/**
 * Default goldens directory — only used when callers don't supply their own.
 * Points at the legacy shared `__goldens__` folder next to `__harness__`.
 */
function resolveDefaultGoldensDir(): string {
  return rewriteDistToSrc(path.resolve(__dirname, "..", "__goldens__"));
}

const DEFAULT_GOLDENS_DIR = resolveDefaultGoldensDir();

function shouldUpdate(): boolean {
  return process.env.M0SAIC_UPDATE_GOLDENS === "1";
}

/**
 * Resolve the m0saic CLI binary. Prefer the locally-linked package.
 */
function resolveCliBin(): string {
  const pkgRoot = path.resolve(__dirname, "..", "..", "..", "..");
  const repoBin = path.join(pkgRoot, "node_modules", ".bin", "m0saic");
  if (fs.existsSync(repoBin) || fs.existsSync(repoBin + ".cmd")) return repoBin;
  return "m0saic";
}

export type WireframeGoldenOpts = {
  /** Deterministic name for the golden file (without extension). */
  id: string;
  /** The m0 string to render. */
  m0: string;
  /** Output width in pixels. */
  width: number;
  /** Output height in pixels. */
  height: number;
  /**
   * Override the goldens directory. When provided, goldens are read/written
   * here instead of the default shared `__goldens__` folder.
   *
   * Callers typically pass `path.join(__dirname, "__goldens__")`.
   * The dist/ → src/ rewrite is applied automatically.
   */
  goldensDir?: string;
};

/**
 * Produce the deterministic .m0 file content for a golden.
 */
function buildM0Content(opts: WireframeGoldenOpts): string {
  return serializeM0File({
    m0: opts.m0,
    size: { width: opts.width, height: opts.height },
    created: DETERMINISTIC_DATE,
    app: "m0saic-golden-harness",
  });
}

/**
 * Render an m0 to a single-copy wireframe reference PNG via the `m0saic`
 * make-wireframe CLI. Used only in update mode. No pinned toolchain — the PNG
 * is a visual reference, not a byte-exact golden, so any resolved ffmpeg is fine.
 * Always uses `--mfile` to avoid shell quoting; `shell: true` on Windows so
 * `.cmd` wrappers resolve.
 */
function renderWireframeReference(
  id: string,
  m0Content: string,
  width: number,
  height: number,
  outputPath: string,
): void {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), makeM0saicTempPrefix("golden")));
  try {
    const mfilePath = path.join(tmpDir, `${id}.m0`);
    fs.writeFileSync(mfilePath, m0Content, "utf8");

    // Goldens render with an opaque WHITE canvas (founder ruling 2026-07-19):
    // reviewable images instead of transparent ink-only. Passed as a props FILE
    // via readJsonArg's `@path` syntax — inline JSON breaks under Windows shell.
    const propsPath = path.join(tmpDir, "wireframe-props.json");
    fs.writeFileSync(propsPath, JSON.stringify({ background: "white" }), "utf8");

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const bin = resolveCliBin();
    const isWin = process.platform === "win32";
    const verbose = isVerbose();
    const args = [
      "make-wireframe",
      "--mfile",
      mfilePath,
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
    log(`spawn: ${bin} ${args.join(" ")}`);

    const result = spawnSync(bin, args, {
      stdio: verbose ? "inherit" : "pipe",
      timeout: 60_000,
      windowsHide: true,
      shell: isWin,
    });

    if (result.error) {
      throw new Error(
        `Failed to spawn m0saic CLI: ${result.error.message}\n` +
          `  binary: ${bin}\n` +
          `If this is EACCES/ENOENT, the CLI is not built + linked: ` +
          `(cd packages/cli && npm run build && npm link)`,
      );
    }
    if (result.status !== 0) {
      const stderr = !verbose ? result.stderr?.toString("utf8") ?? "" : "";
      const stdout = !verbose ? result.stdout?.toString("utf8") ?? "" : "";
      throw new Error(
        `m0saic make-wireframe exited with code ${result.status}\n` +
          (stderr ? `  stderr: ${stderr}\n` : "") +
          (stdout ? `  stdout: ${stdout}\n` : ""),
      );
    }
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Wireframe render produced no output at ${outputPath}`);
    }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Single-copy golden for an m0 string: mint / verify a `<id>.m0` (the gate) and
 * a `<id>.png` wireframe reference, side by side in `goldensDir`.
 */
export function assertWireframeGolden(opts: WireframeGoldenOpts): void {
  const { id, width, height } = opts;
  const update = shouldUpdate();

  const goldensDir = opts.goldensDir
    ? rewriteDistToSrc(opts.goldensDir)
    : DEFAULT_GOLDENS_DIR;

  const goldenPngPath = path.join(goldensDir, `${id}.png`);
  const goldenM0Path = path.join(goldensDir, `${id}.m0`);
  const m0Content = buildM0Content(opts);

  log(`id="${id}" mode=${update ? "update" : "verify"} size=${width}x${height}`);

  // -------------------------------------------------------------------
  // Update mode — render the reference PNG + write the .m0
  // -------------------------------------------------------------------
  if (update) {
    renderWireframeReference(id, m0Content, width, height, goldenPngPath);
    fs.mkdirSync(path.dirname(goldenM0Path), { recursive: true });
    fs.writeFileSync(goldenM0Path, m0Content, "utf8");
    // Layout signature for the opt-in color-map e2e (M0SAIC_LAYOUT_MATCH=1).
    writeMatch(goldensDir, id, opts.m0, width, height);
    log(`updated golden PNG: ${goldenPngPath}`);
    log(`updated golden .m0: ${goldenM0Path}`);
    return;
  }

  // -------------------------------------------------------------------
  // Verify mode — the .m0 is the byte-correctness gate (cross-platform)
  // -------------------------------------------------------------------
  if (!fs.existsSync(goldenM0Path)) {
    fs.mkdirSync(path.dirname(goldenM0Path), { recursive: true });
    fs.writeFileSync(goldenM0Path, m0Content, "utf8");
    throw new Error(
      `Sibling .m0 golden was missing — created at ${goldenM0Path}.\n` +
        `Please inspect and re-run tests.`,
    );
  }
  const expectedM0 = fs.readFileSync(goldenM0Path, "utf8");
  if (m0Content !== expectedM0) {
    const actualM0DebugPath = path.join(goldensDir, `${id}.__actual__.m0`);
    fs.writeFileSync(actualM0DebugPath, m0Content, "utf8");
    throw new Error(
      `.m0 golden mismatch for "${id}".\n` +
        `  Expected: ${goldenM0Path}\n` +
        `  Actual:   ${actualM0DebugPath}\n` +
        `Diff the files and run with M0SAIC_UPDATE_GOLDENS=1 to update.`,
    );
  }
  log(`.m0 match ✓ ${id}`);

  // The single-copy wireframe reference must be committed next to the .m0.
  if (!fs.existsSync(goldenPngPath)) {
    throw new Error(
      `Missing wireframe reference: ${goldenPngPath}\n` +
        `Re-mint with M0SAIC_UPDATE_GOLDENS=1, review the image, and commit.`,
    );
  }
  // The layout signature must be committed too (the color-map e2e gate).
  if (!fs.existsSync(path.join(goldensDir, `${id}.match`))) {
    throw new Error(
      `Missing layout signature: ${path.join(goldensDir, `${id}.match`)}\n` +
        `Re-mint with M0SAIC_UPDATE_GOLDENS=1.`,
    );
  }
  log(`PNG + .match reference present ✓ ${id}`);
}
