import { serializeM0cFile, parseM0cFile } from "./m0cFile";
import type { M0cDeriveImage } from "../types";

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
    expect(obj.derive).toEqual({ image: null });
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

  it("embeds derive image when provided (else derive.image is null)", () => {
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
    expect(obj.derive.image).toEqual(deriveImage);
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
      derive: { image: null },
    });

    const file = parseM0cFile(input);
    expect(file.format).toBe("m0c");
    expect(file.version).toBe(1);
    expect(file.size).toBeNull();
    expect(file.m0).toBe("F");
    expect(file.app).toBeNull();
    expect(file.meta).toBeNull();
    expect(file.labels).toBeNull();
    expect(file.derive).toEqual({ image: null });
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
      derive: { image: null },
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
      derive: { image: null },
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
      derive: { image: null },
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
      derive: { image: null },
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
      derive: { image: null },
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
      derive: { image: null },
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
      derive: { image: { mime: "image/png", bytes: 10, b64: "AAAA" } },
    });

    const file = parseM0cFile(input);
    expect(file.app).toBe("test@1.0.0");
    expect(file.meta).toEqual({ title: "Hello" });
    expect(file.labels).toEqual({ [K1]: { text: "hero" } });
    expect(file.derive.image?.mime).toBe("image/png");
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
      derive: { image: null },
      customField: "ignored",
    });

    const file = parseM0cFile(input);
    expect(file.m0).toBe("F");
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
    expect(file.derive.image).toEqual(deriveImage);
  });
});

describe("derive image base64 roundtrip", () => {
  it("bytes field matches decoded length", () => {
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
    const decoded = Buffer.from(file.derive.image!.b64, "base64");
    expect(decoded.byteLength).toBe(file.derive.image!.bytes);
    expect(decoded.byteLength).toBe(bytes.length);
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });
});
