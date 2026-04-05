/**
 * Type-level smoke test — verify public exports are importable.
 * If this file compiles, the types are correctly exported.
 */
import type { WireframeGoldenOpts } from "./index";
import { assertWireframeGolden } from "./index";

describe("types", () => {
  it("WireframeGoldenOpts has required fields", () => {
    const opts: WireframeGoldenOpts = {
      id: "test",
      m0: "1",
      width: 100,
      height: 100,
    };
    expect(opts.id).toBe("test");
    expect(opts.m0).toBe("1");
  });

  it("assertWireframeGolden is exported as a function", () => {
    expect(typeof assertWireframeGolden).toBe("function");
  });
});
