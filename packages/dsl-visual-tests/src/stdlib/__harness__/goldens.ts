/**
 * DSL-local golden PNG + .m0 harness for @m0saic/dsl-visual-tests.
 *
 * Renders m0 strings to wireframe PNGs via the `m0saic make-wireframe`
 * CLI and compares them byte-for-byte against committed golden PNGs.
 * Additionally, writes a sibling `.m0` file for each golden that captures
 * the exact canonical layout string with deterministic metadata.
 *
 * ## Modes (controlled by env var)
 *
 *   M0SAIC_UPDATE_GOLDENS=1  →  Generate / overwrite goldens.
 *                                Both the PNG and the sibling .m0 are written
 *                                directly to the __goldens__ directory.
 *                                Tests pass silently.
 *
 *   (unset / default)         →  Verify mode.
 *                                Renders to a temp file, byte-compares against
 *                                the golden PNG. On mismatch an __actual__ PNG
 *                                is saved next to the golden and the test throws
 *                                with both paths for easy visual diffing.
 *                                Also verifies the sibling .m0 matches exactly.
 *                                On missing .m0: creates it and fails.
 *                                On .m0 mismatch: writes .__actual__.m0 and fails.
 *
 * ## Verbose output
 *
 *   M0SAIC_GOLDEN_VERBOSE=1   →  Print progress logs and stream CLI output.
 *
 * ## How to run
 *
 *   # Verify (CI / normal):
 *   npm test -- --testPathPattern dsl-visual-tests
 *
 *   # Update goldens after an intentional change:
 *   M0SAIC_UPDATE_GOLDENS=1 npm test -- --testPathPattern dsl-visual-tests
 *
 * ## Toolchain pinning
 *
 * Golden PNGs are byte-exact comparisons. They are tied to a specific
 * rendering toolchain (ffmpeg version, OS graphics stack). The
 * `_toolchain.json` sidecar in each `__goldens__` directory records the
 * exact versions used to generate the committed goldens.
 *
 * If your local toolchain differs (e.g., different ffmpeg version, different
 * OS), goldens may fail due to pixel-level rendering differences — not DSL
 * regressions. In that case:
 *
 *   1. Regenerate: `M0SAIC_UPDATE_GOLDENS=1 npm test -- ...`
 *   2. Visually inspect the diff to confirm it's toolchain noise, not a bug
 *   3. Do NOT commit regenerated goldens unless CI uses the same toolchain
 *
 * DSL geometry correctness (rectangles, positions, sizes) is tested
 * independently by `@m0saic/dsl`'s unit tests. Visual goldens test the
 * rendered output, which depends on the full rendering pipeline.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";
import { serializeM0File } from "@m0saic/dsl-file-formats";
// writeToolchainSidecar writes diagnostic _toolchain.json metadata.
// In the standalone DSL repo it's a no-op — the full implementation
// lives in @m0saic/platform (not a public dependency).
function writeToolchainSidecar(_dir: string): void {}

/** Fixed epoch for deterministic .m0 file headers in tests. */
const DETERMINISTIC_DATE = new Date("2026-04-15T00:00:00.000Z");

function isVerbose(): boolean {
  return process.env.M0SAIC_GOLDEN_VERBOSE === "1";
}

function log(msg: string): void {
  if (!isVerbose()) return;
  // Jest captures console output; that's fine—this is explicitly opt-in.
  // Prefix so it's easy to spot in noisy runs.
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
  // Walk up from the package root to the repo root's node_modules/.bin
  const pkgRoot = path.resolve(__dirname, "..", "..", "..", "..");
  const repoBin = path.join(pkgRoot, "node_modules", ".bin", "m0saic");
  if (fs.existsSync(repoBin) || fs.existsSync(repoBin + ".cmd")) return repoBin;

  // Fallback: assume globally installed
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
 * Render a m0 string to a wireframe PNG and compare against a golden.
 * Also writes / verifies a sibling `.m0` golden file.
 *
 * Always uses `--mfile` to avoid shell quoting issues.
 * Uses `shell: true` on Windows so that `.cmd` wrappers resolve correctly.
 */
export function assertWireframeGolden(opts: WireframeGoldenOpts): void {
  const { id, width, height } = opts;
  const update = shouldUpdate();

  const goldensDir = opts.goldensDir
    ? rewriteDistToSrc(opts.goldensDir)
    : DEFAULT_GOLDENS_DIR;

  const goldenPngPath = path.join(goldensDir, `${id}.png`);
  const goldenM0Path = path.join(goldensDir, `${id}.m0`);

  writeToolchainSidecar(goldensDir);

  log(`id="${id}" mode=${update ? "update" : "verify"} size=${width}x${height}`);
  log(`goldensDir=${goldensDir}`);
  log(`goldenPngPath=${goldenPngPath}`);

  // Build deterministic .m0 content (used for both temp CLI input and golden)
  const m0Content = buildM0Content(opts);

  // Write m0 string to a temp .m0 file via DSL serializer
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "m0saic-golden-"));
  const mfilePath = path.join(tmpDir, `${id}.m0`);

  fs.writeFileSync(mfilePath, m0Content, "utf8");
  log(`wrote mfile=${mfilePath}`);

  // Determine where to render
  const outputPath = update ? goldenPngPath : path.join(tmpDir, `${id}.png`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  log(`outputPath=${outputPath}`);

  // Invoke m0saic make-wireframe
  const bin = resolveCliBin();
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
    "--format",
    "image",
    "--quiet",
  ];

  log(`spawn: ${bin} ${args.join(" ")}`);

  const isWin = process.platform === "win32";
  const verbose = isVerbose();

  const result = spawnSync(bin, args, {
    // In verbose mode, stream CLI output live so you see progress / ffmpeg logs.
    // Otherwise, capture output to attach on errors.
    stdio: verbose ? "inherit" : "pipe",
    timeout: 60_000,
    windowsHide: true,
    shell: isWin,
  });

  // Clean up temp .m0 file
  try {
    fs.unlinkSync(mfilePath);
  } catch {
    /* ignore */
  }

  if (result.error) {
    cleanup(tmpDir);
    throw new Error(
      `Failed to spawn m0saic CLI: ${result.error.message}\n` +
        `  binary: ${bin}\n` +
        `  args: ${args.join(" ")}`
    );
  }

  if (result.status !== 0) {
    // If verbose=true, output was already streamed. Still provide best-effort details.
    const stderr = !verbose ? result.stderr?.toString("utf8") ?? "" : "";
    const stdout = !verbose ? result.stdout?.toString("utf8") ?? "" : "";
    cleanup(tmpDir);
    throw new Error(
      `m0saic make-wireframe exited with code ${result.status}\n` +
        (stderr ? `  stderr: ${stderr}\n` : "") +
        (stdout ? `  stdout: ${stdout}\n` : "") +
        (!stderr && !stdout && verbose
          ? `  (output was streamed; re-run without M0SAIC_GOLDEN_VERBOSE=1 to capture logs)\n`
          : "")
    );
  }

  if (!fs.existsSync(outputPath)) {
    cleanup(tmpDir);
    throw new Error(`Wireframe render produced no output at ${outputPath}`);
  }

  // -------------------------------------------------------------------
  // Update mode — write both PNG and .m0 golden
  // -------------------------------------------------------------------
  if (update) {
    fs.mkdirSync(path.dirname(goldenM0Path), { recursive: true });
    fs.writeFileSync(goldenM0Path, m0Content, "utf8");
    log(`updated golden PNG: ${goldenPngPath}`);
    log(`updated golden .m0: ${goldenM0Path}`);
    cleanup(tmpDir);
    return;
  }

  // -------------------------------------------------------------------
  // Verify mode — PNG
  // -------------------------------------------------------------------
  if (!fs.existsSync(goldenPngPath)) {
    fs.mkdirSync(path.dirname(goldenPngPath), { recursive: true });
    fs.copyFileSync(outputPath, goldenPngPath);
    // Also create the .m0 alongside
    fs.writeFileSync(goldenM0Path, m0Content, "utf8");
    cleanup(tmpDir);
    throw new Error(
      `Golden created at ${goldenPngPath}.\n` +
        `Sibling .m0 created at ${goldenM0Path}.\n` +
        `Please inspect and re-run tests.`
    );
  }

  const actualPngBytes = fs.readFileSync(outputPath);
  const expectedPngBytes = fs.readFileSync(goldenPngPath);

  if (!actualPngBytes.equals(expectedPngBytes)) {
    // Mismatch — save actual next to golden for easy visual diff
    const actualDebugPath = path.join(goldensDir, `${id}.__actual__.png`);
    fs.copyFileSync(outputPath, actualDebugPath);
    cleanup(tmpDir);
    throw new Error(
      `Wireframe golden mismatch for "${id}".\n` +
        `  Expected: ${goldenPngPath}\n` +
        `  Actual:   ${actualDebugPath}\n` +
        `Compare visually and run with M0SAIC_UPDATE_GOLDENS=1 to update.`
    );
  }

  log(`PNG match ✓ ${id}`);

  // -------------------------------------------------------------------
  // Verify mode — .m0 sibling
  // -------------------------------------------------------------------
  if (!fs.existsSync(goldenM0Path)) {
    fs.writeFileSync(goldenM0Path, m0Content, "utf8");
    cleanup(tmpDir);
    throw new Error(
      `Sibling .m0 golden was missing — created at ${goldenM0Path}.\n` +
        `Please inspect and re-run tests.`
    );
  }

  const actualM0 = m0Content;
  const expectedM0 = fs.readFileSync(goldenM0Path, "utf8");

  if (actualM0 !== expectedM0) {
    const actualM0DebugPath = path.join(goldensDir, `${id}.__actual__.m0`);
    fs.writeFileSync(actualM0DebugPath, actualM0, "utf8");
    cleanup(tmpDir);
    throw new Error(
      `.m0 golden mismatch for "${id}".\n` +
        `  Expected: ${goldenM0Path}\n` +
        `  Actual:   ${actualM0DebugPath}\n` +
        `Diff the files and run with M0SAIC_UPDATE_GOLDENS=1 to update.`
    );
  }

  log(`.m0 match ✓ ${id}`);
  cleanup(tmpDir);
}

function cleanup(tmpDir: string): void {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
