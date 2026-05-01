import {
  upgradeM0ToM0c,
  downgradeM0cToM0,
  upgradeM0ToPack,
  extractVariantAsM0,
} from "./conversions";
import { bundleM0cIntoPack, extractVariantAsM0c } from "./m0p/m0pFile";
import { serializeM0File, parseM0File } from "./m0";
import { serializeM0cFile, parseM0cFile } from "./m0c";
import type { M0cDeriveImage, M0cFile, M0File } from "./types";

const FIXED_DATE = new Date("2026-04-26T18:14:00.000Z");
const K1 = "r/fc0";

function makeM0(): M0File {
  return parseM0File(
    serializeM0File({
      m0: "2[F,F]",
      size: { width: 1920, height: 1080 },
      created: FIXED_DATE,
      app: "m0saic-web",
      appVersion: "0.1.0",
      meta: { title: "Hero" },
    }),
  );
}

function makeM0c(): M0cFile {
  const deriveImage: M0cDeriveImage = {
    mime: "image/png",
    bytes: 4,
    b64: "AQIDBA==",
  };
  return parseM0cFile(
    serializeM0cFile({
      m0: "2[F,F]",
      size: { width: 1920, height: 1080 },
      created: FIXED_DATE,
      app: "m0saic-web",
      appVersion: "0.1.0",
      meta: { title: "Hero" },
      labels: { [K1]: { text: "headline" } },
      deriveImage,
    }),
  );
}

// ─────────────────────────────────────────────────────────────
// upgradeM0ToM0c — lossless
// ─────────────────────────────────────────────────────────────

describe("upgradeM0ToM0c", () => {
  it("preserves every .m0 field and seeds labels/derive as null", () => {
    const m0 = makeM0();
    const m0c = upgradeM0ToM0c(m0);

    expect(m0c.format).toBe("m0c");
    expect(m0c.version).toBe(1);
    expect(m0c.created).toBe(m0.created);
    expect(m0c.app).toBe(m0.app);
    expect(m0c.appVersion).toBe(m0.appVersion);
    expect(m0c.meta).toEqual(m0.meta);
    expect(m0c.size).toEqual(m0.size);
    expect(m0c.m0).toBe(m0.m0);
    expect(m0c.labels).toBeNull();
    expect(m0c.derive).toEqual({ image: null });
  });

  it("upgrade → downgrade is identity (since input had no labels/derive)", () => {
    const m0 = makeM0();
    const round = downgradeM0cToM0(upgradeM0ToM0c(m0));
    expect(round).toEqual(m0);
  });
});

// ─────────────────────────────────────────────────────────────
// downgradeM0cToM0 — lossy by design
// ─────────────────────────────────────────────────────────────

describe("downgradeM0cToM0", () => {
  it("drops labels and derive image, preserves the rest", () => {
    const m0c = makeM0c();
    const m0 = downgradeM0cToM0(m0c);

    expect(m0.version).toBe(1);
    expect(m0.created).toBe(m0c.created);
    expect(m0.app).toBe(m0c.app);
    expect(m0.appVersion).toBe(m0c.appVersion);
    expect(m0.meta).toEqual(m0c.meta);
    expect(m0.size).toEqual(m0c.size);
    expect(m0.m0).toBe(m0c.m0);
    // M0File has no labels/derive fields at all.
    expect((m0 as Record<string, unknown>).labels).toBeUndefined();
    expect((m0 as Record<string, unknown>).derive).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
// upgradeM0ToPack — composes upgrade + bundle
// ─────────────────────────────────────────────────────────────

describe("upgradeM0ToPack", () => {
  it("produces a one-variant pack equivalent to bundle(upgrade(...))", () => {
    const m0 = makeM0();

    const direct = upgradeM0ToPack(
      { key: "desktop", file: m0 },
      { meta: { title: "Spring set" }, regions: { headline: {} } },
    );

    const composed = bundleM0cIntoPack(
      { key: "desktop", file: upgradeM0ToM0c(m0) },
      { meta: { title: "Spring set" }, regions: { headline: {} } },
    );

    expect(direct).toEqual(composed);
    expect(direct.format).toBe("m0p");
    expect(Object.keys(direct.variants)).toEqual(["desktop"]);
    expect(direct.variants.desktop.size).toEqual(m0.size);
    expect(direct.variants.desktop.m0).toBe(m0.m0);
    expect(direct.variants.desktop.labels).toBeNull();
  });

  it("rejects invalid variant keys (delegated to bundleM0cIntoPack)", () => {
    expect(() =>
      upgradeM0ToPack({ key: "Desktop", file: makeM0() }),
    ).toThrow(/invalid variant key/);
  });

  it("rejects an .m0 without size (variants require explicit canvas)", () => {
    const m0 = parseM0File(
      serializeM0File({ m0: "F", created: FIXED_DATE }),
    );
    expect(() =>
      upgradeM0ToPack({ key: "desktop", file: m0 }),
    ).toThrow(/missing size/);
  });
});

// ─────────────────────────────────────────────────────────────
// extractVariantAsM0 — composes extract + downgrade
// ─────────────────────────────────────────────────────────────

describe("extractVariantAsM0", () => {
  it("returns a standalone .m0 stripped of labels/derive", () => {
    const m0c = makeM0c();
    const pack = bundleM0cIntoPack({ key: "desktop", file: m0c });

    const direct = extractVariantAsM0(pack, "desktop");
    const composed = downgradeM0cToM0(extractVariantAsM0c(pack, "desktop"));

    expect(direct).toEqual(composed);
    expect(direct.size).toEqual({ width: 1920, height: 1080 });
    expect(direct.m0).toBe("2[1,1]");
    expect((direct as Record<string, unknown>).labels).toBeUndefined();
  });

  it("throws on unknown variant key (delegated to extractVariantAsM0c)", () => {
    const pack = bundleM0cIntoPack({ key: "desktop", file: makeM0c() });
    expect(() => extractVariantAsM0(pack, "mobile")).toThrow(/not found/);
  });
});

// ─────────────────────────────────────────────────────────────
// Full ladder — .m0 → .m0c → .m0p → .m0c → .m0
// ─────────────────────────────────────────────────────────────

describe("full conversion ladder", () => {
  it(".m0 → .m0p → .m0 is identity (no labels/derive ever introduced)", () => {
    const m0 = makeM0();
    const pack = upgradeM0ToPack({ key: "desktop", file: m0 });
    const back = extractVariantAsM0(pack, "desktop");
    expect(back).toEqual(m0);
  });

  it(".m0c → .m0p → .m0c is identity-stable for the variant", () => {
    const m0c = makeM0c();
    const pack = bundleM0cIntoPack({ key: "desktop", file: m0c });
    const back = extractVariantAsM0c(pack, "desktop");
    expect(back).toEqual(m0c);
  });
});
