import { formatISO, serializeM0File } from "./serializeM0File";
import { parseM0File } from "./parseM0File";

const FIXED_DATE = new Date("2025-06-15T12:30:00.000+02:00");
const CREATED_STR = "2025-06-15T12:30:00.000+02:00";

describe("serializeM0File", () => {
  it("contains required header keys in order (created required)", () => {
    const out = serializeM0File({
      m0: "1",
      size: { width: 1920, height: 1080 },
      created: FIXED_DATE,
    });

    const lines = out.split("\n");
    expect(lines[0]).toBe("# m0");
    expect(lines[1]).toBe("# version: 1");
    expect(lines[2]).toBe(`# created: ${formatISO(FIXED_DATE)}`);
    expect(lines[3]).toBe("# size: 1920x1080");
  });

  it("has exactly one blank line before payload", () => {
    const out = serializeM0File({
      m0: "1",
      size: { width: 1920, height: 1080 },
      created: FIXED_DATE,
    });

    const lines = out.split("\n");
    const blankIdx = lines.indexOf("");
    expect(blankIdx).toBeGreaterThan(0);

    expect(lines[blankIdx + 1]).toBe("1");

    const headerLines = lines.slice(0, blankIdx);
    expect(headerLines.every((l) => l.startsWith("#"))).toBe(true);
  });

  it("ends with a newline", () => {
    const out = serializeM0File({
      m0: "1",
      size: { width: 1920, height: 1080 },
      created: FIXED_DATE,
    });
    expect(out.endsWith("\n")).toBe(true);
  });

  it("omits optional header lines when not provided (size/app/meta)", () => {
    const out = serializeM0File({
      m0: "1",
      created: FIXED_DATE,
      size: null,
      app: null,
      meta: null,
    });

    expect(out).not.toContain("# size:");
    expect(out).not.toContain("# app:");
    expect(out).not.toContain("# title:");
    expect(out).not.toContain("# author:");
    expect(out).not.toContain("# source:");
    expect(out).not.toContain("# note:");
  });

  it("includes app and meta fields when provided", () => {
    const out = serializeM0File({
      m0: "1",
      size: { width: 1920, height: 1080 },
      created: FIXED_DATE,
      app: "m0saic-web@0.12.0",
      meta: { title: "My Layout", author: "Test" },
    });

    expect(out).toContain("# app: m0saic-web@0.12.0");
    expect(out).toContain("# title: My Layout");
    expect(out).toContain("# author: Test");
  });

  it("trims the m0saic payload", () => {
    const out = serializeM0File({
      m0: "  1  ",
      size: { width: 100, height: 100 },
      created: FIXED_DATE,
    });

    const lines = out.split("\n");
    const blankIdx = lines.indexOf("");
    expect(lines[blankIdx + 1]).toBe("1");
  });

  it("throws on invalid size when provided", () => {
    expect(() =>
      serializeM0File({
        m0: "1",
        size: { width: 0, height: 100 },
        created: FIXED_DATE,
      })
    ).toThrow("width must be a positive integer");

    expect(() =>
      serializeM0File({
        m0: "1",
        size: { width: 100, height: -1 },
        created: FIXED_DATE,
      })
    ).toThrow("height must be a positive integer");
  });
});

describe("parseM0File", () => {
  it("parses a serialized file correctly (normalizes to nulls)", () => {
    const result = parseM0File(
      [
        "# m0",
        "# version: 1",
        "# size: 1920x1080",
        `# created: ${CREATED_STR}`,
        "",
        "1",
        "",
      ].join("\n")
    );

    expect(result.version).toBe(1);
    expect(result.m0).toBe("1");
    expect(result.size).toEqual({ width: 1920, height: 1080 });
    expect(result.created).toBe(CREATED_STR);

    // null-stable fields
    expect(result.app).toBeNull();
    expect(result.meta).toBeNull();
  });

  it("throws on empty payload", () => {
    expect(() =>
      parseM0File(
        ["# m0", "# version: 1", `# created: ${CREATED_STR}`, ""].join("\n")
      )
    ).toThrow("payload is empty");
  });

  it('throws if required "created" header is missing', () => {
    expect(() => parseM0File(["# m0", "# version: 1", "", "1"].join("\n"))).toThrow(
      'missing required header "created"'
    );
  });

  it("rejects unsupported version", () => {
    expect(() =>
      parseM0File(
        ["# m0", "# version: 2", `# created: ${CREATED_STR}`, "", "1"].join("\n")
      )
    ).toThrow("unsupported version");
  });

  it("ignores unknown header keys", () => {
    const result = parseM0File(
      ["# m0", "# foo: bar", "# baz: qux", `# created: ${CREATED_STR}`, "", "1"].join(
        "\n"
      )
    );

    expect(result.m0).toBe("1");
    expect(result.meta).toBeNull();
    expect(result.app).toBeNull();
    expect(result.size).toBeNull();
  });

  it("supports wrapped payload across multiple lines by joining them", () => {
    const result = parseM0File(
      [
        "# m0",
        "# version: 1",
        `# created: ${CREATED_STR}`,
        "",
        "12(",
        "1,1)",
      ].join("\n")
    );

    expect(result.m0).toBe("12(1,1)");
  });

  it("parses app + typed meta fields", () => {
    const result = parseM0File(
      [
        "# m0",
        "# version: 1",
        `# created: ${CREATED_STR}`,
        "# app: test@1.0.0",
        "# title: My Title",
        "# author: Me",
        "# source: unit-test",
        "# note: hello",
        "",
        "1",
      ].join("\n")
    );

    expect(result.app).toBe("test@1.0.0");
    expect(result.meta).toEqual({
      title: "My Title",
      author: "Me",
      source: "unit-test",
      note: "hello",
    });
  });

  it("normalizes empty app/meta to null", () => {
    const result = parseM0File(
      [
        "# m0",
        "# version: 1",
        `# created: ${CREATED_STR}`,
        "# app:   ",
        "# title:   ",
        "",
        "1",
      ].join("\n")
    );

    expect(result.app).toBeNull();
    expect(result.meta).toBeNull();
  });

  it("rejects invalid size header", () => {
    expect(() =>
      parseM0File(
        ["# m0", "# version: 1", `# created: ${CREATED_STR}`, "# size: 0x1080", "", "1"].join(
          "\n"
        )
      )
    ).toThrow("invalid size");
  });
});

describe("roundtrip", () => {
  it("parse(serialize(...)) roundtrips m0 exactly", () => {
    const m0 = "12(1,1)";
    const serialized = serializeM0File({
      m0,
      size: { width: 1920, height: 1080 },
      created: FIXED_DATE,
    });

    const parsed = parseM0File(serialized);
    expect(parsed.m0).toBe(m0);
  });

  it("roundtrips size when present", () => {
    const serialized = serializeM0File({
      m0: "1",
      size: { width: 3840, height: 2160 },
      created: FIXED_DATE,
    });

    const parsed = parseM0File(serialized);
    expect(parsed.size).toEqual({ width: 3840, height: 2160 });
  });

  it("roundtrips a complex m0 string with app + meta", () => {
    const m0 = "13(1,12(1,1),1)";
    const serialized = serializeM0File({
      m0,
      size: { width: 1080, height: 1920 },
      created: FIXED_DATE,
      app: "test@1.0.0",
      meta: { title: "Complex" },
    });

    const parsed = parseM0File(serialized);
    expect(parsed.m0).toBe(m0);
    expect(parsed.app).toBe("test@1.0.0");
    expect(parsed.meta).toEqual({ title: "Complex" });
  });

  it("roundtrips with size omitted (null)", () => {
    const serialized = serializeM0File({
      m0: "1",
      size: null,
      created: FIXED_DATE,
    });

    const parsed = parseM0File(serialized);
    expect(parsed.size).toBeNull();
  });

  it("roundtrips appVersion", () => {
    const serialized = serializeM0File({
      m0: "1",
      size: { width: 1920, height: 1080 },
      created: FIXED_DATE,
      app: "m0saic-desktop",
      appVersion: "1.0.0",
    });

    const parsed = parseM0File(serialized);
    expect(parsed.appVersion).toBe("1.0.0");
  });
});
