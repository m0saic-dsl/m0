import { parseM0vFile, serializeM0vFile } from "./m0vFile";
import type { M0vFile } from "../types";

const FIXED_DATE = new Date("2026-05-14T12:00:00.000Z");

describe("serializeM0vFile / parseM0vFile (3d.4a)", () => {
  // ───────────────────────────────────────────────────────────
  // Serialize — happy path + normalization
  // ───────────────────────────────────────────────────────────

  describe("serialize", () => {
    test("minimal: outputs only", () => {
      const json = serializeM0vFile({
        outputs: { desktop: { target: "web-mp4" } },
        created: FIXED_DATE,
      });
      const parsed = JSON.parse(json);
      expect(parsed.format).toBe("m0v");
      expect(parsed.version).toBe(1);
      expect(parsed.created).toBe("2026-05-14T12:00:00.000Z");
      expect(parsed.outputs).toEqual({ desktop: { target: "web-mp4" } });
      expect(parsed.app).toBeNull();
      expect(parsed.appVersion).toBeNull();
      expect(parsed.meta).toBeNull();
      expect(parsed.custom).toBeNull();
    });

    test("minimal: no slots → custom-only / empty vocab still valid", () => {
      // An empty .m0v is a valid placeholder (e.g. a brand stubbing
      // out their vocab file ahead of populating it). Verifies the
      // additive design — every first-class slot is omittable.
      const json = serializeM0vFile({ created: FIXED_DATE });
      const parsed = JSON.parse(json);
      expect(parsed).not.toHaveProperty("outputs");
      expect(parsed).not.toHaveProperty("assets");
      expect(parsed.custom).toBeNull();
      const reparsed = parseM0vFile(json);
      expect(reparsed.outputs).toBeUndefined();
      expect(reparsed.assets).toBeUndefined();
    });

    test("full payload round-trips", () => {
      const json = serializeM0vFile({
        outputs: {
          desktop: { target: "web-mp4", size: { width: 1920, height: 1080 } },
          mobile: { target: "web-mp4", size: { width: 720, height: 1280 } },
          "alpha-master": { target: "alpha-mov" },
        },
        created: FIXED_DATE,
        app: "m0saic",
        appVersion: "1.0.0",
        meta: { title: "Brand bundle", author: "Studio X" },
        custom: { brand: "acme", revision: 7 },
      });
      const parsed = parseM0vFile(json);
      expect(parsed.outputs).toHaveProperty("desktop");
      expect(parsed.outputs).toHaveProperty("mobile");
      expect(parsed.outputs).toHaveProperty("alpha-master");
      expect(parsed.app).toBe("m0saic");
      expect(parsed.appVersion).toBe("1.0.0");
      expect(parsed.meta).toEqual({ title: "Brand bundle", author: "Studio X" });
      expect(parsed.custom).toEqual({ brand: "acme", revision: 7 });
    });

    test("trims whitespace from app / appVersion", () => {
      const json = serializeM0vFile({
        outputs: { desktop: {} },
        app: "  m0saic  ",
        appVersion: "  1.0.0  ",
      });
      const parsed = JSON.parse(json);
      expect(parsed.app).toBe("m0saic");
      expect(parsed.appVersion).toBe("1.0.0");
    });

    test("blank app / appVersion serialize as null", () => {
      const json = serializeM0vFile({
        outputs: { desktop: {} },
        app: "   ",
        appVersion: "",
      });
      const parsed = JSON.parse(json);
      expect(parsed.app).toBeNull();
      expect(parsed.appVersion).toBeNull();
    });

    test("meta drops blank fields, returns null if all blank", () => {
      const json = serializeM0vFile({
        outputs: { desktop: {} },
        meta: { title: "  ", author: "Studio X", source: "", note: "  " },
      });
      const parsed = JSON.parse(json);
      expect(parsed.meta).toEqual({ author: "Studio X" });
    });

    test("meta returns null when all fields blank", () => {
      const json = serializeM0vFile({
        outputs: { desktop: {} },
        meta: { title: "  ", author: "", source: "", note: "  " },
      });
      const parsed = JSON.parse(json);
      expect(parsed.meta).toBeNull();
    });

    test("created defaults to now when omitted", () => {
      const before = Date.now();
      const json = serializeM0vFile({ outputs: { d: {} } });
      const after = Date.now();
      const parsed = JSON.parse(json);
      const parsedMs = new Date(parsed.created).getTime();
      expect(parsedMs).toBeGreaterThanOrEqual(before);
      expect(parsedMs).toBeLessThanOrEqual(after);
    });

    test("custom round-trips arbitrary JSON values", () => {
      const json = serializeM0vFile({
        outputs: { d: {} },
        custom: { a: 1, b: [2, 3], c: { d: null } },
      });
      const parsed = parseM0vFile(json);
      expect(parsed.custom).toEqual({ a: 1, b: [2, 3], c: { d: null } });
    });

    test("trailing newline appended", () => {
      const json = serializeM0vFile({ outputs: { d: {} } });
      expect(json.endsWith("\n")).toBe(true);
    });

    test("throws on null outputs", () => {
      expect(() => serializeM0vFile({ outputs: null as any })).toThrow(
        /outputs must be an object map when provided/,
      );
    });

    test("throws on array outputs", () => {
      expect(() => serializeM0vFile({ outputs: [] as any })).toThrow(
        /outputs must be an object map when provided/,
      );
    });

    test("throws on non-object outputs", () => {
      expect(() => serializeM0vFile({ outputs: "not-an-object" as any })).toThrow(
        /outputs must be an object map when provided/,
      );
    });
  });

  // ───────────────────────────────────────────────────────────
  // Parse — happy path
  // ───────────────────────────────────────────────────────────

  describe("parse — happy path", () => {
    test("parses a minimal valid file", () => {
      const json = JSON.stringify({
        format: "m0v",
        version: 1,
        created: "2026-05-14T12:00:00.000Z",
        outputs: { desktop: { target: "web-mp4" } },
      });
      const parsed = parseM0vFile(json);
      expect(parsed).toEqual({
        format: "m0v",
        version: 1,
        created: "2026-05-14T12:00:00.000Z",
        app: null,
        appVersion: null,
        meta: null,
        outputs: { desktop: { target: "web-mp4" } },
        custom: null,
      });
    });

    test("parses a file with no slots (empty vocab)", () => {
      const json = JSON.stringify({
        format: "m0v",
        version: 1,
        created: "2026-05-14T12:00:00.000Z",
      });
      const parsed = parseM0vFile(json);
      expect(parsed.outputs).toBeUndefined();
      expect(parsed.assets).toBeUndefined();
      expect(parsed.custom).toBeNull();
    });

    test("parses a full file with all fields", () => {
      const json = JSON.stringify({
        format: "m0v",
        version: 1,
        created: "2026-05-14T12:00:00.000Z",
        app: "m0saic",
        appVersion: "1.0.0",
        meta: { title: "Brand bundle", author: "Studio X", source: "internal", note: "v7" },
        outputs: { desktop: { target: "web-mp4" } },
        custom: { brand: "acme" },
      });
      const parsed = parseM0vFile(json);
      expect(parsed.meta).toEqual({
        title: "Brand bundle",
        author: "Studio X",
        source: "internal",
        note: "v7",
      });
      expect(parsed.custom).toEqual({ brand: "acme" });
    });

    test("custom missing → defaults to null", () => {
      const json = JSON.stringify({
        format: "m0v",
        version: 1,
        created: "2026-05-14T12:00:00.000Z",
        outputs: {},
      });
      const parsed = parseM0vFile(json);
      expect(parsed.custom).toBeNull();
    });

    test("custom: false preserved (not converted to null)", () => {
      const json = JSON.stringify({
        format: "m0v",
        version: 1,
        created: "2026-05-14T12:00:00.000Z",
        outputs: {},
        custom: false,
      });
      const parsed = parseM0vFile(json);
      expect(parsed.custom).toBe(false);
    });

    test("empty outputs map is valid", () => {
      const json = JSON.stringify({
        format: "m0v",
        version: 1,
        created: "2026-05-14T12:00:00.000Z",
        outputs: {},
      });
      const parsed = parseM0vFile(json);
      expect(parsed.outputs).toEqual({});
    });
  });

  // ───────────────────────────────────────────────────────────
  // Parse — malformed input
  // ───────────────────────────────────────────────────────────

  describe("parse — malformed input", () => {
    test("throws on non-string input", () => {
      expect(() => parseM0vFile(42 as any)).toThrow(/must be a string/);
    });

    test("throws on invalid JSON", () => {
      expect(() => parseM0vFile("{ not json")).toThrow(/invalid JSON/);
    });

    test("throws on JSON array input", () => {
      expect(() => parseM0vFile("[]")).toThrow(/expected JSON object/);
    });

    test("throws on JSON primitive input", () => {
      expect(() => parseM0vFile('"just a string"')).toThrow(/expected JSON object/);
    });

    test("throws on missing format", () => {
      const json = JSON.stringify({ version: 1, created: "x", outputs: {} });
      expect(() => parseM0vFile(json)).toThrow(/expected format "m0v"/);
    });

    test("throws on wrong format value", () => {
      const json = JSON.stringify({ format: "m0c", version: 1, created: "x", outputs: {} });
      expect(() => parseM0vFile(json)).toThrow(/expected format "m0v", got "m0c"/);
    });

    test("throws on missing version", () => {
      const json = JSON.stringify({ format: "m0v", created: "x", outputs: {} });
      expect(() => parseM0vFile(json)).toThrow(/expected version 1/);
    });

    test("throws on wrong version", () => {
      const json = JSON.stringify({ format: "m0v", version: 2, created: "x", outputs: {} });
      expect(() => parseM0vFile(json)).toThrow(/expected version 1, got 2/);
    });

    test("throws on missing created", () => {
      const json = JSON.stringify({ format: "m0v", version: 1, outputs: {} });
      expect(() => parseM0vFile(json)).toThrow(/missing created/);
    });

    test("throws on blank created", () => {
      const json = JSON.stringify({
        format: "m0v",
        version: 1,
        created: "   ",
        outputs: {},
      });
      expect(() => parseM0vFile(json)).toThrow(/missing created/);
    });

    test("throws on null outputs (use omit instead)", () => {
      const json = JSON.stringify({
        format: "m0v",
        version: 1,
        created: "2026-05-14T12:00:00.000Z",
        outputs: null,
      });
      expect(() => parseM0vFile(json)).toThrow(/invalid outputs.*null/);
    });

    test("throws on array outputs", () => {
      const json = JSON.stringify({
        format: "m0v",
        version: 1,
        created: "2026-05-14T12:00:00.000Z",
        outputs: [],
      });
      expect(() => parseM0vFile(json)).toThrow(/invalid outputs.*array/);
    });

    test("throws on string outputs", () => {
      const json = JSON.stringify({
        format: "m0v",
        version: 1,
        created: "2026-05-14T12:00:00.000Z",
        outputs: "not-an-object",
      });
      expect(() => parseM0vFile(json)).toThrow(/invalid outputs.*string/);
    });

    test("throws on non-object meta", () => {
      const json = JSON.stringify({
        format: "m0v",
        version: 1,
        created: "2026-05-14T12:00:00.000Z",
        outputs: {},
        meta: "not-an-object",
      });
      expect(() => parseM0vFile(json)).toThrow(/invalid meta/);
    });

    test("non-string app field → parses as null", () => {
      const json = JSON.stringify({
        format: "m0v",
        version: 1,
        created: "2026-05-14T12:00:00.000Z",
        outputs: {},
        app: 42,
      });
      const parsed = parseM0vFile(json);
      expect(parsed.app).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────
  // Round-trip — serialize then parse must yield equivalent shape
  // ───────────────────────────────────────────────────────────

  describe("round-trip", () => {
    test("serialize → parse preserves the full envelope", () => {
      const input = {
        outputs: {
          desktop: { target: "web-mp4", size: { width: 1920, height: 1080 }, fps: 60 },
          mobile: { target: "web-mp4", size: { width: 720, height: 1280 } },
          "alpha-master": { target: "alpha-mov" },
        },
        created: FIXED_DATE,
        app: "m0saic",
        appVersion: "1.2.3",
        meta: { title: "Brand v7", author: "Studio X" },
        custom: { tag: "rev-7", flags: [true, false] },
      };
      const json = serializeM0vFile(input);
      const parsed: M0vFile = parseM0vFile(json);
      expect(parsed).toEqual({
        format: "m0v",
        version: 1,
        created: "2026-05-14T12:00:00.000Z",
        app: "m0saic",
        appVersion: "1.2.3",
        meta: { title: "Brand v7", author: "Studio X" },
        outputs: input.outputs,
        custom: input.custom,
      });
    });

    test("serialize → parse → serialize is idempotent", () => {
      const input = {
        outputs: { desktop: { target: "web-mp4" } },
        created: FIXED_DATE,
        app: "m0saic",
        appVersion: "1.0.0",
        meta: { title: "Brand" },
      };
      const json1 = serializeM0vFile(input);
      const parsed = parseM0vFile(json1);
      const json2 = serializeM0vFile({
        outputs: parsed.outputs,
        created: new Date(parsed.created),
        app: parsed.app,
        appVersion: parsed.appVersion,
        meta: parsed.meta,
        custom: parsed.custom,
      });
      expect(json2).toBe(json1);
    });
  });

  // ───────────────────────────────────────────────────────────
  // Assets — shared asset bundle for vocabulary files
  // ───────────────────────────────────────────────────────────

  describe("assets", () => {
    test("round-trips a vocabulary with assets", () => {
      const input = {
        outputs: { desktop: { target: "web-mp4" } },
        assets: {
          companyLogo: { kind: "file", path: "C:\\brand\\logo.png", mediaType: "image" },
          themeMusic: { kind: "file", path: "C:\\brand\\theme.wav", mediaType: "audio" },
        },
        created: FIXED_DATE,
      };
      const json = serializeM0vFile(input);
      const parsed = parseM0vFile(json);
      expect(parsed.assets).toEqual(input.assets);
    });

    test("omits assets from JSON when not provided", () => {
      const json = serializeM0vFile({ outputs: { d: {} }, created: FIXED_DATE });
      expect(JSON.parse(json)).not.toHaveProperty("assets");
      const parsed = parseM0vFile(json);
      expect(parsed.assets).toBeUndefined();
    });

    test("omits assets from JSON when an empty object is passed", () => {
      const json = serializeM0vFile({ outputs: { d: {} }, assets: {}, created: FIXED_DATE });
      expect(JSON.parse(json)).not.toHaveProperty("assets");
    });

    test("assets-only vocabulary (outputs omitted)", () => {
      const json = serializeM0vFile({
        assets: { companyLogo: { kind: "file", path: "C:\\brand\\logo.png", mediaType: "image" } },
        created: FIXED_DATE,
      });
      const parsedJson = JSON.parse(json);
      expect(parsedJson).not.toHaveProperty("outputs");
      expect(parsedJson.assets).toHaveProperty("companyLogo");
      const parsed = parseM0vFile(json);
      expect(parsed.outputs).toBeUndefined();
      expect(parsed.assets).toHaveProperty("companyLogo");
    });

    test("omits outputs from JSON when an empty object is passed", () => {
      const json = serializeM0vFile({ outputs: {}, created: FIXED_DATE });
      expect(JSON.parse(json)).not.toHaveProperty("outputs");
    });

    test("serializer throws on null assets", () => {
      expect(() =>
        serializeM0vFile({ outputs: { d: {} }, assets: null as any }),
      ).toThrow(/assets must be an object map/);
    });

    test("serializer throws on array assets", () => {
      expect(() =>
        serializeM0vFile({ outputs: { d: {} }, assets: [] as any }),
      ).toThrow(/assets must be an object map/);
    });

    test("parser throws on null assets", () => {
      const json = JSON.stringify({
        format: "m0v",
        version: 1,
        created: "2026-05-14T12:00:00.000Z",
        outputs: {},
        assets: null,
      });
      expect(() => parseM0vFile(json)).toThrow(/invalid assets.*null/);
    });

    test("parser throws on array assets", () => {
      const json = JSON.stringify({
        format: "m0v",
        version: 1,
        created: "2026-05-14T12:00:00.000Z",
        outputs: {},
        assets: [],
      });
      expect(() => parseM0vFile(json)).toThrow(/invalid assets.*array/);
    });
  });
});
