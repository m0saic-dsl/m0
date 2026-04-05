import {
  toCanonicalM0String,
  toPrettyM0String,
} from "./m0StringFormat";
import { isValidM0String } from "../validate";

describe("toCanonicalM0String", () => {
  // Bare tokens (not valid m0 strings on their own, but conversion is correct)
  it.each([
    [">", "0"],
  ])("%s → %s (bare token)", (input, expected) => {
    expect(toCanonicalM0String(input)).toBe(expected);
  });

  // Structurally valid m0 strings
  it.each([
    ["F", "1"],
    ["3(F,>,F)", "3(1,0,1)"],
    ["2(F{F},F)", "2(1{1},1)"],
    ["2[F,F]", "2[1,1]"],
    ["4(4[F,F,F,F],4[F,F,F,F],4[F,F,F,F],4[F,F,F,F])", "4(4[1,1,1,1],4[1,1,1,1],4[1,1,1,1],4[1,1,1,1])"],
  ])("%s → %s", (input, expected) => {
    const result = toCanonicalM0String(input);
    expect(result).toBe(expected);
    expect(isValidM0String(result)).toBe(true);
  });

  it("is idempotent on canonical input", () => {
    expect(toCanonicalM0String("3(1,0,1)")).toBe("3(1,0,1)");
  });
});

describe("toPrettyM0String", () => {
  // Bare tokens
  it.each([
    ["0", ">"],
  ])("%s → %s (bare token)", (input, expected) => {
    expect(toPrettyM0String(input)).toBe(expected);
  });

  // Structurally valid m0 strings
  it.each([
    ["1", "F"],
    ["3(1,0,1)", "3(F,>,F)"],
    ["2(1{1},1)", "2(F{F},F)"],
    ["2[1,1]", "2[F,F]"],
  ])("%s → %s", (input, expected) => {
    const result = toPrettyM0String(input);
    expect(result).toBe(expected);
    expect(isValidM0String(result)).toBe(true);
  });

  it("preserves counts containing 0 or 1 digits", () => {
    // 10(...) should keep "10" as the count, not become "F>(...)"
    const result = toPrettyM0String("10(1,1,1,1,1,1,1,1,1,1)");
    expect(result).toBe("10(F,F,F,F,F,F,F,F,F,F)");
    expect(isValidM0String(result)).toBe(true);
  });

  it("preserves count 100 in weighted splits", () => {
    const result = toPrettyM0String("100(0,1)");
    expect(result).toBe("100(>,F)");
  });

  it("is idempotent on pretty input", () => {
    expect(toPrettyM0String("3(F,>,F)")).toBe("3(F,>,F)");
  });

  it("does not touch null token (-)", () => {
    expect(toPrettyM0String("2(-,- )".replace(" ", ""))).toBe("2(-,-)");
    expect(toCanonicalM0String("2(-,- )".replace(" ", ""))).toBe("2(-,-)");
  });

  it("handles structural null overlay owner (-{...})", () => {
    const pretty = "-{F}";
    const canonical = toCanonicalM0String(pretty);
    expect(canonical).toBe("-{1}");
    expect(toPrettyM0String(canonical)).toBe(pretty);
  });

  it("pretty converts 0/1 next to braces/brackets/parentheses", () => {
    expect(toPrettyM0String("2(1{0},1)")).toBe("2(F{>},F)");
  });
});

describe("round-trip", () => {
  it.each([
    "3(F,>,F)",
    "2(F{F},F)",
    "F",
    "2(3(F,>,F),F)",
  ])("pretty → canonical → pretty: %s", (pretty) => {
    const canonical = toCanonicalM0String(pretty);
    const back = toPrettyM0String(canonical);
    expect(back).toBe(pretty);
  });
});
