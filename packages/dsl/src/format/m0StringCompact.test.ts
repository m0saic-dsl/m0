import {
  MAX_COMPACT_EXPANSION,
  fromCompactM0String,
  toCompactM0String,
} from "./m0StringCompact";
import { toCanonicalM0String } from "./m0StringFormat";
import { isValidM0String } from "../validate";

/** True when a string carries at least one `N>` / `N-` fold marker. */
const hasFold = (s: string): boolean => /\d[>\-]/.test(s);

describe("toCompactM0String", () => {
  it.each([
    // input (canonical)              → compact
    ["6[1,0,0,0,0,1]", "6[F,4>F]"],
    ["3[0,0,1]", "3[2>F]"],
    ["12[0,0,0,0,0,0,0,0,0,0,0,1]", "12[11>F]"],
    ["3(1,-,-)", "3(F,2-)"],
    ["2(3[0,0,1],1)", "2(3[2>F],F)"],
    ["1{3(0,0,1)}", "F{3(2>F)}"],
    ["1{3(1,-,-)}", "F{3(F,2-)}"],
  ])("folds %s → %s", (input, expected) => {
    expect(toCompactM0String(input)).toBe(expected);
  });

  it("consumes the run → sibling comma (4>F, not 4>,F)", () => {
    const compact = toCompactM0String("6[1,0,0,0,0,1]");
    expect(compact).toBe("6[F,4>F]");
    expect(compact).not.toContain("4>,");
  });

  it("folds a `-` run sitting at the end of a container (no comma to consume)", () => {
    // The `>` and `-` folds are NOT symmetric: PASSTHROUGH_TO_NOTHING means a
    // `>` run always has a sibling after it, but a `-` run may end the list.
    expect(toCompactM0String("3(1,-,-)")).toBe("3(F,2-)");
  });

  it("folds a run of exactly 2", () => {
    expect(toCompactM0String("3[0,0,1]")).toBe("3[2>F]");
  });

  it.each([
    ["4(0,1,0,1)", "4(>,F,>,F)"], // isolated zeros — no run to fold
    ["2(1,1)", "2(F,F)"], // no passthroughs at all
    ["1", "F"], // bare root
  ])("leaves %s alone (nothing foldable)", (input, expected) => {
    expect(toCompactM0String(input)).toBe(expected);
  });

  describe("overlays break runs", () => {
    it("folds up to an overlay-bearing token, leaving it expanded", () => {
      // An overlay on `0` is position-sensitive, so the token carrying it can
      // never be folded away — but the plain prefix still folds.
      expect(toCompactM0String("5[0,0,0,0{2(1,1)},1]")).toBe("5[3>>{2(F,F)},F]");
    });

    it("does not fold a plain prefix of one", () => {
      expect(toCompactM0String("3[0,0{1},1]")).toBe("3[>,>{F},F]");
    });

    it("an interior overlay splits one run into two unfoldable halves", () => {
      expect(toCompactM0String("3[0{1},0,1]")).toBe("3[>{F},>,F]");
    });

    it("folds the plain tail that follows an overlay-bearing token", () => {
      expect(toCompactM0String("5[1,0{1},0,0,1]")).toBe("5[F,>{F},2>F]");
    });
  });

  describe("input forms", () => {
    it.each([
      ["canonical", "6[1,0,0,0,0,1]"],
      ["pretty", "6[F,>,>,>,>,F]"],
      ["mixed", "6[F,0,>,0,>,1]"],
      ["whitespaced", "6[ 1, 0, 0, 0, 0, 1 ]"],
    ])("accepts %s input", (_label, input) => {
      expect(toCompactM0String(input)).toBe("6[F,4>F]");
    });
  });

  it("folds runs inside nested containers independently", () => {
    expect(toCompactM0String("2(3[0,0,1],4(0,0,0,1))")).toBe("2(3[2>F],4(3>F))");
  });

  it("is idempotent on compact input", () => {
    const once = toCompactM0String("6[1,0,0,0,0,1]");
    expect(toCompactM0String(once)).toBe(once);
  });

  it("emits strings that are out-of-grammar by construction", () => {
    // This is the load-bearing property: compact is a transport form, and the
    // validator must reject it so it can never be mistaken for storable m0.
    for (const input of ["6[1,0,0,0,0,1]", "3(1,-,-)", "1{3(0,0,1)}"]) {
      const compact = toCompactM0String(input);
      expect(hasFold(compact)).toBe(true);
      expect(isValidM0String(compact)).toBe(false);
    }
  });
});

describe("fromCompactM0String", () => {
  it.each([
    // compact                → canonical
    ["6[F,4>F]", "6[1,0,0,0,0,1]"],
    ["3[2>F]", "3[0,0,1]"],
    ["12[11>F]", "12[0,0,0,0,0,0,0,0,0,0,0,1]"],
    ["3(F,2-)", "3(1,-,-)"],
    ["5[3>>{2(F,F)},F]", "5[0,0,0,0{2(1,1)},1]"],
    ["F{3(2>F)}", "1{3(0,0,1)}"],
  ])("expands %s → %s", (compact, expected) => {
    const out = fromCompactM0String(compact);
    expect(out).toBe(expected);
    expect(isValidM0String(out)).toBe(true);
  });

  describe("comma re-insertion at each boundary", () => {
    it("re-inserts before a sibling token", () => {
      expect(fromCompactM0String("6[F,4>F]")).toBe("6[1,0,0,0,0,1]");
    });

    it("re-inserts before another passthrough (the up-to-overlay case)", () => {
      expect(fromCompactM0String("5[3>>{F},F]")).toBe("5[0,0,0,0{1},1]");
    });

    it("omits the comma before `)`", () => {
      expect(fromCompactM0String("3(F,2-)")).toBe("3(1,-,-)");
    });

    it("omits the comma before `]`", () => {
      expect(fromCompactM0String("3[F,2-]")).toBe("3[1,-,-]");
    });

    it("omits the comma before `}`", () => {
      // Defensive: valid m0 can't put a run directly before `}` (an overlay
      // body has a single root node, so a container always closes first), but
      // the boundary set must still include it or a forged string corrupts
      // into a different shape instead of failing validation.
      expect(fromCompactM0String("F{2-}")).toBe("1{-,-}");
    });

    it("omits the comma at end-of-string", () => {
      expect(fromCompactM0String("2-")).toBe("-,-");
    });
  });

  describe("no-op on marker-free input", () => {
    it.each([
      ["canonical", "3(1,0,1)", "3(1,0,1)"],
      ["pretty", "3(F,>,F)", "3(1,0,1)"],
      ["overlay", "2(1{1},1)", "2(1{1},1)"],
      ["multi-digit counts", "10(1,1,1,1,1,1,1,1,1,1)", "10(1,1,1,1,1,1,1,1,1,1)"],
      ["null tokens", "3(1,-,-)", "3(1,-,-)"],
    ])("%s passes through as canonical", (_label, input, expected) => {
      expect(fromCompactM0String(input)).toBe(expected);
    });
  });

  it("always returns canonical form", () => {
    const out = fromCompactM0String("6[F,4>F]");
    expect(out).toBe(toCanonicalM0String(out));
    expect(out).not.toMatch(/[F>]/);
  });

  describe("expansion guard", () => {
    it("throws on a hostile run count", () => {
      expect(() => fromCompactM0String("999999999>")).toThrow(/exceeds/);
    });

    it("throws before allocating (large count is rejected promptly)", () => {
      const start = Date.now();
      expect(() => fromCompactM0String("2(999999999>,F)")).toThrow();
      expect(Date.now() - start).toBeLessThan(1000);
    });

    it("throws on a zero count", () => {
      expect(() => fromCompactM0String("0>")).toThrow(/run count/);
    });

    it("throws on a count past Number.MAX_SAFE_INTEGER", () => {
      expect(() => fromCompactM0String(`${"9".repeat(25)}>`)).toThrow(/run count/);
    });

    it("throws when many small markers sum past the cap", () => {
      // No single marker is hostile; the total is. The guard accumulates.
      const many = `${"1000000>".repeat(6)}`;
      expect(() => fromCompactM0String(many)).toThrow(/exceeds/);
    });

    it("allows an expansion that stays under the cap", () => {
      expect(() => fromCompactM0String("3[100>F]")).not.toThrow();
    });

    it("caps at MAX_COMPACT_EXPANSION", () => {
      expect(MAX_COMPACT_EXPANSION).toBe(10_000_000);
    });

    it("leaves room for layouts far larger than any in the corpus", () => {
      // The biggest real m0 is ~1.07M chars, and folding pays off most on the
      // large ones — the bound must never be the thing that stops them. This
      // asserts the headroom rather than allocating it: a unit test has no
      // business building a multi-megabyte string.
      expect(MAX_COMPACT_EXPANSION).toBeGreaterThan(5 * 1_070_000);
    });
  });
});

describe("round-trip law", () => {
  // fromCompactM0String(toCompactM0String(x)) === toCanonicalM0String(x)
  const roundTrip = (x: string): string =>
    fromCompactM0String(toCompactM0String(x));

  it.each([
    "3[0,0,1]",
    "2(0{1},1)",
    "3[0,0{1},1]",
    "3[0{1},0,1]",
    "12[0,0,0,0,0,0,0,0,0,0,0,1]",
    "2(3[0,0,1],1)",
    "3[-,0,1]",
    "2(-{1},1)",
    "4(0,0{2(1,1)},0,1)",
    "1{3(0,0,1)}",
    "6[1,0,0,0,0,1]",
    "3(1,-,-)",
    "5[0,0,0,0{2(1,1)},1]",
    "4(0,1,0,1)",
    "1{3(1,-,-)}",
  ])("holds for %s", (x) => {
    expect(isValidM0String(x)).toBe(true);
    const back = roundTrip(x);
    expect(back).toBe(toCanonicalM0String(x));
    expect(isValidM0String(back)).toBe(true);
  });

  it("holds lexically on invalid input too (GIGO contract)", () => {
    // `3[0,0,-]` is NO_SOURCES — nothing in it renders — so it is NOT valid m0.
    // The codec never validates, so the round-trip must still be lossless:
    // a caller that folds garbage gets the same garbage back, unchanged.
    const garbage = "3[0,0,-]";
    expect(isValidM0String(garbage)).toBe(false);
    expect(toCompactM0String(garbage)).toBe("3[2>-]");
    expect(roundTrip(garbage)).toBe(garbage);
  });

  describe("exhaustive small-case sweep", () => {
    /** Every container of `count` slots drawn from `alphabet`, both classifiers. */
    function enumerate(alphabet: string[], counts: number[]): string[] {
      const out: string[] = [];
      for (const count of counts) {
        let combos: string[][] = [[]];
        for (let slot = 0; slot < count; slot++) {
          combos = combos.flatMap((c) => alphabet.map((a) => [...c, a]));
        }
        for (const combo of combos) {
          out.push(`${count}(${combo.join(",")})`);
          out.push(`${count}[${combo.join(",")}]`);
        }
      }
      return out;
    }

    const DEPTH_1_SLOTS = ["0", "1", "-", "0{1}", "1{1}", "2(1,1)"];
    const DEPTH_2_SLOTS = [...DEPTH_1_SLOTS, "3[0,0,1]", "2(0,1)"];

    const candidates = [
      ...enumerate(DEPTH_1_SLOTS, [2, 3]),
      ...enumerate(DEPTH_2_SLOTS, [2, 3]),
    ];
    const valid = candidates.filter((c) => isValidM0String(c));

    it("generates a non-empty valid corpus", () => {
      // Guards against the sweep silently degenerating to zero cases.
      expect(valid.length).toBeGreaterThan(300);
    });

    it("holds for every generated valid string", () => {
      const failures: string[] = [];
      for (const x of valid) {
        const compact = toCompactM0String(x);
        const back = fromCompactM0String(compact);
        if (back !== toCanonicalM0String(x)) {
          failures.push(`${x} → ${compact} → ${back}`);
        }
      }
      expect(failures).toEqual([]);
    });

    it("never emits a foldable-but-valid compact string", () => {
      // Any compact carrying a marker must be out-of-grammar; anything the
      // validator still accepts must be fold-free.
      const leaks = valid
        .map((x) => toCompactM0String(x))
        .filter((c) => hasFold(c) && isValidM0String(c));
      expect(leaks).toEqual([]);
    });
  });
});
