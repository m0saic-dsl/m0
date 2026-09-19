import {
  collapseAgentProse,
  mintAgentId,
  normalizeAgentProse,
  normalizeCandidateContext,
} from "./agent";

describe("normalizeAgentProse", () => {
  it("preserves internal line structure (markdown survives)", () => {
    const md = "## Changes\n\n- dropped pill\n- +subtitle\n\n| col | under |\n|-----|-------|\n| #   | Rank  |";
    expect(normalizeAgentProse(md)).toBe(md);
  });

  it("normalizes CRLF to LF", () => {
    expect(normalizeAgentProse("a\r\nb\r\nc")).toBe("a\nb\nc");
  });

  it("strips trailing whitespace per line", () => {
    expect(normalizeAgentProse("a   \nb\t\nc")).toBe("a\nb\nc");
  });

  it("caps blank runs at a single blank line and trims the ends", () => {
    expect(normalizeAgentProse("\n\na\n\n\n\nb\n\n")).toBe("a\n\nb");
  });
});

describe("collapseAgentProse", () => {
  it("flattens prose to a single line (the .m0 transport path)", () => {
    expect(collapseAgentProse("a\nb\n\nc")).toBe("a b c");
  });
});

describe("mintAgentId", () => {
  it("mints an 8-character id", () => {
    const id = mintAgentId();
    expect(id).toHaveLength(8);
    expect(id).toMatch(/^[a-z0-9]+$/);
  });
});

describe("normalizeCandidateContext", () => {
  it("collapses null / undefined to undefined", () => {
    expect(normalizeCandidateContext(null)).toBeUndefined();
    expect(normalizeCandidateContext(undefined)).toBeUndefined();
  });

  it("wraps non-object values under extras.raw", () => {
    expect(normalizeCandidateContext("x")).toEqual({ extras: { raw: "x" } });
    expect(normalizeCandidateContext([1])).toEqual({ extras: { raw: [1] } });
  });

  it("keeps recognized slots and routes unknown fields into extras", () => {
    expect(
      normalizeCandidateContext({ category: "chart", foo: 1, extras: { bar: 2 } }),
    ).toEqual({ category: "chart", extras: { bar: 2, foo: 1 } });
  });

  it("returns undefined for an empty object", () => {
    expect(normalizeCandidateContext({})).toBeUndefined();
  });
});
