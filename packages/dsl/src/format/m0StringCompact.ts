import { toCanonicalM0String, toPrettyM0String } from "./m0StringFormat";

/**
 * Upper bound on the length of an unfolded compact string.
 *
 * `fromCompactM0String` is fed by untrusted transports (share URLs are
 * forgeable), and a fold marker is an allocation multiplier: `999999999>` is
 * eleven characters that would expand to ~2 GB. The guard runs over every
 * marker BEFORE any string is built, so a hostile input fails fast — refusal
 * costs microseconds and allocates nothing.
 *
 * ## Why 10M
 *
 * This is set to the DSL's own documented ceiling, not to the current corpus
 * size — `perf/large-dsl-ceiling.break.test.ts` validates and geometry-parses
 * strings up to ~10M chars and treats that as supported ("linear, cheap"). A
 * bound tied to today's biggest layout (~1.07M chars) would just need raising
 * the first time someone builds a bigger one, and folding helps *most* on
 * exactly those.
 *
 * There is no memory cliff to aim at — cost is linear to well past this point
 * (measured, unfold + validate, one process each):
 *
 * ```
 *    1M chars →  133ms,  125MB      10M chars →  918ms,  469MB
 *    5M chars →  451ms,  286MB      20M chars → 2016ms,  829MB
 *                                   40M chars → 4312ms, 1235MB
 * ```
 *
 * So the real constraint is the main thread, not the heap: the only caller
 * today unfolds during page load, and the cap IS the worst-case freeze an
 * attacker can buy with a link. 10M costs ~0.9s — the knee of that curve, and
 * the point past which a tab visibly hangs.
 *
 * A transport with tighter needs should impose its own limit before calling
 * rather than lowering this one; this is the codec's sanity bound, not a
 * policy knob.
 *
 * Deliberately not re-exported from the package barrel — it's a safety bound
 * for this module, not part of the public API surface.
 */
export const MAX_COMPACT_EXPANSION = 10_000_000;

/**
 * Convert a m0 string to compact form: pretty tokens, with runs of `>` or `-`
 * folded into `N>` / `N-`.
 *
 * `6[1,0,0,0,0,1]` → `6[F,4>F]`
 *
 * ## Compact is NOT grammar
 *
 * This is a presentation / transport form, like {@link toPrettyM0String}, and a
 * folded string is **invalid m0 by construction** — `isValidM0String` returns
 * false for anything containing a marker. Nothing in the parser, validator, or
 * file formats understands compact. Always run {@link fromCompactM0String}
 * before a compact string reaches any of them.
 *
 * ## Why `N>` / `N-` can never collide with real m0
 *
 * The validator's token rules allow a NUMBER to be followed by exactly `(` or
 * `[` — a split classifier — and nothing else (`m0StringValidator.ts`, the
 * `prev === "NUMBER"` arm). So digit-immediately-followed-by-`>`-or-`-` is free
 * namespace: no valid m0 string, canonical or pretty, can contain it. That is
 * what makes the fold unambiguous, and what makes `fromCompactM0String` a
 * guaranteed no-op on plain input.
 *
 * Note this fold is only expressible over PRETTY tokens, and the argument above
 * is exactly why: it turns on `>` and `-` living outside the digit alphabet, so
 * `N>` is a shape no valid string can produce. `0` has no such property — it IS
 * a digit, and it appears inside ordinary split counts (`10(`, `100(`). A
 * canonical marker `N0` would be built from precisely the characters counts are
 * built from, with nothing delimiting the run count from the digits that follow
 * it: no free namespace to claim, and no way to find the marker's edges in a
 * left-to-right scan. Hence compact output always uses `F` / `>` / `-`.
 *
 * ## The trailing-comma convention
 *
 * The comma that separates the run from its next sibling is consumed into the
 * marker: `F,>,>,>,>,F` → `F,4>F`, not `F,4>,F`. `fromCompactM0String`
 * re-inserts it by looking at the following character.
 *
 * ## Overlays break runs
 *
 * A token carrying an overlay (`>{...}`) is position-sensitive — folding it
 * away would move the overlay — so it is never counted into a run. A run is
 * folded *up to* such a token and the overlay-bearing token stays expanded:
 * `>,>,>,>{F}` → `3>>{F}`. Runs whose plain prefix is a single token are left
 * alone; there is nothing to gain.
 *
 * Pure lexical transform, GIGO on invalid input, no validation call — same
 * contract as its `format/` siblings. Idempotent on compact input.
 */
export function toCompactM0String(s: string): string {
  const pretty = toPrettyM0String(s);
  let out = "";
  let i = 0;

  while (i < pretty.length) {
    const ch = pretty[i];

    // A run can only start at a plain (overlay-free) `>` or `-`.
    if ((ch === ">" || ch === "-") && pretty[i + 1] !== "{") {
      let count = 1;
      let j = i + 1; // position just past the last counted token

      // Walk `,<same token>` pairs, stopping before an overlay-bearing token.
      while (pretty[j] === "," && pretty[j + 1] === ch && pretty[j + 2] !== "{") {
        count++;
        j += 2;
      }

      if (count >= 2) {
        out += String(count) + ch;
        if (pretty[j] === ",") j++; // consume the run → sibling comma
        i = j;
        continue;
      }
    }

    out += ch;
    i++;
  }

  return out;
}

/**
 * Expand compact form back to canonical m0: every `N>` / `N-` marker becomes N
 * comma-separated tokens, then the whole string is canonicalized.
 *
 * `6[F,4>F]` → `6[1,0,0,0,0,1]`
 *
 * The round-trip law, for every valid m0 string `x`:
 *
 * ```
 * fromCompactM0String(toCompactM0String(x)) === toCanonicalM0String(x)
 * ```
 *
 * Because a digit is never followed by `>` or `-` in valid m0 (see
 * {@link toCompactM0String}), this is a plain canonicalization — a no-op on the
 * fold — for any marker-free input. That is what lets a transport accept old
 * plain links and new compact ones through the same path.
 *
 * @throws {Error} if a marker count is zero, not a safe integer, or if the
 * markers would together expand the string past {@link MAX_COMPACT_EXPANSION}.
 */
export function fromCompactM0String(s: string): string {
  // Pass 1 — bound the expansion before allocating anything. Fresh regex so the
  // stateful `lastIndex` of the /g literal can't leak into the replace pass.
  let extra = 0;
  for (const m of s.matchAll(/(\d+)([>\-])/g)) {
    const count = Number(m[1]);
    if (!Number.isSafeInteger(count) || count === 0) {
      throw new Error(`Invalid compact m0 run count: "${m[1]}${m[2]}"`);
    }
    // Each expanded token costs at most 2 chars (token + separator); the marker
    // itself is only shrinking, so this over-estimates and stays conservative.
    extra += 2 * count;
    if (s.length + extra > MAX_COMPACT_EXPANSION) {
      throw new Error(
        `Compact m0 expansion exceeds ${MAX_COMPACT_EXPANSION} chars`,
      );
    }
  }

  // Pass 2 — expand. The separating comma is re-inserted unless the run ends a
  // slot list: `]` `)` `}` or end-of-string all mean "no comma follows".
  const expanded = s.replace(
    /(\d+)([>\-])/g,
    (marker: string, digits: string, token: string, offset: number, whole: string) => {
      // `repeat` on the 2-char `,<token>` unit, not `new Array(n).fill().join()`
      // — the array form allocates one pointer per token (8 bytes vs 1) and
      // dominates peak memory: at a 20M run it costs ~180MB and ~180ms, versus
      // no measurable time or resident growth here.
      const run = token + `,${token}`.repeat(Number(digits) - 1);
      const next = whole[offset + marker.length];
      const needsComma =
        next !== undefined && next !== "]" && next !== ")" && next !== "}";
      return needsComma ? `${run},` : run;
    },
  );

  return toCanonicalM0String(expanded);
}
