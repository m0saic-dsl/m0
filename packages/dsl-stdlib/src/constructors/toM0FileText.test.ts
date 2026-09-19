import { describe, it, expect } from "@jest/globals";
import { parseM0File } from "@m0saic/dsl-file-formats";
import { toM0FileText } from "./toM0FileText";

describe("toM0FileText", () => {
  // Fixed timestamp keeps the test deterministic regardless of when it runs.
  const fixedDate = new Date("2026-06-09T12:00:00.000Z");

  it("produces a parseable .m0 file from a raw m0 string", () => {
    const text = toM0FileText("F{F}", { created: fixedDate });
    const parsed = parseM0File(text);
    expect(parsed.version).toBe(1);
    expect(parsed.created).toBe("2026-06-09T12:00:00.000Z");
    expect(parsed.m0).toBe("1{1}"); // canonicalized: F → 1
  });

  it("includes the size header when supplied", () => {
    const text = toM0FileText("1", {
      created: fixedDate,
      size: { width: 1920, height: 1080 },
    });
    expect(text).toContain("# size: 1920x1080");
    const parsed = parseM0File(text);
    expect(parsed.size).toEqual({ width: 1920, height: 1080 });
  });

  it("emits meta fields when provided", () => {
    const text = toM0FileText("1", {
      created: fixedDate,
      meta: { title: "tick rail v3", note: "candidate" },
    });
    expect(text).toContain("# title: tick rail v3");
    expect(text).toContain("# note: candidate");
  });

  it("throws on an invalid m0 payload", () => {
    expect(() => toM0FileText("not-an-m0-string")).toThrow(/toM0FileText/);
  });

  it("output round-trips through parseM0File without loss of layout", () => {
    const layout = "3[1,1,1{1}]";
    const text = toM0FileText(layout, { created: fixedDate });
    const parsed = parseM0File(text);
    expect(parsed.m0).toBe(layout); // already canonical
  });

  describe("agent metadata", () => {
    it("emits namespaced m0agent headers when supplied", () => {
      const text = toM0FileText("1", {
        created: fixedDate,
        agent: {
          note: "Look at the spacing between bands 1 and 2.",
          question: "Are the 80 and 20 labels aligned with their lines?",
          regions: { "0..9": "title-band", "10..88": "gap-1" },
          context: { derivedFrom: "weightedSplit", weights: [10, 79, 21] },
        },
      });
      expect(text).toContain("# m0agent:note: Look at the spacing between bands 1 and 2.");
      expect(text).toContain("# m0agent:question: Are the 80 and 20 labels aligned with their lines?");
      expect(text).toContain('# m0agent:regions: {"0..9":"title-band","10..88":"gap-1"}');
      // Unrecognized context fields are parked under `extras` by
      // normalizeCandidateContext at the serialization boundary.
      expect(text).toContain('# m0agent:context: {"extras":{"derivedFrom":"weightedSplit","weights":[10,79,21]}}');
    });

    it("collapses newlines in prose values so the header stays single-line", () => {
      const text = toM0FileText("1", {
        created: fixedDate,
        agent: { note: "line one\nline two\rline three" },
      });
      expect(text).toContain("# m0agent:note: line one line two line three");
    });

    it("omits empty agent fields entirely", () => {
      const text = toM0FileText("1", {
        created: fixedDate,
        agent: { note: "", question: "   " },
      });
      expect(text).not.toContain("m0agent:note");
      expect(text).not.toContain("m0agent:question");
    });

    it("agent headers do NOT break parseM0File round-trip", () => {
      const text = toM0FileText("F{F}", {
        created: fixedDate,
        agent: { note: "candidate v3", context: { foo: 1 } },
      });
      const parsed = parseM0File(text);
      expect(parsed.m0).toBe("1{1}");
      expect(parsed.created).toBe("2026-06-09T12:00:00.000Z");
    });
  });
});
