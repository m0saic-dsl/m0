import { validatePack } from "./validatePack";
import type { M0Label, StableKey } from "@m0saic/dsl";
import type { M0pFile, M0pVariantEntry } from "../types";

const sk = (s: string) => s as StableKey;
const labelsOf = (entries: Array<[string, M0Label]>) =>
  Object.fromEntries(entries.map(([k, v]) => [k, v])) as Record<StableKey, M0Label>;

function makeVariant(overrides: Partial<M0pVariantEntry> = {}): M0pVariantEntry {
  return {
    meta: null,
    size: { width: 1920, height: 1080 },
    m0: "F",
    labels: null,
    derive: { image: null },
    custom: null,
    ...overrides,
  };
}

function makePack(opts: {
  regions?: M0pFile["regions"];
  variants: M0pFile["variants"];
}): M0pFile {
  return {
    format: "m0p",
    version: 1,
    created: "2026-04-27T00:00:00.000Z",
    app: null,
    appVersion: null,
    meta: null,
    regions: opts.regions ?? null,
    custom: null,
    variants: opts.variants,
  };
}

describe("validatePack", () => {
  it("returns clean result when pack has no regions and no labels", () => {
    const pack = makePack({
      variants: {
        desktop: makeVariant(),
        mobile: makeVariant(),
      },
    });
    const result = validatePack(pack);
    expect(result.hasError).toBe(false);
    expect(result.hasWarning).toBe(false);
    expect(Object.keys(result.perVariant)).toEqual(["desktop", "mobile"]);
    expect(result.perVariant.desktop.regionIssues).toEqual([]);
    expect(result.perVariant.desktop.labelIssues).toEqual([]);
  });

  it("flags missing required regions per variant", () => {
    const pack = makePack({
      regions: { header: {}, cta: {} },
      variants: {
        desktop: makeVariant({
          labels: labelsOf([
            [sk("r/fc0"), { text: "header" }],
            [sk("r/fc1"), { text: "cta" }],
          ]),
        }),
        mobile: makeVariant({
          // missing "cta"
          labels: labelsOf([[sk("r/fc0"), { text: "header" }]]),
        }),
      },
    });
    const result = validatePack(pack);
    expect(result.perVariant.desktop.hasError).toBe(false);
    expect(result.perVariant.mobile.hasError).toBe(true);
    expect(result.perVariant.mobile.regionIssues).toHaveLength(1);
    expect(result.perVariant.mobile.regionIssues[0]).toMatchObject({
      level: "error",
      code: "REGION_MISSING",
      variantKey: "mobile",
      region: "cta",
    });
    expect(result.hasError).toBe(true);
  });

  it("matches region keys against label text case-insensitively (with trim)", () => {
    const pack = makePack({
      regions: { header: {} },
      variants: {
        a: makeVariant({ labels: labelsOf([[sk("r/fc0"), { text: "  Header  " }]]) }),
        b: makeVariant({ labels: labelsOf([[sk("r/fc0"), { text: "HEADER" }]]) }),
      },
    });
    const result = validatePack(pack);
    expect(result.perVariant.a.hasError).toBe(false);
    expect(result.perVariant.b.hasError).toBe(false);
    expect(result.hasError).toBe(false);
  });

  it("warns when two labels resolve to the same region", () => {
    const pack = makePack({
      regions: { header: {} },
      variants: {
        desktop: makeVariant({
          labels: labelsOf([
            [sk("r/fc0"), { text: "header" }],
            [sk("r/fc1"), { text: "Header" }],
          ]),
        }),
      },
    });
    const result = validatePack(pack);
    expect(result.perVariant.desktop.hasError).toBe(false);
    expect(result.perVariant.desktop.hasWarning).toBe(true);
    expect(result.perVariant.desktop.regionIssues).toHaveLength(1);
    expect(result.perVariant.desktop.regionIssues[0]).toMatchObject({
      level: "warning",
      code: "REGION_DUPLICATE",
      variantKey: "desktop",
      region: "header",
    });
    expect(result.perVariant.desktop.regionIssues[0].code === "REGION_DUPLICATE"
      && result.perVariant.desktop.regionIssues[0].stableKeys.sort())
      .toEqual(["r/fc0", "r/fc1"]);
  });

  it("ignores extra labels that don't match any region", () => {
    const pack = makePack({
      regions: { header: {} },
      variants: {
        desktop: makeVariant({
          labels: labelsOf([
            [sk("r/fc0"), { text: "header" }],
            [sk("r/fc1"), { text: "footer" }], // not in regions, not an issue
          ]),
        }),
      },
    });
    const result = validatePack(pack);
    expect(result.perVariant.desktop.hasError).toBe(false);
    expect(result.perVariant.desktop.hasWarning).toBe(false);
  });

  it("uses liveVariantOverride when provided", () => {
    const pack = makePack({
      regions: { header: {} },
      variants: {
        desktop: makeVariant({ labels: null }), // would fail
      },
    });
    const live = makeVariant({
      labels: labelsOf([[sk("r/fc0"), { text: "header" }]]),
    });
    const result = validatePack(pack, {
      liveVariantOverride: { key: "desktop", entry: live },
    });
    expect(result.hasError).toBe(false);
  });

  it("runs label-orphan check via parseCache when supplied", () => {
    const pack = makePack({
      variants: {
        desktop: makeVariant({
          labels: labelsOf([
            [sk("r/fc0"), { text: "kept" }],
            [sk("r/gone"), { text: "orphan" }],
          ]),
        }),
      },
    });
    const cache = new Map<string, ReadonlySet<string>>([
      ["desktop", new Set<string>(["r/fc0"])],
    ]);
    const result = validatePack(pack, { parseCache: cache });
    expect(result.perVariant.desktop.labelIssues).toHaveLength(1);
    expect(result.perVariant.desktop.labelIssues[0]).toMatchObject({
      code: "ORPHANED_LABEL",
      stableKey: "r/gone",
      text: "orphan",
    });
    expect(result.perVariant.desktop.hasWarning).toBe(true);
  });

  it("skips orphan check when parseCache lacks an entry for a variant", () => {
    const pack = makePack({
      variants: {
        desktop: makeVariant({
          labels: labelsOf([[sk("r/anything"), { text: "x" }]]),
        }),
      },
    });
    const result = validatePack(pack, { parseCache: new Map() });
    expect(result.perVariant.desktop.labelIssues).toEqual([]);
    expect(result.perVariant.desktop.hasWarning).toBe(false);
  });

  it("aggregates pack-level hasError/hasWarning across variants", () => {
    const pack = makePack({
      regions: { header: {} },
      variants: {
        a: makeVariant({ labels: labelsOf([[sk("r/fc0"), { text: "header" }]]) }),
        b: makeVariant({ labels: null }), // missing
      },
    });
    const result = validatePack(pack);
    expect(result.hasError).toBe(true);
    expect(result.hasWarning).toBe(false);
    expect(result.perVariant.a.hasError).toBe(false);
    expect(result.perVariant.b.hasError).toBe(true);
  });

  it("ignores empty / whitespace-only label text", () => {
    const pack = makePack({
      regions: { header: {} },
      variants: {
        a: makeVariant({
          labels: labelsOf([
            [sk("r/fc0"), { text: "" }],
            [sk("r/fc1"), { text: "   " }],
          ]),
        }),
      },
    });
    const result = validatePack(pack);
    expect(result.perVariant.a.hasError).toBe(true); // header still missing
    expect(result.perVariant.a.regionIssues).toHaveLength(1);
  });
});
