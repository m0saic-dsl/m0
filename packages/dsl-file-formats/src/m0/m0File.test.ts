import { formatISO, serializeM0File } from "./serializeM0File";
import { parseM0File } from "./parseM0File";
import type { M0AgentMeta } from "../types";

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
        "2[1,",
        "1]",
      ].join("\n")
    );

    expect(result.m0).toBe("2[1,1]");
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
    const m0 = "2[1,1]";
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
    const m0 = "3[1,2[1,1],1]";
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

  it("roundtrips the full m0agent block (note / question / regions / typed context)", () => {
    const agent: M0AgentMeta = {
      note: "Look at the spacing between bands 1 and 2.",
      question: "Are the 80 and 20 labels aligned with their lines?",
      regions: { stk_abc: "title-band", stk_def: "plot" },
      context: {
        category: { kind: "known", value: "spacing-alignment" },
        intent: { summary: "tighten the title band", action: "refine" },
        layoutIntent: "grid",
      },
    };
    const serialized = serializeM0File({
      m0: "1",
      created: FIXED_DATE,
      agent,
    });
    expect(serialized).toContain("# m0agent:note: Look at the spacing between bands 1 and 2.");
    expect(serialized).toContain('# m0agent:regions: {"stk_abc":"title-band","stk_def":"plot"}');

    const parsed = parseM0File(serialized);
    expect(parsed.agent).toEqual(agent);
  });

  it("empty context object does not emit a m0agent:context line", () => {
    const serialized = serializeM0File({
      m0: "1",
      created: FIXED_DATE,
      agent: { context: {} },
    });
    // Should produce a valid file with no `# m0agent:context:` line —
    // empty context is the same as absent, conservatively stripped.
    expect(serialized).not.toContain("# m0agent:context:");
    const parsed = parseM0File(serialized);
    expect(parsed.agent).toBeNull();
  });

  it("non-conforming context fields route into extras (round-trip safety for old files)", () => {
    // Hand-write a legacy-shape header with unrecognized context fields.
    const legacy = [
      "# m0",
      "# version: 1",
      "# created: 2025-06-15T12:30:00.000+02:00",
      "# m0agent:context: " + JSON.stringify({ derivedFrom: "weightedSplit", weights: [10, 79, 21] }),
      "",
      "1",
    ].join("\n");
    const parsed = parseM0File(legacy);
    expect(parsed.agent).toEqual({
      context: { extras: { derivedFrom: "weightedSplit", weights: [10, 79, 21] } },
    });
  });

  it("parser tolerates malformed m0agent:regions JSON by dropping the field", () => {
    const malformed = [
      "# m0",
      "# version: 1",
      "# created: 2025-06-15T12:30:00.000+02:00",
      "# m0agent:note: legit prose",
      "# m0agent:regions: { not-real-json",
      "",
      "1",
    ].join("\n");
    const parsed = parseM0File(malformed);
    expect(parsed.agent).toEqual({ note: "legit prose" });
  });

  it("parser collapses absent agent block to null", () => {
    const serialized = serializeM0File({ m0: "1", created: FIXED_DATE });
    const parsed = parseM0File(serialized);
    expect(parsed.agent).toBeNull();
  });

  it("roundtrips the human response (closes the iteration loop)", () => {
    const agent = {
      note: "Look at the spacing.",
      question: "Are the bands even?",
      response: {
        body: "Yes, they look even now. Move on to the bottom rail.",
        from: "human:quentin",
        at: "2026-06-09T07:30:00.000Z",
      },
    };
    const serialized = serializeM0File({
      m0: "1",
      created: FIXED_DATE,
      agent,
    });
    expect(serialized).toContain('# m0agent:response: {"body"');
    const parsed = parseM0File(serialized);
    expect(parsed.agent).toEqual(agent);
  });

  it("response parser ignores empty / missing body", () => {
    const malformed = [
      "# m0",
      "# version: 1",
      "# created: 2025-06-15T12:30:00.000+02:00",
      `# m0agent:note: note still here`,
      `# m0agent:response: {"body":"","from":"human"}`,
      "",
      "1",
    ].join("\n");
    const parsed = parseM0File(malformed);
    expect(parsed.agent).toEqual({ note: "note still here" });
  });

  it("regions parser drops non-string values (coerces to safe shape)", () => {
    const serialized = [
      "# m0",
      "# version: 1",
      "# created: 2025-06-15T12:30:00.000+02:00",
      `# m0agent:regions: {"stk_a":"good","stk_b":42,"stk_c":"also-good"}`,
      "",
      "1",
    ].join("\n");
    const parsed = parseM0File(serialized);
    expect(parsed.agent?.regions).toEqual({ stk_a: "good", stk_c: "also-good" });
  });

  it("roundtrips the OP id + Reddit-style comments thread (deep-link anchors)", () => {
    const agent = {
      id: "post1234",
      note: "First pass at the bar graph.",
      response: {
        body: "Looks good — ship it.",
        from: "human:quentin",
        at: "2026-06-09T07:30:00.000Z",
      },
      comments: [
        {
          id: "k7mx9q2v",
          body: "Spacing between bars 3 and 4 looks off in dark preset.",
          from: "human:quentin",
          at: "2026-06-09T07:35:00.000Z",
        },
        {
          id: "abc12345",
          body: "@k7mx9q2v same issue in glass preset.",
          from: "agent:claude",
          at: "2026-06-09T07:36:00.000Z",
        },
      ],
    };
    const serialized = serializeM0File({
      m0: "1",
      created: FIXED_DATE,
      agent,
    });
    // Post id appears at the top of the agent block.
    expect(serialized).toContain("# m0agent:id: post1234");
    // Each comment gets its own header line, in insertion order.
    const commentLines = serialized
      .split("\n")
      .filter((l) => l.startsWith("# m0agent:comment:"));
    expect(commentLines).toHaveLength(2);
    expect(commentLines[0]).toContain('"id":"k7mx9q2v"');
    expect(commentLines[1]).toContain('"id":"abc12345"');
    // Round-trip identity.
    const parsed = parseM0File(serialized);
    expect(parsed.agent).toEqual(agent);
  });

  it("comment parser drops malformed entries without losing the rest", () => {
    const serialized = [
      "# m0",
      "# version: 1",
      "# created: 2025-06-15T12:30:00.000+02:00",
      `# m0agent:comment: {"id":"keep1","body":"first"}`,
      `# m0agent:comment: not-real-json`,
      `# m0agent:comment: {"id":"empty","body":""}`,
      `# m0agent:comment: {"id":"keep2","body":"third"}`,
      "",
      "1",
    ].join("\n");
    const parsed = parseM0File(serialized);
    expect(parsed.agent?.comments).toEqual([
      { id: "keep1", body: "first" },
      { id: "keep2", body: "third" },
    ]);
  });
});

describe("m0 validation + canonicalization contract", () => {
  it("serializeM0File rejects invalid m0", () => {
    expect(() => serializeM0File({ m0: "2[1]", created: FIXED_DATE })).toThrow(
      /invalid m0 layout/,
    );
  });

  it("parseM0File rejects a payload that is invalid m0", () => {
    const text = ["# m0", "# version: 1", `# created: ${CREATED_STR}`, "", "2[1,1,1]"].join("\n");
    expect(() => parseM0File(text)).toThrow(/invalid m0 layout/);
  });

  it("parseM0File accepts pretty DSL but returns canonical", () => {
    const text = ["# m0", "# version: 1", `# created: ${CREATED_STR}`, "", "2[F,F]"].join("\n");
    expect(parseM0File(text).m0).toBe("2[1,1]");
  });
});
