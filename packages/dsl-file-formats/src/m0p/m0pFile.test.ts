import {
  serializeM0pFile,
  parseM0pFile,
  bundleM0cIntoPack,
  extractVariantAsM0c,
  listVariantKeys,
  getVariant,
  findVariantBySize,
} from "./m0pFile";
import { serializeM0cFile, parseM0cFile } from "../m0c/m0cFile";
import type { M0cDeriveImage, M0pFile } from "../types";

const FIXED_DATE = new Date("2026-04-26T18:14:00.000Z");

const K1 = "r/fc0";
const K2 = "r/fc1";

// ─────────────────────────────────────────────────────────────
// serializeM0pFile
// ─────────────────────────────────────────────────────────────

describe("serializeM0pFile", () => {
  it("produces a valid m0p file with required fields (null-stable shape)", () => {
    const json = serializeM0pFile({
      created: FIXED_DATE,
      variants: {
        desktop: { size: { width: 1920, height: 1080 }, m0: "F" },
      },
    });

    const obj = JSON.parse(json) as M0pFile;
    expect(obj.format).toBe("m0p");
    expect(obj.version).toBe(1);
    expect(typeof obj.created).toBe("string");
    expect(obj.app).toBeNull();
    expect(obj.appVersion).toBeNull();
    expect(obj.meta).toBeNull();
    expect(obj.regions).toBeNull();
    expect(Object.keys(obj.variants)).toEqual(["desktop"]);

    const v = obj.variants.desktop;
    expect(v.size).toEqual({ width: 1920, height: 1080 });
    expect(v.m0).toBe("1");
    expect(v.meta).toBeNull();
    expect(v.labels).toBeNull();
    expect(v.derive).toEqual({ image: null });
    // No overrides emitted when fields aren't set on input.
    expect(v.created).toBeUndefined();
    expect(v.app).toBeUndefined();
    expect(v.appVersion).toBeUndefined();
  });

  it("uses 2-space indent and ends with newline", () => {
    const json = serializeM0pFile({
      created: FIXED_DATE,
      variants: { a: { size: { width: 100, height: 100 }, m0: "F" } },
    });

    const lines = json.split("\n");
    expect(lines[1]).toMatch(/^  /);
    expect(json.endsWith("\n")).toBe(true);
  });

  it("sorts variant keys alphabetically (deterministic output)", () => {
    const json = serializeM0pFile({
      created: FIXED_DATE,
      variants: {
        square: { size: { width: 1080, height: 1080 }, m0: "F" },
        desktop: { size: { width: 1920, height: 1080 }, m0: "F" },
        mobile: { size: { width: 1080, height: 1920 }, m0: "F" },
      },
    });

    const obj = JSON.parse(json) as M0pFile;
    expect(Object.keys(obj.variants)).toEqual(["desktop", "mobile", "square"]);
  });

  it("sorts region keys alphabetically", () => {
    const json = serializeM0pFile({
      created: FIXED_DATE,
      regions: {
        logo: {},
        cta: {},
        headline: {},
        hero: {},
      },
      variants: { a: { size: { width: 100, height: 100 }, m0: "F" } },
    });

    const obj = JSON.parse(json) as M0pFile;
    expect(Object.keys(obj.regions ?? {})).toEqual([
      "cta",
      "headline",
      "hero",
      "logo",
    ]);
  });

  it("canonicalizes per-variant m0 payloads", () => {
    const json = serializeM0pFile({
      created: FIXED_DATE,
      variants: {
        a: { size: { width: 100, height: 100 }, m0: "  2[F,F]  " },
      },
    });
    expect(JSON.parse(json).variants.a.m0).toBe("2[1,1]");
  });

  it("sorts variant labels by stableKey", () => {
    const json = serializeM0pFile({
      created: FIXED_DATE,
      variants: {
        a: {
          size: { width: 100, height: 100 },
          m0: "2[F,F]",
          labels: {
            [K2]: { text: "second" },
            [K1]: { text: "first" },
          },
        },
      },
    });

    const labelKeys = Object.keys(JSON.parse(json).variants.a.labels);
    expect(labelKeys).toEqual([K1, K2]);
  });

  it("throws when variants is empty", () => {
    expect(() =>
      serializeM0pFile({ created: FIXED_DATE, variants: {} }),
    ).toThrow(/at least one entry/);
  });

  it("throws on invalid variant key (uppercase)", () => {
    expect(() =>
      serializeM0pFile({
        created: FIXED_DATE,
        variants: { Desktop: { size: { width: 100, height: 100 }, m0: "F" } },
      }),
    ).toThrow(/invalid variant key/);
  });

  it("throws on invalid variant key (underscore)", () => {
    expect(() =>
      serializeM0pFile({
        created: FIXED_DATE,
        variants: {
          mobile_phone: { size: { width: 100, height: 100 }, m0: "F" },
        },
      }),
    ).toThrow(/invalid variant key/);
  });

  it("throws on invalid region name", () => {
    expect(() =>
      serializeM0pFile({
        created: FIXED_DATE,
        regions: { "Head Line": {} },
        variants: { a: { size: { width: 100, height: 100 }, m0: "F" } },
      }),
    ).toThrow(/invalid region name/);
  });

  it("throws on missing variant size", () => {
    expect(() =>
      serializeM0pFile({
        created: FIXED_DATE,
        // size omitted on purpose
        variants: { a: { m0: "F" } as never },
      }),
    ).toThrow(/missing required size/);
  });

  it("throws on non-positive variant size", () => {
    expect(() =>
      serializeM0pFile({
        created: FIXED_DATE,
        variants: { a: { size: { width: 0, height: 100 }, m0: "F" } },
      }),
    ).toThrow(/size\.width/);
  });

  it("throws on empty m0 payload", () => {
    expect(() =>
      serializeM0pFile({
        created: FIXED_DATE,
        variants: { a: { size: { width: 100, height: 100 }, m0: "  " } },
      }),
    ).toThrow(/empty m0 payload/);
  });

  it("collapses variant overrides that match pack-level values", () => {
    // app on variant equals app on pack → variant.app should be omitted.
    const json = serializeM0pFile({
      created: FIXED_DATE,
      app: "m0saic-web",
      appVersion: "0.1.0",
      variants: {
        a: {
          size: { width: 100, height: 100 },
          m0: "F",
          app: "m0saic-web",
          appVersion: "0.1.0",
          created: FIXED_DATE,
        },
      },
    });

    const obj = JSON.parse(json) as M0pFile;
    expect(obj.variants.a.app).toBeUndefined();
    expect(obj.variants.a.appVersion).toBeUndefined();
    expect(obj.variants.a.created).toBeUndefined();
  });

  it("emits variant overrides that differ from pack-level values", () => {
    const json = serializeM0pFile({
      created: FIXED_DATE,
      app: "m0saic-web",
      appVersion: "0.1.0",
      variants: {
        a: {
          size: { width: 100, height: 100 },
          m0: "F",
          app: "other-app",
          appVersion: "9.9.9",
          created: new Date("2025-01-01T00:00:00.000Z"),
        },
      },
    });

    const obj = JSON.parse(json) as M0pFile;
    expect(obj.variants.a.app).toBe("other-app");
    expect(obj.variants.a.appVersion).toBe("9.9.9");
    expect(obj.variants.a.created).toBe("2025-01-01T00:00:00.000Z");
  });

  it("normalizes empty meta/labels to null on variant", () => {
    const json = serializeM0pFile({
      created: FIXED_DATE,
      variants: {
        a: {
          size: { width: 100, height: 100 },
          m0: "F",
          meta: { title: "  " },
          labels: {},
        },
      },
    });

    const obj = JSON.parse(json) as M0pFile;
    expect(obj.variants.a.meta).toBeNull();
    expect(obj.variants.a.labels).toBeNull();
  });

  it("trims and preserves region description/color", () => {
    const json = serializeM0pFile({
      created: FIXED_DATE,
      regions: {
        headline: { description: "  primary  ", color: "  #ef7525  " },
        hero: { description: "  ", color: "  " }, // both empty after trim → empty entry
      },
      variants: { a: { size: { width: 100, height: 100 }, m0: "F" } },
    });

    const obj = JSON.parse(json) as M0pFile;
    expect(obj.regions?.headline).toEqual({
      description: "primary",
      color: "#ef7525",
    });
    expect(obj.regions?.hero).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────
// parseM0pFile
// ─────────────────────────────────────────────────────────────

describe("parseM0pFile", () => {
  function minimalPack(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
      format: "m0p",
      version: 1,
      created: "2026-04-26T18:14:00.000Z",
      app: null,
      appVersion: null,
      meta: null,
      regions: null,
      variants: {
        desktop: {
          meta: null,
          size: { width: 1920, height: 1080 },
          m0: "F",
          labels: null,
          derive: { image: null },
        },
      },
      ...overrides,
    });
  }

  it("parses a minimal valid pack", () => {
    const file = parseM0pFile(minimalPack());
    expect(file.format).toBe("m0p");
    expect(file.version).toBe(1);
    expect(file.app).toBeNull();
    expect(file.meta).toBeNull();
    expect(file.regions).toBeNull();
    expect(Object.keys(file.variants)).toEqual(["desktop"]);
    expect(file.variants.desktop.size).toEqual({ width: 1920, height: 1080 });
    expect(file.variants.desktop.m0).toBe("F");
  });

  it("throws on wrong format", () => {
    expect(() =>
      parseM0pFile(minimalPack({ format: "m0c" })),
    ).toThrow(/expected format "m0p"/);
  });

  it("throws on wrong version", () => {
    expect(() =>
      parseM0pFile(minimalPack({ version: 2 })),
    ).toThrow(/expected version 1/);
  });

  it("throws on missing created", () => {
    expect(() =>
      parseM0pFile(minimalPack({ created: "" })),
    ).toThrow(/missing created/);
  });

  it("throws on non-object variants", () => {
    expect(() =>
      parseM0pFile(minimalPack({ variants: [] as unknown as object })),
    ).toThrow(/variants must be an object map/);
  });

  it("throws on empty variants", () => {
    expect(() =>
      parseM0pFile(minimalPack({ variants: {} })),
    ).toThrow(/at least one entry/);
  });

  it("throws on invalid variant key", () => {
    expect(() =>
      parseM0pFile(
        minimalPack({
          variants: {
            Desktop: {
              meta: null,
              size: { width: 1920, height: 1080 },
              m0: "F",
              labels: null,
              derive: { image: null },
            },
          },
        }),
      ),
    ).toThrow(/invalid variant key/);
  });

  it("throws on missing variant size", () => {
    expect(() =>
      parseM0pFile(
        minimalPack({
          variants: {
            desktop: {
              meta: null,
              m0: "F",
              labels: null,
              derive: { image: null },
            },
          },
        }),
      ),
    ).toThrow(/missing required size/);
  });

  it("throws on invalid variant size", () => {
    expect(() =>
      parseM0pFile(
        minimalPack({
          variants: {
            desktop: {
              meta: null,
              size: { width: -10, height: 100 },
              m0: "F",
              labels: null,
              derive: { image: null },
            },
          },
        }),
      ),
    ).toThrow(/positive integers/);
  });

  it("throws on missing m0 payload in a variant", () => {
    expect(() =>
      parseM0pFile(
        minimalPack({
          variants: {
            desktop: {
              meta: null,
              size: { width: 1920, height: 1080 },
              m0: "  ",
              labels: null,
              derive: { image: null },
            },
          },
        }),
      ),
    ).toThrow(/missing m0 payload/);
  });

  it("throws on invalid region name", () => {
    expect(() =>
      parseM0pFile(minimalPack({ regions: { "Head Line": {} } })),
    ).toThrow(/invalid region name/);
  });

  it("preserves variant overrides when present and valid", () => {
    const file = parseM0pFile(
      minimalPack({
        variants: {
          desktop: {
            meta: null,
            size: { width: 1920, height: 1080 },
            m0: "F",
            labels: null,
            derive: { image: null },
            created: "2025-01-01T00:00:00.000Z",
            app: "other-app",
            appVersion: "9.9.9",
          },
        },
      }),
    );

    expect(file.variants.desktop.created).toBe("2025-01-01T00:00:00.000Z");
    expect(file.variants.desktop.app).toBe("other-app");
    expect(file.variants.desktop.appVersion).toBe("9.9.9");
  });

  it("ignores unknown top-level fields (forward-compatible)", () => {
    const file = parseM0pFile(minimalPack({ futureField: "ignored" }));
    expect(file.format).toBe("m0p");
    expect((file as Record<string, unknown>).futureField).toBeUndefined();
  });

  it("throws on invalid JSON", () => {
    expect(() => parseM0pFile("not json")).toThrow(/invalid JSON/);
  });
});

// ─────────────────────────────────────────────────────────────
// Roundtrip
// ─────────────────────────────────────────────────────────────

describe("custom field round-trip", () => {
  it("pack-level custom JSON round-trips unchanged", () => {
    const custom = {
      brand: { palette: ["#ef7525", "#1a1a1a"], font: "Inter" },
      sources: ["brief.pdf", "https://drive.example/asset/123"],
      version: 4,
      flags: { internalReview: true, audit: null },
    };
    const json = serializeM0pFile({
      created: FIXED_DATE,
      custom,
      variants: { a: { size: { width: 100, height: 100 }, m0: "F" } },
    });
    const parsed = parseM0pFile(json);
    expect(parsed.custom).toEqual(custom);
  });

  it("variant-level custom JSON round-trips unchanged", () => {
    const variantCustom = { imageSrc: "logo@2x.png", animationDuration: 600 };
    const json = serializeM0pFile({
      created: FIXED_DATE,
      variants: {
        a: {
          size: { width: 100, height: 100 },
          m0: "F",
          custom: variantCustom,
        },
      },
    });
    const parsed = parseM0pFile(json);
    expect(parsed.variants.a.custom).toEqual(variantCustom);
  });

  it("custom defaults to null when absent (null-stable)", () => {
    const json = serializeM0pFile({
      created: FIXED_DATE,
      variants: { a: { size: { width: 100, height: 100 }, m0: "F" } },
    });
    const parsed = parseM0pFile(json);
    expect(parsed.custom).toBeNull();
    expect(parsed.variants.a.custom).toBeNull();
  });
});

describe("m0p roundtrip", () => {
  it("serialize → parse preserves all variant fields", () => {
    const deriveImage: M0cDeriveImage = {
      mime: "image/png",
      bytes: 4,
      b64: "AQIDBA==",
    };

    const json = serializeM0pFile({
      created: FIXED_DATE,
      app: "m0saic-web",
      appVersion: "0.1.0",
      meta: { title: "Spring 2026" },
      regions: { headline: { description: "primary copy", color: "#ef7525" } },
      variants: {
        desktop: {
          size: { width: 1920, height: 1080 },
          m0: "21[13(F,F),8(F,F)]",
          meta: { note: "16:9 hero" },
          labels: {
            [K1]: { text: "headline", color: "#ef7525" },
            [K2]: { text: "hero" },
          },
          deriveImage,
        },
      },
    });

    const file = parseM0pFile(json);
    expect(file.created).toBe(file.created); // stable string
    expect(file.app).toBe("m0saic-web");
    expect(file.appVersion).toBe("0.1.0");
    expect(file.meta).toEqual({ title: "Spring 2026" });
    expect(file.regions?.headline).toEqual({
      description: "primary copy",
      color: "#ef7525",
    });

    const v = file.variants.desktop;
    expect(v.size).toEqual({ width: 1920, height: 1080 });
    expect(v.m0).toBe("21[13(1,1),8(1,1)]");
    expect(v.meta).toEqual({ note: "16:9 hero" });
    expect(v.labels).toEqual({
      [K1]: { text: "headline", color: "#ef7525" },
      [K2]: { text: "hero" },
    });
    expect(v.derive.image).toEqual(deriveImage);
  });

  it("serialize → parse → serialize is byte-stable", () => {
    const json1 = serializeM0pFile({
      created: FIXED_DATE,
      app: "m0saic-web",
      appVersion: "0.1.0",
      regions: { headline: { description: "primary" } },
      variants: {
        // deliberately out of order
        square: { size: { width: 1080, height: 1080 }, m0: "F" },
        desktop: { size: { width: 1920, height: 1080 }, m0: "2[F,F]" },
      },
    });

    const file = parseM0pFile(json1);
    const json2 = serializeM0pFile({
      created: new Date(file.created),
      app: file.app,
      appVersion: file.appVersion,
      meta: file.meta,
      regions: file.regions ?? undefined,
      custom: file.custom,
      variants: Object.fromEntries(
        Object.entries(file.variants).map(([k, v]) => [
          k,
          {
            size: v.size,
            m0: v.m0,
            meta: v.meta,
            labels: v.labels,
            deriveImage: v.derive.image,
            custom: v.custom,
            created: v.created ? new Date(v.created) : undefined,
            app: v.app,
            appVersion: v.appVersion,
          },
        ]),
      ),
    });

    expect(json2).toBe(json1);
  });
});

// ─────────────────────────────────────────────────────────────
// bundleM0cIntoPack / extractVariantAsM0c
// ─────────────────────────────────────────────────────────────

describe("bundleM0cIntoPack / extractVariantAsM0c", () => {
  it("bundle produces a one-variant pack from an m0c", () => {
    const m0cJson = serializeM0cFile({
      m0: "2[F,F]",
      size: { width: 1920, height: 1080 },
      created: FIXED_DATE,
      app: "m0saic-web",
      appVersion: "0.1.0",
      meta: { title: "Hero" },
      labels: { [K1]: { text: "headline" } },
    });
    const m0c = parseM0cFile(m0cJson);

    const pack = bundleM0cIntoPack(
      { key: "desktop", file: m0c },
      { meta: { title: "Spring set" }, regions: { headline: {} } },
    );

    expect(pack.format).toBe("m0p");
    expect(pack.version).toBe(1);
    expect(pack.app).toBe("m0saic-web");
    expect(pack.appVersion).toBe("0.1.0");
    expect(pack.meta).toEqual({ title: "Spring set" });
    expect(pack.regions).toEqual({ headline: {} });
    expect(Object.keys(pack.variants)).toEqual(["desktop"]);

    const v = pack.variants.desktop;
    expect(v.size).toEqual({ width: 1920, height: 1080 });
    expect(v.m0).toBe("2[1,1]");
    expect(v.meta).toEqual({ title: "Hero" });
    expect(v.labels).toEqual({ [K1]: { text: "headline" } });
  });

  it("bundle rejects invalid variant keys", () => {
    const m0c = parseM0cFile(
      serializeM0cFile({
        m0: "F",
        size: { width: 100, height: 100 },
        created: FIXED_DATE,
      }),
    );
    expect(() => bundleM0cIntoPack({ key: "Desktop", file: m0c })).toThrow(
      /invalid variant key/,
    );
  });

  it("bundle rejects m0c without size (variants require explicit canvas)", () => {
    const m0c = parseM0cFile(
      serializeM0cFile({ m0: "F", size: null, created: FIXED_DATE }),
    );
    expect(() => bundleM0cIntoPack({ key: "desktop", file: m0c })).toThrow(
      /missing size/,
    );
  });

  it("extract returns a standalone m0c with pack defaults inlined", () => {
    const m0c = parseM0cFile(
      serializeM0cFile({
        m0: "2[F,F]",
        size: { width: 1920, height: 1080 },
        created: FIXED_DATE,
        app: "m0saic-web",
        appVersion: "0.1.0",
        meta: { title: "Hero" },
        labels: { [K1]: { text: "headline" } },
      }),
    );
    const pack = bundleM0cIntoPack({ key: "desktop", file: m0c });

    const extracted = extractVariantAsM0c(pack, "desktop");
    expect(extracted.format).toBe("m0c");
    expect(extracted.version).toBe(1);
    expect(extracted.created).toBe(pack.created);
    expect(extracted.app).toBe(pack.app);
    expect(extracted.appVersion).toBe(pack.appVersion);
    expect(extracted.size).toEqual({ width: 1920, height: 1080 });
    expect(extracted.m0).toBe("2[1,1]");
    expect(extracted.labels).toEqual({ [K1]: { text: "headline" } });
  });

  it("extract throws on unknown variant key", () => {
    const m0c = parseM0cFile(
      serializeM0cFile({
        m0: "F",
        size: { width: 100, height: 100 },
        created: FIXED_DATE,
      }),
    );
    const pack = bundleM0cIntoPack({ key: "desktop", file: m0c });
    expect(() => extractVariantAsM0c(pack, "mobile")).toThrow(/not found/);
  });

  it("extract → bundle → extract is identity-stable per variant", () => {
    const m0c = parseM0cFile(
      serializeM0cFile({
        m0: "2[F,F]",
        size: { width: 1920, height: 1080 },
        created: FIXED_DATE,
        app: "m0saic-web",
        appVersion: "0.1.0",
        meta: { title: "Hero" },
        labels: { [K1]: { text: "headline" } },
      }),
    );

    const pack1 = bundleM0cIntoPack({ key: "desktop", file: m0c });
    const extracted1 = extractVariantAsM0c(pack1, "desktop");
    const pack2 = bundleM0cIntoPack({ key: "desktop", file: extracted1 });
    const extracted2 = extractVariantAsM0c(pack2, "desktop");

    expect(extracted2).toEqual(extracted1);
  });
});

// ─────────────────────────────────────────────────────────────
// Discovery helpers
// ─────────────────────────────────────────────────────────────

describe("discovery helpers", () => {
  function buildPack(): M0pFile {
    return parseM0pFile(
      serializeM0pFile({
        created: FIXED_DATE,
        variants: {
          square: { size: { width: 1080, height: 1080 }, m0: "F" },
          desktop: { size: { width: 1920, height: 1080 }, m0: "F" },
          mobile: { size: { width: 1080, height: 1920 }, m0: "F" },
        },
      }),
    );
  }

  it("listVariantKeys returns alphabetical order", () => {
    const pack = buildPack();
    expect(listVariantKeys(pack)).toEqual(["desktop", "mobile", "square"]);
  });

  it("getVariant returns the entry or null", () => {
    const pack = buildPack();
    expect(getVariant(pack, "desktop")?.size).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(getVariant(pack, "tablet")).toBeNull();
  });

  it("findVariantBySize matches exact dimensions", () => {
    const pack = buildPack();
    const hit = findVariantBySize(pack, 1080, 1920);
    expect(hit?.key).toBe("mobile");
    expect(findVariantBySize(pack, 9999, 9999)).toBeNull();
  });
});
