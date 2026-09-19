/**
 * Layout-match e2e (opt-in) — the automated regression catcher.
 *
 * For EVERY committed `.m0` across all tiers (coreDsl / stdlib / realWorld /
 * brand), render the m0 as a per-cell color map and assert every probe in the
 * sibling `<id>.match` sees its cell's color — i.e. the render places every rect
 * exactly where the geometry says. Font / anti-aliasing / rasterizer changes
 * don't move a flat-color cell interior, so this is cross-platform with a single
 * committed signature (no win32/darwin split, no stored image).
 *
 * This RENDERS (ffmpeg), so it is OPT-IN, gated behind `M0SAIC_LAYOUT_MATCH=1`
 * (run `npm run test:dsl-visual-tests:layout`). Normal `test:dsl-visual-tests`
 * stays fast + ffmpeg-free — its describe name deliberately omits "goldens" so
 * the `--testNamePattern=goldens` filter never renders these.
 *
 * Mint the `.match` files with `M0SAIC_UPDATE_GOLDENS=1 npm run test:dsl-visual-tests`
 * (the harnesses write them alongside each `.m0`).
 */
import * as fs from "fs";
import * as path from "path";
import { parseM0File } from "@m0saic/dsl-file-formats";
import { rewriteDistToSrc } from "./__harness__/singleCopyGolden";
import { isLayoutMatchMode, verifyLayoutMatch } from "./__harness__/layoutMatch";

const SRC = rewriteDistToSrc(path.resolve(__dirname));

/** Every committed `.m0` under any `__goldens__/` in the package (all tiers). */
function findAllGoldenM0(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, inGoldens: boolean) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        walk(full, inGoldens || name === "__goldens__");
      } else if (inGoldens && name.endsWith(".m0") && !name.includes(".__actual__.")) {
        out.push(full);
      }
    }
  };
  walk(root, false);
  return out.sort();
}

const CASES = findAllGoldenM0(SRC).map((m0Path) => ({
  id: path.basename(m0Path, ".m0"),
  rel: path.relative(SRC, m0Path),
  m0Path,
}));

describe("dsl-visual-tests layout match", () => {
  if (!isLayoutMatchMode()) {
    // Skipped in the fast, ffmpeg-free default run.
    test.skip("layout match runs only under M0SAIC_LAYOUT_MATCH=1", () => {});
    return;
  }

  test("corpus is non-empty", () => {
    expect(CASES.length).toBeGreaterThan(0);
  });

  // Each case renders a color map (ffmpeg); dense layouts (100+ cells) need well
  // beyond jest's 5s default, so give every case a generous per-test ceiling.
  test.each(CASES)(
    "$rel renders every rect in place",
    async ({ id, m0Path }) => {
      const parsed = parseM0File(fs.readFileSync(m0Path, "utf8"));
      const m0 = String(parsed.m0);
      const width = parsed.size?.width ?? 1080;
      const height = parsed.size?.height ?? 1080;
      await verifyLayoutMatch(path.dirname(m0Path), id, m0, width, height);
    },
    180_000,
  );
});
