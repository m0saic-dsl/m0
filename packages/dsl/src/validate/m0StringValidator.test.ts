import {
  validateM0String,
} from "./m0StringValidator";

function expectInvalidResult(res: ReturnType<typeof validateM0String>) {
  expect(res.ok).toBe(false);
  if (!("error" in res)) throw new Error("Expected invalid result");
  return res.error;
}

describe("validateM0StringCanonical", () => {
  test("rejects empty input as INVALID_EMPTY with empty span", () => {
    const res = validateM0String("");
    const err = expectInvalidResult(res);
    expect(err.code).toBe("INVALID_EMPTY");
    expect(err.position).toBe(0);
    expect(err.span).toEqual({ start: 0, end: 0 });
  });

  test("rejects bare '-' as INVALID_EMPTY with unit span", () => {
    const res = validateM0String("-");
    const err = expectInvalidResult(res);
    expect(err.code).toBe("INVALID_EMPTY");
    expect(err.position).toBe(0);
    expect(err.span).toEqual({ start: 0, end: 1 });
  });

  test("rejects bare '0' with passthrough-specific INVALID_EMPTY message", () => {
    const res = validateM0String("0");
    const err = expectInvalidResult(res);
    expect(err.code).toBe("INVALID_EMPTY");
    expect(err.position).toBe(0);
    expect(err.span).toEqual({ start: 0, end: 1 });
    expect(err.message).toBe("A bare passthrough tile ('0') produces no renderable output.");
  });

  test("accepts single tile", () => {
    const res = validateM0String("1");
    expect(res.ok).toBe(true);
  });

  test.each([
    { input: "2(1,0)", pos: 4 },
    { input: "2(1,0{1})", pos: 4 },
    { input: "3(1,1,0{1})", pos: 6 },
    { input: "2(1,2(1,0{1}))", pos: 8 },
  ])("rejects trailing passthrough: $input", ({ input, pos }) => {
    const res = validateM0String(input);
    const err = expectInvalidResult(res);
    expect(err.code).toBe("PASSTHROUGH_TO_NOTHING");
    expect(err.position).toBe(pos);
  });

  test.each([
    "2(0{1},1)",
    "3(1,0,1)",
  ])("allows non-trailing passthrough: %s", (input) => {
    const res = validateM0String(input);
    expect(res.ok).toBe(true);
  });

  test("rejects '{{' with TOKEN_RULE at first brace", () => {
    const res = validateM0String("1{{1}}");
    const err = expectInvalidResult(res);
    expect(err.code).toBe("TOKEN_RULE");
    expect(err.position).toBe(1);
    expect(err.span).toEqual({ start: 1, end: 3 });
  });

  test.each([
    "2(_,1)",
    "2(1,_)",
    "2(-{_},1)",
    "1{2(1,_,1)}",
  ])("rejects underscore anywhere in input: %s", (input) => {
    const res = validateM0String(input);
    const err = expectInvalidResult(res);
    expect(err.code).toBe("INVALID_CHAR");
    expect(err.position).toBe(input.indexOf("_"));
  });

  test.each([
    "1[",
    "1(",
    "1(F)",
    "1[F]",
  ])("rejects illegal `1` split : %s", (input) => {
    const res = validateM0String(input);
    const err = expectInvalidResult(res);
    expect(err.code).toBe("ILLEGAL_ONE_SPLIT");
    expect(err.position).toBe(0);
    expect(err.span).toEqual({ start: 0, end: 2 });
  });
});

describe("NO_SOURCES", () => {
  test.each([
    "2(-,-)",
    "3(-,-,-)",
    "2[-,-]",
    "3[-,-,-]",
  ])("rejects all-null layout: %s", (input) => {
    const res = validateM0String(input);
    const err = expectInvalidResult(res);
    expect(err.code).toBe("NO_SOURCES");
    expect(err.position).toBe(0);
    expect(err.span).toEqual({ start: 0, end: input.length });
  });

  test.each([
    "1",
    "2(1,-)",
    "2(-,1)",
    "3(1,0,1)",
    "2(-,-){1}",
    "3(-,-,-{1})",
  ])("accepts layout with at least one leaf 1: %s", (input) => {
    const res = validateM0String(input);
    expect(res.ok).toBe(true);
  });

  test.each([
    { input: "0{1}", desc: "root-level 0 with overlay" },
    { input: "0{2(1,1)}", desc: "root-level 0 with complex overlay" },
  ])("rejects root-level passthrough: $desc ($input)", ({ input }) => {
    const res = validateM0String(input);
    const err = expectInvalidResult(res);
    expect(err.code).toBe("PASSTHROUGH_TO_NOTHING");
    expect(err.position).toBe(0);
  });

  test("error message is correct", () => {
    const res = validateM0String("2(-,-)");
    const err = expectInvalidResult(res);
    expect(err.message).toBe(
      "Layout contains no source tiles — at least one '1' / 'F' is required.",
    );
  });
});

describe("overlay bodies: 'must have at least one node, doesn't have to paint'", () => {
  // The per-overlay rules are: (a) the body must contribute at least
  // ONE node to the graph (no `{}`); (b) the body's root can't be a
  // bare `0` (passthrough with no sibling to donate to). Everything
  // else — null leaves, all-null splits, splits containing passthroughs
  // with siblings, and any composition that fails to paint — is now
  // valid. They express structural anchors (logical owners) that carry
  // stableKey + label without contributing paint. The whole-string
  // `NO_SOURCES` check still guards that the OUTER layout has at least
  // one source tile at the canvas root.
  test.each([
    { input: "1{1}", label: "overlay with paint" },
    { input: "1{2(-,1)}", label: "overlay with mixed body" },
    { input: "1{2[1,1]{1}}", label: "nested overlay with paint" },
    { input: "1{-}", label: "bare null — one node, no paint" },
    { input: "1{2(-,-)}", label: "all-null split — has nodes" },
    { input: "1{2(0,-)}", label: "passthrough with sibling to donate to" },
    { input: "1{-{-}}", label: "nested logical owner with null inside" },
    { input: "1{-{2(0,-)}}", label: "nested logical owner with split inside" },
    { input: "1{2[1,1]{2(-,-)}}", label: "nested zero-source overlay" },
    { input: "1{1{2(-,-)}}", label: "deeply nested zero-source overlay" },
    { input: "2(-{F},-{1})", label: "sibling logical owners" },
  ])("accepts: $label ($input)", ({ input }) => {
    const res = validateM0String(input);
    expect(res.ok).toBe(true);
  });

  test.each([
    { input: "1{}", label: "empty body — no nodes" },
    { input: "1{0}", label: "bare passthrough with no sibling" },
    { input: "1{-{}}", label: "nested empty body (recursive check)" },
    { input: "1{-{-{}}}", label: "deeply nested empty body" },
  ])("rejects: $label ($input)", ({ input }) => {
    const res = validateM0String(input);
    const err = expectInvalidResult(res);
    expect(err.code).toBe("INVALID_EMPTY");
  });
});

describe("validateM0String wrapper canonicalization", () => {
  test("canonicalizes aliases before validation", () => {
    const res = validateM0String("2(>{F},F)");
    expect(res.ok).toBe(true);
  });
});
