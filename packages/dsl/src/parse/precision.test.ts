import {
  computePrecisionFromString,
  computePrecisionFromCanonicalString,
  parseM0StringComplete,
} from "./m0StringParser";

// ─────────────────────────────────────────────────────────────
// computePrecisionFromCanonicalString (internal, canonical input)
// ─────────────────────────────────────────────────────────────

describe("computePrecisionFromCanonicalString", () => {
  it("returns correct result for canonical input", () => {
    const p = computePrecisionFromCanonicalString("2(1,1)");
    expect(p.maxSplitX).toBe(2);
    expect(p.maxSplitY).toBe(1);
    expect(p.maxSplitAny).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────
// computePrecisionFromString (public, handles aliases + whitespace)
// ─────────────────────────────────────────────────────────────

describe("computePrecisionFromString", () => {
  it("canonicalizes input before scanning (whitespace + aliases)", () => {
    const p = computePrecisionFromString(" 2( F , F ) ");
    expect(p.maxSplitX).toBe(2);
    expect(p.maxSplitY).toBe(1);
    expect(p.maxSplitAny).toBe(2);
  });

  it("matches computePrecisionFromCanonicalString for equivalent input", () => {
    const raw = computePrecisionFromString(" 2( F , F ) ");
    const canonical = computePrecisionFromCanonicalString("2(1,1)");
    expect(raw).toEqual(canonical);
  });

  it("returns 1×1 for bare tile '1'", () => {
    const p = computePrecisionFromString("1");
    expect(p.maxSplitX).toBe(1);
    expect(p.maxSplitY).toBe(1);
    expect(p.maxSplitAny).toBe(1);
  });

  it("detects col-split: 100(1,...) sets maxSplitX=100", () => {
    // Build a valid 100-way col-split string
    const children = Array(100).fill("1").join(",");
    const s = `100(${children})`;
    const p = computePrecisionFromString(s);

    expect(p.maxSplitX).toBe(100);
    expect(p.maxSplitY).toBe(1);
    expect(p.maxSplitAny).toBe(100);
  });

  it("detects row-split: 256[...] sets maxSplitY=256", () => {
    const children = Array(256).fill("1").join(",");
    const s = `256[${children}]`;
    const p = computePrecisionFromString(s);

    expect(p.maxSplitX).toBe(1);
    expect(p.maxSplitY).toBe(256);
    expect(p.maxSplitAny).toBe(256);
  });

  it("detects both col and row splits in mixed string", () => {
    // 4(1,1,2[1,1],1)
    const s = "4(1,1,2[1,1],1)";
    const p = computePrecisionFromString(s);

    expect(p.maxSplitX).toBe(4);
    expect(p.maxSplitY).toBe(2);
    expect(p.maxSplitAny).toBe(4);
  });

  it("ignores 0 (primitive, not a classifier count)", () => {
    // 3(0,1,1) — the 0 is a passthrough, not a split count
    const s = "3(0,1,1)";
    const p = computePrecisionFromString(s);

    expect(p.maxSplitX).toBe(3);
    expect(p.maxSplitY).toBe(1);
  });

  it("ignores 1 not followed by ( or [ (bare tile)", () => {
    // "1" alone — the 1 is just a tile, followed by nothing
    const p = computePrecisionFromString("1");
    expect(p.maxSplitX).toBe(1);
    expect(p.maxSplitY).toBe(1);
  });

  it("handles multi-digit numbers", () => {
    const children = Array(12).fill("1").join(",");
    const s = `12(${children})`;
    const p = computePrecisionFromString(s);

    expect(p.maxSplitX).toBe(12);
  });

  it("handles nested splits and picks the max", () => {
    // 2(3(1,1,1),1) → maxSplitX = max(2, 3) = 3
    const s = "2(3(1,1,1),1)";
    const p = computePrecisionFromString(s);

    expect(p.maxSplitX).toBe(3);
  });

  it("handles overlays (numbers inside {} are still scanned)", () => {
    // 1{2(1,1)} — overlay has a 2-way col-split
    const s = "1{2(1,1)}";
    const p = computePrecisionFromString(s);

    expect(p.maxSplitX).toBe(2);
  });

  it("returns 1×1 for empty string", () => {
    const p = computePrecisionFromString("");
    expect(p.maxSplitX).toBe(1);
    expect(p.maxSplitY).toBe(1);
    expect(p.maxSplitAny).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// Precision + warnings in parseM0StringComplete
// ─────────────────────────────────────────────────────────────

describe("parseM0StringComplete — precision & warnings", () => {
  it("always returns precision and warnings on success", () => {
    const r = parseM0StringComplete("2(1,1)", 1000, 500);

    expect(r.precision).toBeDefined();
    expect(r.precision.maxSplitX).toBe(2);
    expect(r.precision.maxSplitY).toBe(1);
    expect(r.precision.maxSplitAny).toBe(2);
    expect(r.warnings).toEqual([]);
  });

  it("returns precision and warnings even for invalid input", () => {
    const r = parseM0StringComplete("bad!", 100, 100);

    expect(r.precision).toBeDefined();
    expect(r.warnings).toBeDefined();
    expect(Array.isArray(r.warnings)).toBe(true);
  });

  it("returns precision and warnings on SPLIT_EXCEEDS_AXIS error", () => {
    const r = parseM0StringComplete("3(1,1,1)", 1, 1);

    expect(r.ok).toBe(false);
    if (!("error" in r)) return;
    expect(r.error.code).toBe("SPLIT_EXCEEDS_AXIS");
    expect(r.precision).toBeDefined();
    expect(r.precision.maxSplitX).toBe(3);
    expect(r.warnings).toBeDefined();
  });

  it("default norm=100 emits warning when maxSplitAny > 100", () => {
    const children = Array(101).fill("1").join(",");
    const s = `101(${children})`;
    const r = parseM0StringComplete(s, 10000, 100);

    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].severity).toBe("warning");
    expect(r.warnings[0].code).toBe("PRECISION_EXCEEDS_NORM");
    expect(r.warnings[0].message).toContain("101");
    expect(r.warnings[0].message).toContain("100");
    expect(r.warnings[0].details).toMatchObject({
      norm: 100,
      maxSplitAny: 101,
    });
  });

  it("no warning when maxSplitAny <= norm", () => {
    const r = parseM0StringComplete("2(1,1)", 1000, 500);
    expect(r.warnings).toEqual([]);
  });

  it("overriding precisionNorm suppresses warning", () => {
    const children = Array(256).fill("1").join(",");
    const s = `256(${children})`;
    const r = parseM0StringComplete(s, 100000, 100, {
      precisionNorm: 256,
    });

    expect(r.warnings).toEqual([]);
  });

  it("overriding precisionNorm can make a lower split trigger a warning", () => {
    // 4(1,1,1,1) with norm=3 → maxSplitAny=4 > 3 → warning
    const r = parseM0StringComplete("4(1,1,1,1)", 1000, 500, {
      precisionNorm: 3,
    });

    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].code).toBe("PRECISION_EXCEEDS_NORM");
  });

  it("SPLIT_EXCEEDS_AXIS error.details includes precision fields", () => {
    const r = parseM0StringComplete("3(1,1,1)", 2, 100);

    expect(r.ok).toBe(false);
    if (!("error" in r)) return;
    expect(r.error.code).toBe("SPLIT_EXCEEDS_AXIS");
    expect(r.error.details).toMatchObject({
      width: 2,
      height: 100,
      maxSplitX: 3,
      maxSplitY: 1,
    });
  });

  it("handles F and > aliases for precision computation", () => {
    // "2(F,F)" canonicalizes to "2(1,1)"
    const r = parseM0StringComplete("2(F,F)", 1000, 500);
    expect(r.precision.maxSplitX).toBe(2);
  });
});
