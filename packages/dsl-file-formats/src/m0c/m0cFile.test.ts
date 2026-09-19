import { serializeM0cFile, serializeM0gFile, parseM0cFile, MOGGING_HEADER } from "./m0cFile";
import type { M0cDeriveImage } from "../types";
import { parseBackgroundImage, parseBackgroundColor } from "../derive";

const FIXED_DATE = new Date("2025-06-15T12:30:00.000+02:00");

const K1 = "k/1";
const K2 = "k/2";

describe("serializeM0cFile", () => {
  it("produces valid JSON with required fields (null-stable shape)", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 1920, height: 1080 },
      created: FIXED_DATE,
    });

    const obj = JSON.parse(json);
    expect(obj.format).toBe("m0c");
    expect(obj.version).toBe(1);
    expect(obj.size).toEqual({ width: 1920, height: 1080 });
    expect(typeof obj.created).toBe("string");
    expect(obj.m0).toBe("1");

    // null-stable defaults
    expect(obj.app).toBeNull();
    expect(obj.meta).toBeNull();
    expect(obj.labels).toBeNull();
    expect(obj.derive).toEqual({ background: null });
  });

  it("uses 2-space indent and ends with newline", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 100, height: 100 },
      created: FIXED_DATE,
    });

    const lines = json.split("\n");
    expect(lines[1]).toMatch(/^  /);
    expect(json.endsWith("\n")).toBe(true);
  });

  it("canonicalizes the m0saic payload", () => {
    const json = serializeM0cFile({
      m0: "  2[F,F]  ",
      size: { width: 100, height: 100 },
      created: FIXED_DATE,
    });

    expect(JSON.parse(json).m0).toBe("2[1,1]");
  });

  it("includes app and meta when provided (and trims)", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 1920, height: 1080 },
      created: FIXED_DATE,
      app: "  m0saic-web@1.0.0  ",
      meta: { title: "  My Layout  ", author: " Test " },
    });

    const obj = JSON.parse(json);
    expect(obj.app).toBe("m0saic-web@1.0.0");
    expect(obj.meta).toEqual({ title: "My Layout", author: "Test" });
  });

  it("normalizes empty app/meta/labels to null", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 100, height: 100 },
      created: FIXED_DATE,
      app: "   ",
      meta: { title: "   " }, // becomes null
      labels: {}, // becomes null
    });

    const obj = JSON.parse(json);
    expect(obj.app).toBeNull();
    expect(obj.meta).toBeNull();
    expect(obj.labels).toBeNull();
  });

  it("includes labels when provided (string-keyed map)", () => {
    const labels = {
      [K1]: { text: "hero" },
      [K2]: { text: "overlay", color: "#ff00ff" },
    };

    const json = serializeM0cFile({
      m0: "2[F,F]",
      size: { width: 100, height: 100 },
      created: FIXED_DATE,
      labels,
    });

    expect(JSON.parse(json).labels).toEqual(labels);
  });

  it("filters empty label text entries and trims", () => {
    const labels = {
      [K1]: { text: "   " }, // dropped
      [K2]: { text: " ok ", color: "  #fff  " },
    };

    const json = serializeM0cFile({
      m0: "F",
      size: { width: 100, height: 100 },
      created: FIXED_DATE,
      labels,
    });

    const obj = JSON.parse(json);
    expect(obj.labels).toEqual({ [K2]: { text: "ok", color: "#fff" } });
  });

  it("embeds derive image as a data-URI background string when provided", () => {
    const deriveImage: M0cDeriveImage = {
      mime: "image/png",
      bytes: 4,
      b64: "AQIDBA==",
    };

    const json = serializeM0cFile({
      m0: "F",
      size: { width: 100, height: 100 },
      created: FIXED_DATE,
      deriveImage,
    });

    const obj = JSON.parse(json);
    expect(obj.derive.background).toBe(`data:image/png;base64,AQIDBA==`);
  });

  it("allows size to be null", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: null,
      created: FIXED_DATE,
    });

    const obj = JSON.parse(json);
    expect(obj.size).toBeNull();
  });
});

describe("parseM0cFile", () => {
  it("parses a minimal valid file (size may be null)", () => {
    const input = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-06-15T12:30:00.000+02:00",
      m0: "F",
      size: null,
      app: null,
      meta: null,
      labels: null,
      derive: { background: null },
    });

    const file = parseM0cFile(input);
    expect(file.format).toBe("m0c");
    expect(file.version).toBe(1);
    expect(file.size).toBeNull();
    expect(file.m0).toBe("1"); // pretty/alias "F" is accepted on read, normalized to canonical
    expect(file.app).toBeNull();
    expect(file.meta).toBeNull();
    expect(file.labels).toBeNull();
    expect(file.derive).toEqual({ background: null });
  });

  it("throws on wrong format", () => {
    const input = JSON.stringify({
      format: "m0",
      version: 1,
      created: "2025-01-01T00:00:00.000+00:00",
      m0: "F",
      size: null,
      app: null,
      meta: null,
      labels: null,
      derive: { background: null },
    });

    expect(() => parseM0cFile(input)).toThrow('expected format "m0c"');
  });

  it("throws on wrong version", () => {
    const input = JSON.stringify({
      format: "m0c",
      version: 2,
      created: "2025-01-01T00:00:00.000+00:00",
      m0: "F",
      size: null,
      app: null,
      meta: null,
      labels: null,
      derive: { background: null },
    });

    expect(() => parseM0cFile(input)).toThrow("expected version 1");
  });

  it("throws on missing created", () => {
    const input = JSON.stringify({
      format: "m0c",
      version: 1,
      m0: "F",
      size: null,
      app: null,
      meta: null,
      labels: null,
      derive: { background: null },
    });

    expect(() => parseM0cFile(input)).toThrow("missing created");
  });

  it("throws on empty m0saic payload", () => {
    const input = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-01-01T00:00:00.000+00:00",
      m0: "  ",
      size: null,
      app: null,
      meta: null,
      labels: null,
      derive: { background: null },
    });

    expect(() => parseM0cFile(input)).toThrow("missing m0 payload");
  });

  it("accepts size as object (and rejects invalid)", () => {
    const ok = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-01-01T00:00:00.000+00:00",
      m0: "F",
      size: { width: 100, height: 100 },
      app: null,
      meta: null,
      labels: null,
      derive: { background: null },
    });
    expect(parseM0cFile(ok).size).toEqual({ width: 100, height: 100 });

    const bad = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-01-01T00:00:00.000+00:00",
      m0: "F",
      size: { width: 0, height: 100 },
      app: null,
      meta: null,
      labels: null,
      derive: { background: null },
    });
    expect(() => parseM0cFile(bad)).toThrow("invalid size");
  });

  it("preserves optional fields when present (labels map + derive)", () => {
    const input = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-01-01T00:00:00.000+00:00",
      m0: "F",
      size: { width: 100, height: 100 },
      app: "test@1.0.0",
      meta: { title: "Hello" },
      labels: { [K1]: { text: "hero" } },
      derive: { background: "data:image/png;base64,AAAA" },
    });

    const file = parseM0cFile(input);
    expect(file.app).toBe("test@1.0.0");
    expect(file.meta).toEqual({ title: "Hello" });
    expect(file.labels).toEqual({ [K1]: { text: "hero" } });
    expect(file.derive.background).toBe("data:image/png;base64,AAAA");
  });

  it("ignores unknown fields (not surfaced on typed output)", () => {
    const input = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-01-01T00:00:00.000+00:00",
      m0: "F",
      size: null,
      app: null,
      meta: null,
      labels: null,
      derive: { background: null },
      customField: "ignored",
    });

    const file = parseM0cFile(input);
    expect(file.m0).toBe("1"); // pretty/alias "F" is accepted on read, normalized to canonical
    expect((file as Record<string, unknown>).customField).toBeUndefined();
  });
});

describe("m0c roundtrip", () => {
  it("serialize → parse roundtrips m0saic string in canonical form", () => {
    const json = serializeM0cFile({
      m0: "2[F,-{F}]",
      size: { width: 1920, height: 1080 },
      created: FIXED_DATE,
    });

    const file = parseM0cFile(json);
    expect(file.m0).toBe("2[1,-{1}]");
  });

  it("roundtrips all fields (labels map + derive)", () => {
    const labels = {
      [K1]: { text: "hero" },
      [K2]: { text: "inner" },
    };

    const deriveImage: M0cDeriveImage = {
      mime: "image/jpeg",
      bytes: 3,
      b64: "AQID",
    };

    const json = serializeM0cFile({
      m0: "2[F,F]",
      size: { width: 3840, height: 2160 },
      created: FIXED_DATE,
      app: "test@2.0.0",
      meta: { title: "RT", author: "me" },
      labels,
      deriveImage,
    });

    const file = parseM0cFile(json);
    expect(file.size).toEqual({ width: 3840, height: 2160 });
    expect(file.app).toBe("test@2.0.0");
    expect(file.meta).toEqual({ title: "RT", author: "me" });
    expect(file.labels).toEqual(labels);
    expect(file.derive.background).toBe(
      `data:${deriveImage.mime};base64,${deriveImage.b64}`,
    );
  });
});

describe("custom field round-trip", () => {
  it("preserves arbitrary JSON in `custom`", () => {
    const custom = {
      brand: { palette: ["#ef7525", "#1a1a1a"] },
      sources: ["brief.pdf"],
      flags: { reviewed: true, needsLocalization: null },
    };
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 100, height: 100 },
      created: FIXED_DATE,
      custom,
    });
    const parsed = parseM0cFile(json);
    expect(parsed.custom).toEqual(custom);
  });

  it("defaults custom to null when absent (null-stable)", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 100, height: 100 },
      created: FIXED_DATE,
    });
    const parsed = parseM0cFile(json);
    expect(parsed.custom).toBeNull();
  });
});

describe("derive image base64 roundtrip", () => {
  it("background data-URI round-trips the embedded bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 128, 64]);
    const b64 = Buffer.from(bytes).toString("base64");
    const img: M0cDeriveImage = {
      mime: "image/png",
      bytes: bytes.length,
      b64,
    };

    const json = serializeM0cFile({
      m0: "F",
      size: { width: 100, height: 100 },
      created: FIXED_DATE,
      deriveImage: img,
    });

    const file = parseM0cFile(json);
    const parsed = parseBackgroundImage(file.derive.background);
    expect(parsed).not.toBeNull();
    const decoded = Buffer.from(parsed!.b64, "base64");
    expect(decoded.byteLength).toBe(bytes.length);
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });

  it("color background round-trips via the hex form (with alpha)", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 100, height: 100 },
      created: FIXED_DATE,
      background: "#ef7525bf",
    });
    const file = parseM0cFile(json);
    expect(file.derive.background).toBe("#ef7525bf");
    const color = parseBackgroundColor(file.derive.background);
    expect(color).not.toBeNull();
    expect(color!.hex).toBe("#ef7525");
    expect(color!.opacity).toBeCloseTo(0xbf / 0xff, 3);
  });

});

// ─────────────────────────────────────────────────────────────
// masks (per-frame inline mask shapes, keyed by stableKey)
// ─────────────────────────────────────────────────────────────

describe("masks field — round trip", () => {
  it("absent in serialized output when no masks supplied (null-stable)", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 1920, height: 1080 },
      created: FIXED_DATE,
    });
    const obj = JSON.parse(json);
    expect(obj.masks).toBeNull();
    const parsed = parseM0cFile(json);
    expect(parsed.masks).toBeNull();
  });

  it("round-trips a single inline mask entry by stableKey", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      masks: {
        [K1]: {
          localPath: "M 0 0 H 100 V 100 H 0 Z",
          bounds: { x: 0, y: 0, width: 100, height: 100 },
        },
      },
    });
    const parsed = parseM0cFile(json);
    expect(parsed.masks).toEqual({
      [K1]: {
        localPath: "M 0 0 H 100 V 100 H 0 Z",
        bounds: { x: 0, y: 0, width: 100, height: 100 },
      },
    });
  });

  it("preserves explicit null entries (means 'this frame has no mask')", () => {
    // Null is distinct from absent: it round-trips through the file as an
    // explicit "this frame has no mask" rather than "no opinion either way."
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      masks: {
        [K1]: { localPath: "M 0 0 H 10 Z", bounds: { x: 0, y: 0, width: 10, height: 10 } },
        [K2]: null,
      },
    });
    const parsed = parseM0cFile(json);
    expect(parsed.masks).toEqual({
      [K1]: { localPath: "M 0 0 H 10 Z", bounds: { x: 0, y: 0, width: 10, height: 10 } },
      [K2]: null,
    });
    // The null entry must round-trip — must appear in the serialized JSON.
    const obj = JSON.parse(json);
    expect(obj.masks).toHaveProperty(K2);
    expect(obj.masks[K2]).toBeNull();
  });

  it("keys are emitted in sorted order for deterministic output", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      masks: {
        "k/z": { localPath: "M 0 0 Z", bounds: { x: 0, y: 0, width: 1, height: 1 } },
        "k/a": { localPath: "M 0 0 Z", bounds: { x: 0, y: 0, width: 1, height: 1 } },
        "k/m": { localPath: "M 0 0 Z", bounds: { x: 0, y: 0, width: 1, height: 1 } },
      },
    });
    const obj = JSON.parse(json);
    expect(Object.keys(obj.masks)).toEqual(["k/a", "k/m", "k/z"]);
  });

  it("empty / blank-key / invalid entries collapse to null", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      masks: {
        "": { localPath: "M 0 0 Z", bounds: { x: 0, y: 0, width: 1, height: 1 } },
        [K1]: { localPath: "   ", bounds: { x: 0, y: 0, width: 1, height: 1 } }, // empty path → dropped
      },
    });
    const obj = JSON.parse(json);
    expect(obj.masks).toBeNull(); // every entry was invalid → collapse
  });

  it("parser rejects masks that aren't a plain object map", () => {
    const bad = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-06-15T10:30:00.000Z",
      app: null,
      appVersion: null,
      meta: null,
      size: { width: 100, height: 100 },
      m0: "F",
      labels: null,
      derive: { background: null },
      masks: ["not", "a", "map"], // arrays explicitly rejected
      custom: null,
    });
    expect(() => parseM0cFile(bad)).toThrow(/masks/);
  });

  it("parser rejects entries with malformed bounds", () => {
    const bad = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-06-15T10:30:00.000Z",
      app: null,
      appVersion: null,
      meta: null,
      size: { width: 100, height: 100 },
      m0: "F",
      labels: null,
      derive: { background: null },
      masks: {
        [K1]: { localPath: "M 0 0 Z", bounds: { x: "0", y: 0, width: 10, height: 10 } },
      },
      custom: null,
    });
    expect(() => parseM0cFile(bad)).toThrow(/bounds/);
  });

  it("forward-compatible: old m0c files (no masks field) parse with masks: null", () => {
    // An old-format file written before masks landed should still parse
    // cleanly. The parser must not require the field.
    const oldFormat = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-01-01T00:00:00.000Z",
      app: null,
      appVersion: null,
      meta: null,
      size: { width: 100, height: 100 },
      m0: "F",
      labels: null,
      derive: { background: null },
      custom: null,
    });
    const parsed = parseM0cFile(oldFormat);
    expect(parsed.masks).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// rankSets (named per-frame sweep progress, outer name → inner stableKey)
// ─────────────────────────────────────────────────────────────

describe("rankSets field — round trip", () => {
  it("absent in serialized output when no rank sets supplied (null-stable)", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 1920, height: 1080 },
      created: FIXED_DATE,
    });
    const obj = JSON.parse(json);
    expect(obj.rankSets).toBeNull();
    const parsed = parseM0cFile(json);
    expect(parsed.rankSets).toBeNull();
  });

  it("round-trips a single named rank set keyed by stableKey", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      rankSets: {
        diag: {
          mode: "diag",
          ranks: { [K1]: 0, [K2]: 1 },
        },
      },
    });
    const parsed = parseM0cFile(json);
    expect(parsed.rankSets).toEqual({
      diag: { mode: "diag", ranks: { [K1]: 0, [K2]: 1 } },
    });
  });

  it("round-trips multiple named sets simultaneously", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      rankSets: {
        diag: { mode: "diag", ranks: { [K1]: 0, [K2]: 1 } },
        cascade: { mode: "cascade", ranks: { [K1]: 0.5, [K2]: 0.25 } },
      },
    });
    const parsed = parseM0cFile(json);
    expect(parsed.rankSets).toEqual({
      cascade: { mode: "cascade", ranks: { [K1]: 0.5, [K2]: 0.25 } },
      diag: { mode: "diag", ranks: { [K1]: 0, [K2]: 1 } },
    });
  });

  it("preserves explicit null inner entries ('this frame has no rank in this set')", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      rankSets: {
        hero: { ranks: { [K1]: 0.7, [K2]: null } },
      },
    });
    const parsed = parseM0cFile(json);
    expect(parsed.rankSets).toEqual({
      hero: { ranks: { [K1]: 0.7, [K2]: null } },
    });
    // null entry must appear in serialized JSON (round-trips, not collapsed).
    const obj = JSON.parse(json);
    expect(obj.rankSets.hero.ranks).toHaveProperty(K2);
    expect(obj.rankSets.hero.ranks[K2]).toBeNull();
  });

  it("preserves explicit null outer entry ('this named set is intentionally empty')", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      rankSets: {
        diag: { ranks: { [K1]: 0 } },
        custom: null,
      },
    });
    const parsed = parseM0cFile(json);
    expect(parsed.rankSets).toEqual({
      diag: { ranks: { [K1]: 0 } },
      custom: null,
    });
    const obj = JSON.parse(json);
    expect(obj.rankSets).toHaveProperty("custom");
    expect(obj.rankSets.custom).toBeNull();
  });

  it("emits outer set names sorted alphabetically", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      rankSets: {
        radial: { ranks: { [K1]: 0 } },
        cascade: { ranks: { [K1]: 0 } },
        diag: { ranks: { [K1]: 0 } },
      },
    });
    const obj = JSON.parse(json);
    expect(Object.keys(obj.rankSets)).toEqual(["cascade", "diag", "radial"]);
  });

  it("emits inner stableKey order sorted for determinism", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      rankSets: {
        diag: { ranks: { "k/z": 0, "k/a": 0.5, "k/m": 1 } },
      },
    });
    const obj = JSON.parse(json);
    expect(Object.keys(obj.rankSets.diag.ranks)).toEqual(["k/a", "k/m", "k/z"]);
  });

  it("drops invalid inner values (non-finite, non-number) but keeps the set", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      rankSets: {
        diag: {
          ranks: {
            [K1]: 0.5,
            [K2]: Number.NaN as unknown as number,
            "k/3": Number.POSITIVE_INFINITY as unknown as number,
            "k/4": "0.7" as unknown as number,
          },
        },
      },
    });
    const obj = JSON.parse(json);
    // Only the finite-number entry survives.
    expect(obj.rankSets.diag.ranks).toEqual({ [K1]: 0.5 });
  });

  it("parser rejects rankSets that aren't a plain object map", () => {
    const bad = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-06-15T10:30:00.000Z",
      app: null,
      appVersion: null,
      meta: null,
      size: { width: 100, height: 100 },
      m0: "F",
      labels: null,
      derive: { background: null },
      masks: null,
      rankSets: ["not", "a", "map"],
      custom: null,
    });
    expect(() => parseM0cFile(bad)).toThrow(/rankSets/);
  });

  it("parser rejects inner non-finite numeric values", () => {
    const bad = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-06-15T10:30:00.000Z",
      app: null,
      appVersion: null,
      meta: null,
      size: { width: 100, height: 100 },
      m0: "F",
      labels: null,
      derive: { background: null },
      masks: null,
      rankSets: {
        diag: { ranks: { [K1]: "0.5" } },
      },
      custom: null,
    });
    expect(() => parseM0cFile(bad)).toThrow(/rankSets/);
  });

  it("forward-compatible: old m0c files (no rankSets field) parse with rankSets: null", () => {
    const oldFormat = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-01-01T00:00:00.000Z",
      app: null,
      appVersion: null,
      meta: null,
      size: { width: 100, height: 100 },
      m0: "F",
      labels: null,
      derive: { background: null },
      masks: null,
      custom: null,
    });
    const parsed = parseM0cFile(oldFormat);
    expect(parsed.rankSets).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// fill (per-frame rect-fill sidecar — keyed by stableKey)
// ─────────────────────────────────────────────────────────────

describe("fill field — round trip", () => {
  it("absent in serialized output when no fill supplied (null-stable)", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 1920, height: 1080 },
      created: FIXED_DATE,
    });
    const obj = JSON.parse(json);
    expect(obj.fill).toBeNull();
    const parsed = parseM0cFile(json);
    expect(parsed.fill).toBeNull();
  });

  it("round-trips a color-only entry by stableKey", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      fill: { [K1]: { color: "#ef7525" } },
    });
    const parsed = parseM0cFile(json);
    expect(parsed.fill).toEqual({ [K1]: { color: "#ef7525" } });
  });

  it("round-trips a mediaRef-only entry by stableKey", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      fill: { [K1]: { mediaRef: "avatar.png" } },
    });
    const parsed = parseM0cFile(json);
    expect(parsed.fill).toEqual({ [K1]: { mediaRef: "avatar.png" } });
  });

  it("round-trips an entry that carries both color and mediaRef", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      fill: { [K1]: { color: "#bcd6e8", mediaRef: "sample.png" } },
    });
    const parsed = parseM0cFile(json);
    expect(parsed.fill).toEqual({ [K1]: { color: "#bcd6e8", mediaRef: "sample.png" } });
  });

  it("drops entries that carry neither color nor mediaRef", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      fill: { [K1]: {} },
    });
    const obj = JSON.parse(json);
    expect(obj.fill).toBeNull();
  });

  it("trims color and mediaRef whitespace", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      fill: { [K1]: { color: "  #ff0000  ", mediaRef: "  hero.jpg  " } },
    });
    const parsed = parseM0cFile(json);
    expect(parsed.fill).toEqual({ [K1]: { color: "#ff0000", mediaRef: "hero.jpg" } });
  });

  it("keys are emitted in sorted order for deterministic output", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      fill: {
        "k/z": { color: "#000000" },
        "k/a": { color: "#ffffff" },
        "k/m": { color: "#888888" },
      },
    });
    const obj = JSON.parse(json);
    expect(Object.keys(obj.fill)).toEqual(["k/a", "k/m", "k/z"]);
  });

  it("parser rejects fill that isn't a plain object map", () => {
    const bad = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-06-15T10:30:00.000Z",
      app: null,
      appVersion: null,
      meta: null,
      size: { width: 100, height: 100 },
      m0: "F",
      labels: null,
      derive: { background: null },
      masks: null,
      fill: ["not", "a", "map"],
      custom: null,
    });
    expect(() => parseM0cFile(bad)).toThrow(/fill/);
  });

  it("parser rejects fill entries that aren't objects", () => {
    const bad = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-06-15T10:30:00.000Z",
      app: null,
      appVersion: null,
      meta: null,
      size: { width: 100, height: 100 },
      m0: "F",
      labels: null,
      derive: { background: null },
      masks: null,
      fill: { [K1]: "#ff0000" }, // string instead of object → rejected
      custom: null,
    });
    expect(() => parseM0cFile(bad)).toThrow(/fill/);
  });

  it("forward-compatible: old m0c files (no fill field) parse with fill: null", () => {
    const oldFormat = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-01-01T00:00:00.000Z",
      app: null,
      appVersion: null,
      meta: null,
      size: { width: 100, height: 100 },
      m0: "F",
      labels: null,
      derive: { background: null },
      masks: null,
      custom: null,
    });
    const parsed = parseM0cFile(oldFormat);
    expect(parsed.fill).toBeNull();
  });

  it("labels.color and fill[k].color are independent first-class fields", () => {
    // Regression test for the .m0c v2 semantic split: labels[k].color is the
    // label chip tint (UI only), fill[k].color is the rect fill payload.
    // They can carry different values on the same stableKey and the parser
    // preserves both unchanged.
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      labels: { [K1]: { text: "agent", color: "#444444" } },
      fill: { [K1]: { color: "#ef7525" } },
    });
    const parsed = parseM0cFile(json);
    expect(parsed.labels).toEqual({ [K1]: { text: "agent", color: "#444444" } });
    expect(parsed.fill).toEqual({ [K1]: { color: "#ef7525" } });
  });
});

// ─────────────────────────────────────────────────────────────
// insets (per-frame per-edge fractions, keyed by stableKey)
// ─────────────────────────────────────────────────────────────

describe("insets field — round trip", () => {
  it("absent in serialized output when no insets supplied (null-stable)", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 1920, height: 1080 },
      created: FIXED_DATE,
    });
    const obj = JSON.parse(json);
    expect(obj.insets).toBeNull();
    const parsed = parseM0cFile(json);
    expect(parsed.insets).toBeNull();
  });

  it("round-trips a single per-edge entry by stableKey", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      insets: { [K1]: { top: 0.02, right: 0.03, bottom: 0.02, left: 0.03 } },
    });
    const parsed = parseM0cFile(json);
    expect(parsed.insets).toEqual({
      [K1]: { top: 0.02, right: 0.03, bottom: 0.02, left: 0.03 },
    });
    // Edges emit in canonical top/right/bottom/left order.
    const obj = JSON.parse(json);
    expect(Object.keys(obj.insets[K1])).toEqual(["top", "right", "bottom", "left"]);
  });

  it("round-trips an asymmetric entry (each edge distinct)", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      insets: { [K1]: { top: 0.04, right: 0.06, bottom: 0.03, left: 0.06 } },
    });
    const parsed = parseM0cFile(json);
    expect(parsed.insets).toEqual({
      [K1]: { top: 0.04, right: 0.06, bottom: 0.03, left: 0.06 },
    });
  });

  it("keys are emitted in sorted order for deterministic output", () => {
    const edge = { top: 0.01, right: 0.01, bottom: 0.01, left: 0.01 };
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      insets: { "k/z": edge, "k/a": edge, "k/m": edge },
    });
    const obj = JSON.parse(json);
    expect(Object.keys(obj.insets)).toEqual(["k/a", "k/m", "k/z"]);
  });

  it("drops all-zero entries (an inset is meaningful only when an edge > 0)", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      insets: {
        [K1]: { top: 0, right: 0, bottom: 0, left: 0 }, // dropped
        [K2]: { top: 0, right: 0.05, bottom: 0, left: 0 }, // one edge > 0 → kept
      },
    });
    const parsed = parseM0cFile(json);
    expect(parsed.insets).toEqual({
      [K2]: { top: 0, right: 0.05, bottom: 0, left: 0 },
    });
  });

  it("collapses to null when every entry is all-zero", () => {
    const json = serializeM0cFile({
      m0: "F",
      size: { width: 480, height: 480 },
      created: FIXED_DATE,
      insets: { [K1]: { top: 0, right: 0, bottom: 0, left: 0 } },
    });
    const obj = JSON.parse(json);
    expect(obj.insets).toBeNull();
  });

  it("parser rejects insets that aren't a plain object map", () => {
    const bad = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-06-15T10:30:00.000Z",
      app: null,
      appVersion: null,
      meta: null,
      size: { width: 100, height: 100 },
      m0: "F",
      labels: null,
      derive: { background: null },
      masks: null,
      fill: null,
      insets: ["not", "a", "map"],
      custom: null,
    });
    expect(() => parseM0cFile(bad)).toThrow(/insets/);
  });

  it("parser rejects an entry missing an edge (path-named message)", () => {
    const bad = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-06-15T10:30:00.000Z",
      app: null,
      appVersion: null,
      meta: null,
      size: { width: 100, height: 100 },
      m0: "F",
      labels: null,
      derive: { background: null },
      masks: null,
      fill: null,
      insets: { [K1]: { top: 0.1, right: 0.1, bottom: 0.1 } }, // missing left
      custom: null,
    });
    expect(() => parseM0cFile(bad)).toThrow(/insets\["k\/1"\]\.left/);
  });

  it("parser rejects a non-finite edge value", () => {
    const bad = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-06-15T10:30:00.000Z",
      app: null,
      appVersion: null,
      meta: null,
      size: { width: 100, height: 100 },
      m0: "F",
      labels: null,
      derive: { background: null },
      masks: null,
      fill: null,
      insets: { [K1]: { top: 0.1, right: "0.1", bottom: 0.1, left: 0.1 } },
      custom: null,
    });
    expect(() => parseM0cFile(bad)).toThrow(/insets\["k\/1"\]\.right/);
  });

  it("parser silently drops well-formed all-zero entries", () => {
    const input = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-06-15T10:30:00.000Z",
      app: null,
      appVersion: null,
      meta: null,
      size: { width: 100, height: 100 },
      m0: "F",
      labels: null,
      derive: { background: null },
      masks: null,
      fill: null,
      insets: { [K1]: { top: 0, right: 0, bottom: 0, left: 0 } },
      custom: null,
    });
    expect(parseM0cFile(input).insets).toBeNull();
  });

  it("forward-compatible: old m0c files (no insets field) parse with insets: null", () => {
    const oldFormat = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-01-01T00:00:00.000Z",
      app: null,
      appVersion: null,
      meta: null,
      size: { width: 100, height: 100 },
      m0: "F",
      labels: null,
      derive: { background: null },
      masks: null,
      fill: null,
      custom: null,
    });
    const parsed = parseM0cFile(oldFormat);
    expect(parsed.insets).toBeNull();
  });
});

describe("m0g flavor (m0saic goldens)", () => {
  it("serializeM0gFile stamps format m0g, leads with #mogging, and round-trips gold", () => {
    const json = serializeM0gFile({
      m0: "2(1,1)",
      size: { width: 100, height: 50 },
      created: FIXED_DATE,
      gold: { promotedAt: "2026-06-11T00:00:00.000Z", provenance: "test session", criteria: { votes: 3 } },
    });
    expect(json.startsWith(MOGGING_HEADER + "\n")).toBe(true);
    const parsed = parseM0cFile(json);
    expect(parsed.format).toBe("m0g");
    expect(parsed.gold).toEqual({
      promotedAt: "2026-06-11T00:00:00.000Z",
      provenance: "test session",
      criteria: { votes: 3 },
    });
  });

  it("parseM0cFile tolerates leading #mogging (and extra) comment lines", () => {
    const json = serializeM0gFile({ m0: "F", created: FIXED_DATE, gold: { provenance: "x" } });
    const withExtra = "# extra\n\n" + json;
    expect(parseM0cFile(withExtra).format).toBe("m0g");
  });

  it("ordinary .m0c is unchanged: starts with '{', no gold key, format m0c", () => {
    const json = serializeM0cFile({ m0: "F", created: FIXED_DATE });
    expect(json.startsWith("{")).toBe(true);
    expect(json.includes('"gold"')).toBe(false);
    const parsed = parseM0cFile(json);
    expect(parsed.format).toBe("m0c");
    expect("gold" in parsed).toBe(false);
  });

  it("round-trips multi-line markdown agent prose (lists / table / fenced code survive)", () => {
    const question =
      "## c002 — rebuilt per your notes\n\n" +
      "**Changes**\n" +
      "- removed the Range pill\n" +
      "- added a Subtitle under the title\n\n" +
      "| col | aligns under |\n|-----|--------------|\n| #   | Rank         |\n\n" +
      "```ts\nconst aspect = 1.81;\n```\n\n" +
      "Skeleton good to build from?";
    const responseBody = "Yes — ship it.\n\n- widen the # column\n- tighten row height";

    const json = serializeM0cFile({
      m0: "F",
      created: FIXED_DATE,
      agent: {
        note: "contributor-table c002:\ndropped pill, +subtitle, +rank cell.",
        question,
        response: { body: responseBody, from: "human:quentin" },
      },
    });

    const parsed = parseM0cFile(json);
    // Newlines (and therefore markdown block structure) survive the JSON round-trip.
    expect(parsed.agent?.question).toBe(question);
    expect(parsed.agent?.response?.body).toBe(responseBody);
    expect(parsed.agent?.note).toContain("\n");
    expect(parsed.agent?.question).toContain("| # ");
  });
});

describe("m0 validation + canonicalization contract", () => {
  // The official methods accept canonical OR pretty DSL, always emit/return
  // canonical, and never let invalid m0 through (serialize or parse).

  it("serializeM0cFile rejects invalid m0 (child-count mismatch)", () => {
    expect(() => serializeM0cFile({ m0: "2[1]", created: FIXED_DATE })).toThrow(
      /invalid m0 layout/,
    );
  });

  it("serializeM0cFile rejects invalid m0 (illegal characters)", () => {
    expect(() => serializeM0cFile({ m0: "@@@", created: FIXED_DATE })).toThrow(
      /invalid m0 layout/,
    );
  });

  it("serializeM0cFile canonicalizes pretty input on emit (no pretty form in files)", () => {
    const json = serializeM0cFile({ m0: "2[F,F]", created: FIXED_DATE });
    expect(JSON.parse(json).m0).toBe("2[1,1]");
  });

  it("parseM0cFile accepts pretty DSL but returns canonical", () => {
    const input = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-06-15T12:30:00.000+02:00",
      m0: "2[F,F]",
    });
    expect(parseM0cFile(input).m0).toBe("2[1,1]");
  });

  it("parseM0cFile rejects a file carrying invalid m0", () => {
    const input = JSON.stringify({
      format: "m0c",
      version: 1,
      created: "2025-06-15T12:30:00.000+02:00",
      m0: "2[1,1,1]",
    });
    expect(() => parseM0cFile(input)).toThrow(/invalid m0 layout/);
  });
});
