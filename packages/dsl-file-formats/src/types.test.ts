/**
 * Type-level smoke tests — verify all public types are importable
 * and structurally sound. These are compile-time checks; if this
 * file compiles, the types are correctly exported.
 */
import type {
  M0File,
  M0FileMeta,
  M0cFile,
  M0cDeriveImage,
  M0cDeriveImageMime,
  M0pFile,
  M0pVariantEntry,
  M0pRegions,
} from "./types";

describe("types", () => {
  it("M0File has required shape", () => {
    const file: M0File = {
      version: 1,
      created: "2026-01-01T00:00:00.000Z",
      app: null,
      appVersion: null,
      meta: null,
      size: null,
      m0: "1",
    };
    expect(file.version).toBe(1);
    expect(file.m0).toBe("1");
  });

  it("M0cFile has required shape", () => {
    const file: M0cFile = {
      format: "m0c",
      version: 1,
      created: "2026-01-01T00:00:00.000Z",
      app: null,
      appVersion: null,
      meta: null,
      size: null,
      m0: "1",
      labels: null,
      derive: { image: null },
      custom: null,
    };
    expect(file.format).toBe("m0c");
    expect(file.m0).toBe("1");
  });

  it("M0FileMeta fields are all optional", () => {
    const empty: M0FileMeta = {};
    const full: M0FileMeta = {
      title: "t",
      author: "a",
      source: "s",
      note: "n",
    };
    expect(Object.keys(empty)).toHaveLength(0);
    expect(Object.keys(full)).toHaveLength(4);
  });

  it("M0pFile has required shape", () => {
    const variant: M0pVariantEntry = {
      meta: null,
      size: { width: 1920, height: 1080 },
      m0: "1",
      labels: null,
      derive: { image: null },
      custom: null,
    };
    const pack: M0pFile = {
      format: "m0p",
      version: 1,
      created: "2026-04-26T00:00:00.000Z",
      app: null,
      appVersion: null,
      meta: null,
      regions: null,
      custom: null,
      variants: { desktop: variant },
    };
    expect(pack.format).toBe("m0p");
    expect(Object.keys(pack.variants)).toEqual(["desktop"]);
  });

  it("M0pRegions accepts optional description and color", () => {
    const regions: M0pRegions = {
      headline: { description: "primary", color: "#ef7525" },
      hero: {},
    };
    expect(Object.keys(regions)).toHaveLength(2);
  });

  it("M0pVariantEntry allows optional pack-level overrides", () => {
    const v: M0pVariantEntry = {
      meta: null,
      size: { width: 100, height: 100 },
      m0: "1",
      labels: null,
      derive: { image: null },
      custom: null,
      created: "2025-01-01T00:00:00.000Z",
      app: "other",
      appVersion: "9.9.9",
    };
    expect(v.app).toBe("other");
    expect(v.created).toBe("2025-01-01T00:00:00.000Z");
  });

  it("M0cDeriveImage accepts valid MIME types", () => {
    const mimes: M0cDeriveImageMime[] = [
      "image/png",
      "image/jpeg",
      "image/webp",
    ];
    const img: M0cDeriveImage = {
      mime: mimes[0],
      bytes: 1024,
      b64: "abc123",
    };
    expect(img.mime).toBe("image/png");
  });
});
