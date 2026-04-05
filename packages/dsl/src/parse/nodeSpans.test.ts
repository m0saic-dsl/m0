import { computeNodeSpansByPath, parseM0StringComplete } from "./m0StringParser";

/**
 * Helper: assert that the span recorded for `path` slices back to the
 * expected substring of the input.
 *
 * Using substring-based assertions makes the tests resilient to minor
 * position shifts if the walker ever changes, and is much easier to
 * read than raw { start, end } pairs.
 */
function expectSpan(s: string, path: string, expected: string) {
  const map = computeNodeSpansByPath(s);
  const span = map.get(path);
  expect(span).toBeDefined();
  expect(s.substring(span!.start, span!.end)).toBe(expected);
}

// ─── A) Leaf roots ───────────────────────────────────────────────

describe("computeNodeSpansByPath — leaf roots", () => {
  it("bare tile F", () => expectSpan("F", "root", "F"));
  it("bare tile 1", () => expectSpan("1", "root", "1"));
});

// ─── B) Simple containers ────────────────────────────────────────

describe("computeNodeSpansByPath — simple containers", () => {
  it("2(F,F) root covers full expression", () => {
    expectSpan("2(F,F)", "root", "2(F,F)");
  });

  it("2(F,F) children are leaves", () => {
    expectSpan("2(F,F)", "root.0", "F");
    expectSpan("2(F,F)", "root.1", "F");
  });

  it("2[1,1] vertical split", () => {
    expectSpan("2[1,1]", "root", "2[1,1]");
    expectSpan("2[1,1]", "root.0", "1");
    expectSpan("2[1,1]", "root.1", "1");
  });

  it("3(1,0,-) flat 3-child", () => {
    expectSpan("3(1,0,-)", "root", "3(1,0,-)");
    expectSpan("3(1,0,-)", "root.0", "1");
    expectSpan("3(1,0,-)", "root.1", "0");
    expectSpan("3(1,0,-)", "root.2", "-");
  });

  it("nested 2[2(1,1),1]", () => {
    expectSpan("2[2(1,1),1]", "root", "2[2(1,1),1]");
    expectSpan("2[2(1,1),1]", "root.0", "2(1,1)");
    expectSpan("2[2(1,1),1]", "root.0.0", "1");
    expectSpan("2[2(1,1),1]", "root.0.1", "1");
    expectSpan("2[2(1,1),1]", "root.1", "1");
  });

  it("deeply nested 2(2[1,1],2[1,1])", () => {
    expectSpan("2(2[1,1],2[1,1])", "root", "2(2[1,1],2[1,1])");
    expectSpan("2(2[1,1],2[1,1])", "root.0", "2[1,1]");
    expectSpan("2(2[1,1],2[1,1])", "root.1", "2[1,1]");
    expectSpan("2(2[1,1],2[1,1])", "root.0.0", "1");
    expectSpan("2(2[1,1],2[1,1])", "root.0.1", "1");
    expectSpan("2(2[1,1],2[1,1])", "root.1.0", "1");
    expectSpan("2(2[1,1],2[1,1])", "root.1.1", "1");
  });
});

// ─── C) Multi-digit count ────────────────────────────────────────

describe("computeNodeSpansByPath — multi-digit count", () => {
  it("10(0,0,0,0,0,0,0,0,0,F) root covers full expression", () => {
    const s = "10(0,0,0,0,0,0,0,0,0,F)";
    expectSpan(s, "root", s);
  });

  it("10(…) first and last children", () => {
    const s = "10(0,0,0,0,0,0,0,0,0,F)";
    expectSpan(s, "root.0", "0");
    expectSpan(s, "root.9", "F");
  });

  it("10(…) has exactly 10 child entries", () => {
    const s = "10(0,0,0,0,0,0,0,0,0,F)";
    const map = computeNodeSpansByPath(s);
    for (let i = 0; i < 10; i++) {
      expect(map.has(`root.${i}`)).toBe(true);
    }
    expect(map.has("root.10")).toBe(false);
  });

  it("12-count starting with 1 is container, not leaf", () => {
    const s = "12(1,1,1,1,1,1,1,1,1,1,1,1)";
    expectSpan(s, "root", s);
    expectSpan(s, "root.0", "1");
    expectSpan(s, "root.11", "1");
  });
});

// ─── D) Overlay on leaf ──────────────────────────────────────────

describe("computeNodeSpansByPath — overlay on leaf", () => {
  it("F{F} base leaf + overlay inner content", () => {
    // base leaf 'F' at position 0
    expectSpan("F{F}", "root", "F");
    // overlay inner content is just 'F' (the tile inside the braces)
    expectSpan("F{F}", "root.ov1.0", "F");
    // brace-inclusive wrapper span is on the .ov1 key (no .0)
    expectSpan("F{F}", "root.ov1", "{F}");
  });

  it("1{2(1,1)} overlay inner content is the container", () => {
    expectSpan("1{2(1,1)}", "root", "1");
    // inner content = the container expression without braces
    expectSpan("1{2(1,1)}", "root.ov1.0", "2(1,1)");
    // brace-inclusive wrapper on .ov1
    expectSpan("1{2(1,1)}", "root.ov1", "{2(1,1)}");
  });

  it("overlay children inside F{2(F,F)}", () => {
    // overlay inner root is the container 2(F,F)
    expectSpan("F{2(F,F)}", "root.ov1.0", "2(F,F)");
    // brace-inclusive wrapper
    expectSpan("F{2(F,F)}", "root.ov1", "{2(F,F)}");
    // Inner children of the overlay's root node
    expectSpan("F{2(F,F)}", "root.ov1.0.0", "F");
    expectSpan("F{2(F,F)}", "root.ov1.0.1", "F");
  });
});

// ─── E) Overlay on group + nested overlay ────────────────────────

describe("computeNodeSpansByPath — overlay on group + nested overlay", () => {
  it("2(F,F){F} group overlay", () => {
    expectSpan("2(F,F){F}", "root", "2(F,F)");
    expectSpan("2(F,F){F}", "root.0", "F");
    expectSpan("2(F,F){F}", "root.1", "F");
    // overlay inner content is just F
    expectSpan("2(F,F){F}", "root.ov1.0", "F");
    // brace-inclusive wrapper
    expectSpan("2(F,F){F}", "root.ov1", "{F}");
  });

  it("2(F{F},F) overlay on child within container", () => {
    expectSpan("2(F{F},F)", "root", "2(F{F},F)");
    expectSpan("2(F{F},F)", "root.0", "F");
    // overlay inner content
    expectSpan("2(F{F},F)", "root.0.ov1.0", "F");
    // brace-inclusive wrapper
    expectSpan("2(F{F},F)", "root.0.ov1", "{F}");
    expectSpan("2(F{F},F)", "root.1", "F");
  });

  it("F{F{F}} nested overlay (depth 2)", () => {
    // base leaf
    expectSpan("F{F{F}}", "root", "F");
    // first overlay inner content is F (the leaf that has a nested overlay)
    expectSpan("F{F{F}}", "root.ov1.0", "F");
    // first brace-inclusive wrapper
    expectSpan("F{F{F}}", "root.ov1", "{F{F}}");
    // nested overlay inner content
    expectSpan("F{F{F}}", "root.ov1.0.ov2.0", "F");
    // nested brace-inclusive wrapper
    expectSpan("F{F{F}}", "root.ov1.0.ov2", "{F}");
  });
});

// ─── F) Edge cases ───────────────────────────────────────────────

describe("computeNodeSpansByPath — edge cases", () => {
  it("empty string returns empty map", () => {
    expect(computeNodeSpansByPath("").size).toBe(0);
  });

  it("overlay with container inside 0{3(1,1,1)}", () => {
    expectSpan("0{3(1,1,1)}", "root", "0");
    // overlay inner content = container without braces
    expectSpan("0{3(1,1,1)}", "root.ov1.0", "3(1,1,1)");
    // brace-inclusive wrapper
    expectSpan("0{3(1,1,1)}", "root.ov1", "{3(1,1,1)}");
    expectSpan("0{3(1,1,1)}", "root.ov1.0.0", "1");
    expectSpan("0{3(1,1,1)}", "root.ov1.0.1", "1");
    expectSpan("0{3(1,1,1)}", "root.ov1.0.2", "1");
  });

  it("3(1,0{2(1,1)},1) overlay on middle child", () => {
    expectSpan("3(1,0{2(1,1)},1)", "root", "3(1,0{2(1,1)},1)");
    expectSpan("3(1,0{2(1,1)},1)", "root.0", "1");
    expectSpan("3(1,0{2(1,1)},1)", "root.1", "0");
    // overlay inner content = container without braces
    expectSpan("3(1,0{2(1,1)},1)", "root.1.ov1.0", "2(1,1)");
    // brace-inclusive wrapper
    expectSpan("3(1,0{2(1,1)},1)", "root.1.ov1", "{2(1,1)}");
    expectSpan("3(1,0{2(1,1)},1)", "root.1.ov1.0.0", "1");
    expectSpan("3(1,0{2(1,1)},1)", "root.1.ov1.0.1", "1");
    expectSpan("3(1,0{2(1,1)},1)", "root.2", "1");
  });
});

// ─── G) End-to-end: overlay tile at depth 1 gets span at index 27 ─

describe("overlay tile highlight (end-to-end via parseM0StringComplete)", () => {
  it("overlay F inside {F} gets span {start:27,end:28} in 2[2(2[F,F],3(F,F,F)),5(F,F{F},F,F,F)]", () => {
    // Human input — canonical uses 1 instead of F, but positions are 1:1
    const input = "2[2(2[F,F],3(F,F,F)),5(F,F{F},F,F,F)]";
    const result = parseM0StringComplete(input, 1080, 1080, { trace: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const editors = result.ir.editorFrames ?? [];
    // Find the overlay tile (overlayDepth === 1)
    const ovTile = editors.find(ef => ef.overlayDepth === 1);
    expect(ovTile).toBeDefined();
    expect(ovTile!.kind).toBe("frame");
    expect(ovTile!.meta.span).toEqual({ start: 27, end: 28 });

    // Verify the span points at exactly the F inside the braces
    // (canonical string has '1' at that position, but display has 'F')
    expect(input[27]).toBe("F");
    expect(input.substring(27, 28)).toBe("F");
  });
});
