import { container } from "./container";

describe("container", () => {
  // ---- Single token (bypass) ----

  test("single token with col returns the token unchanged", () => {
    expect(container(["1"], "col")).toBe("1");
  });

  test("single token with row returns the token unchanged", () => {
    expect(container(["1"], "row")).toBe("1");
  });

  test("single complex token is returned as-is", () => {
    expect(container(["2(1,1)"], "col")).toBe("2(1,1)");
  });

  // ---- Multi-token col (parentheses) ----

  test("2 tokens col", () => {
    expect(container(["1", "1"], "col")).toBe("2(1,1)");
  });

  test("3 tokens col", () => {
    expect(container(["1", "1", "1"], "col")).toBe("3(1,1,1)");
  });

  // ---- Multi-token row (brackets) ----

  test("2 tokens row", () => {
    expect(container(["1", "1"], "row")).toBe("2[1,1]");
  });

  test("3 tokens row", () => {
    expect(container(["0", "-", "1"], "row")).toBe("3[0,-,1]");
  });

  // ---- Mixed / complex token contents ----

  test("tokens containing zeros and spacers", () => {
    expect(container(["0", "0", "1"], "col")).toBe("3(0,0,1)");
  });

  test("tokens containing nested expressions", () => {
    expect(container(["2(1,1)", "3[0,0,1]"], "row")).toBe(
      "2[2(1,1),3[0,0,1]]"
    );
  });

  test("token with overlay syntax", () => {
    expect(container(["1{1}", "-"], "col")).toBe("2(1{1},-)");
  });

  // ---- Larger counts ----

  test("5 identical tokens", () => {
    expect(container(["1", "1", "1", "1", "1"], "col")).toBe(
      "5(1,1,1,1,1)"
    );
  });

  test("count in output matches tokens.length", () => {
    const tokens = Array.from({ length: 12 }, () => "1");
    const result = container(tokens, "row");
    expect(result).toBe(`12[${tokens.join(",")}]`);
  });

  // ---- Token order preservation ----

  test("preserves token order exactly", () => {
    expect(container(["0", "0", "1", "-"], "col")).toBe("4(0,0,1,-)");
  });

  // ---- Returns M0String (validated) ----

  test("result is a validated M0String", () => {
    const result = container(["1", "1"], "col");
    // M0String is branded string — verify it's a string with correct value
    expect(typeof result).toBe("string");
    expect(result).toBe("2(1,1)");
  });

  test("single token result is also validated", () => {
    const result = container(["1{1}"], "row");
    expect(result).toBe("1{1}");
  });

  // ---- Validation: invalid tokens throw ----

  test("invalid single token throws", () => {
    expect(() => container(["garbage"], "col")).toThrow(/container/);
  });

  test("invalid token in multi-token container throws", () => {
    expect(() => container(["1", "???"], "row")).toThrow(/container/);
  });

  // ---- Empty array ----

  test("empty array throws", () => {
    expect(() => container([], "col")).toThrow(
      "container: tokens must be non-empty"
    );
    expect(() => container([], "row")).toThrow(
      "container: tokens must be non-empty"
    );
  });
});
