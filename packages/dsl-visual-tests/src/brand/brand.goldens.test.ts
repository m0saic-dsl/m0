/**
 * Brand-mark goldens.
 *
 * The three canonical m0saic brand-mark layouts, taken straight from
 * `@m0saic/dictionary` (`brand/{m0saic-pattern, m-33, m0}`) — the m0saic
 * pattern, the mosaic M, and the M0 logotype. A top-level tier alongside
 * `coreDsl`, `stdlib`, and `realWorld`.
 *
 * These marks have no insets (the M / M0 carry per-cell masks; the pattern is
 * pure rect geometry), so each `<id>.m0` seed is the raw dictionary m0.
 *
 * Single-copy, platform-independent goldens — see `../__harness__/singleCopyGolden`:
 *   - `<id>.m0`        — the seed + byte-correctness gate.
 *   - `<id>.png`       — the wireframe reference (cell geometry).
 *   - `<id>.still.png` — a SMOKE render: an on-the-fly doc fills every render
 *     frame with one flat brand-orange tile (`#f97316`), each carrying its
 *     per-cell inline-mask for the masked marks (M / M0 — wired the
 *     `@m0saic/brand/logo/v3` way, registry entry + `getSourceOrderStableKeys`;
 *     the pattern is pure rects). A uniform, settled brand-orange rendering of
 *     the real mark — no animation, deterministic.
 *
 * ## Regenerating
 *
 *   # seeds: copy each dictionary entry's m0 (packages/dictionary/src/entries/
 *   #        brand/<entry>/m0saic.m0c → the `m0` field) into __goldens__/<slug>.m0
 *   M0SAIC_UPDATE_GOLDENS=1 npm run test:dsl-visual-tests   # re-mints the wireframes
 *   node .scratch/claude/brand-smoke-stills.mjs             # re-mints the smoke stills
 */
import * as path from "path";
import {
  rewriteDistToSrc,
  discoverSeeds,
  assertSingleCopyGolden,
} from "../__harness__/singleCopyGolden";

const GOLDENS_DIR = rewriteDistToSrc(path.join(__dirname, "__goldens__"));
const CASES = discoverSeeds(GOLDENS_DIR);

describe("brand mark goldens", () => {
  test("corpus is non-empty", () => {
    expect(CASES.length).toBeGreaterThan(0);
  });

  test.each(CASES)("$id is a valid, renderable layout", ({ id, file }) => {
    assertSingleCopyGolden(GOLDENS_DIR, id, file);
  });
});
