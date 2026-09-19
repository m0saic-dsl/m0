/**
 * Real-world flattened-template goldens.
 *
 * Seeds the DSL visual suite with the FLATTENED+INSET m0 of real templates —
 * the third `--save-m0` sidecar (`<base>.flattened.inset.m0`), which bakes each
 * source's render-time `placement.inset` back into the base geometry. This
 * tracks complex PRODUCTION layouts (donut soups, gutter grids, treemaps,
 * masonry sheets, dashboard compositions) for byte-correctness, alongside the
 * hand-written core-DSL, stdlib-generator, and brand-mark cases.
 *
 * Single-copy, platform-independent goldens — see `../__harness__/singleCopyGolden`.
 *
 * ## Regenerating
 *
 * Each `<id>.m0` seed is a template's third save-m0 sidecar. Refresh one by
 * rendering the template and copying its baked layout:
 *
 *   m0saic make @m0saic/<pack>/<slug>/<vN> -w W -h H -o out.mp4 \
 *     --save-m0 --validate-only        # validate-only writes the sidecars, no ffmpeg
 *   # → copy out.flattened.inset.m0's payload into __goldens__/real__<slug>.m0
 *
 * Then re-mint the wireframe references:
 *
 *   M0SAIC_UPDATE_GOLDENS=1 npm run test:dsl-visual-tests
 *
 * The mid-end `<id>.still.png` references are minted separately by rendering
 * each template to a video and extracting a frame at ~92% of its duration
 * (`ffmpeg -ss 0.92·dur -i out.mp4 -frames:v 1`); still-only templates render
 * the frame directly.
 */
import * as path from "path";
import {
  rewriteDistToSrc,
  discoverSeeds,
  assertSingleCopyGolden,
} from "../__harness__/singleCopyGolden";

const GOLDENS_DIR = rewriteDistToSrc(path.join(__dirname, "__goldens__"));
const CASES = discoverSeeds(GOLDENS_DIR);

describe("real-world template goldens", () => {
  test("corpus is non-empty", () => {
    expect(CASES.length).toBeGreaterThan(0);
  });

  test.each(CASES)("$id is a valid, renderable layout", ({ id, file }) => {
    assertSingleCopyGolden(GOLDENS_DIR, id, file);
  });
});
