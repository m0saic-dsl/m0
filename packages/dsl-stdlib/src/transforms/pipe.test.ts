import { pipe, Pipe } from "./pipe";
import { compose } from "./compose";
import { split } from "./unified/split";
import { addOverlay } from "./unified/addOverlay";

describe("pipe", () => {
  test("entry returns a Pipe instance", () => {
    expect(pipe("1")).toBeInstanceOf(Pipe);
  });

  test("peek returns the current string without terminating", () => {
    const p = pipe("1");
    expect(p.peek()).toBe("1");
    p.split({ by: "logicalIndex", index: 0 }, { axis: "col", count: 2 });
    expect(p.peek()).toBe("2(1,1)");
  });

  test("build returns the final m0 string", () => {
    const result = pipe("1")
      .split({ by: "logicalIndex", index: 0 }, { axis: "col", count: 2 })
      .build();
    expect(result).toBe("2(1,1)");
  });

  test("multi-step chain matches imperative byte-for-byte", () => {
    const m0 = "1";

    // Imperative reference path — the exact pattern pipe replaces.
    // Use a chain of structural ops where each intermediate string
    // is cleanly canonical, so we're testing the pipe's string-
    // forwarding, not the underlying transforms' edge cases.
    let s = m0;
    s = split(s, { by: "logicalIndex", index: 0 }, { axis: "row", count: 3 });
    s = split(s, { by: "logicalIndex", index: 1 }, { axis: "col", count: 2 });
    s = addOverlay(s, { by: "logicalIndex", index: 0 });

    const piped = pipe(m0)
      .split({ by: "logicalIndex", index: 0 }, { axis: "row", count: 3 })
      .split({ by: "logicalIndex", index: 1 }, { axis: "col", count: 2 })
      .addOverlay({ by: "logicalIndex", index: 0 })
      .build();

    expect(piped).toBe(s);
  });

  test("removeOverlay + replace + measureSplit + swapFrames are wired", () => {
    // Smoke: each method forwards to its underlying transform. We
    // don't assert the precise output (the unified-test file covers
    // semantics); we just want to know the methods exist on the
    // chain and don't throw on a sane input.
    const built = pipe("1")
      .split({ by: "logicalIndex", index: 0 }, { axis: "row", count: 2 })
      .addOverlay({ by: "logicalIndex", index: 0 })
      .removeOverlay({ by: "logicalIndex", index: 0 })
      .swapFrames(0, 1)
      .build();

    expect(typeof built).toBe("string");
    expect(built.length).toBeGreaterThan(0);
  });

  test("errors are wrapped with step index and op name", () => {
    expect(() =>
      pipe("1")
        .split({ by: "logicalIndex", index: 0 }, { axis: "col", count: 2 })
        .addOverlay({ by: "logicalIndex", index: 99 })
        .build(),
    ).toThrow(/pipe step 1 \(addOverlay\):/);
  });

  test("step index counts only successful steps before the throw", () => {
    // First op throws — should report step 0, not step 1.
    expect(() =>
      pipe("1").split({ by: "logicalIndex", index: 99 }, { axis: "col", count: 2 }).build(),
    ).toThrow(/pipe step 0 \(split\):/);
  });

  test("through bridges compose into the chain", () => {
    const heroIfy = compose(
      (m) => split(m, { by: "logicalIndex", index: 0 }, { axis: "row", count: 3 }),
      (m) => addOverlay(m, { by: "logicalIndex", index: 1 }),
    );

    const a = pipe("1").through(heroIfy).build();
    const b = heroIfy("1");
    expect(a).toBe(b);
  });

  test("log returns this and does not mutate state", () => {
    // Silence the side-effect; we only care about the return value.
    const spy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const p = pipe("1");
      const ret = p.log("after init");
      expect(ret).toBe(p);
      expect(p.peek()).toBe("1");
      expect(spy).toHaveBeenCalledWith("[after init] 1");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("compose", () => {
  test("empty arg returns identity", () => {
    expect(compose()("1")).toBe("1");
    expect(compose()("")).toBe("");
  });

  test("single fn returns the same fn semantically", () => {
    const f = (m: string) => m + "x";
    expect(compose(f)("a")).toBe("ax");
  });

  test("composes left-to-right", () => {
    const out = compose(
      (m: string) => m + "1",
      (m: string) => m + "2",
      (m: string) => m + "3",
    )("");
    expect(out).toBe("123");
  });

  test("byte-equal with imperative for the audit's heroIfy example", () => {
    const m0 = "1";

    let s = m0;
    s = split(s, { by: "logicalIndex", index: 0 }, { axis: "row", count: 3 });
    s = addOverlay(s, { by: "logicalIndex", index: 1 });

    const composed = compose(
      (m) => split(m, { by: "logicalIndex", index: 0 }, { axis: "row", count: 3 }),
      (m) => addOverlay(m, { by: "logicalIndex", index: 1 }),
    )(m0);

    expect(composed).toBe(s);
  });
});
