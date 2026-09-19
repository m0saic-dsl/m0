/**
 * Point-free composition for m0 transforms.
 *
 * `compose(f, g, h)(m0) === h(g(f(m0)))` — left-to-right; the
 * caller's reading order matches execution order, matching how the
 * `pipe(...)` surface reads.
 *
 * Useful when you want to *name* a multi-step transform and pass it
 * around — for example:
 *
 * ```ts
 * const heroIfy = compose(
 *   (m) => split(m, { by: "logicalIndex", index: 0 }, { axis: "row", count: 3 }),
 *   (m) => addOverlay(m, { by: "logicalIndex", index: 1 }),
 * );
 * const result = heroIfy(m0);
 * ```
 *
 * Bridges into the fluent surface via `pipe(m0).through(heroIfy)`.
 *
 * No-arg invocations return the identity function, so `compose()` is
 * a safe default for variadic spreads.
 */
export type M0Transform = (m0: string) => string;

export function compose(...fns: M0Transform[]): M0Transform {
  if (fns.length === 0) return (m0) => m0;
  if (fns.length === 1) return fns[0]!;
  return (m0) => fns.reduce((acc, fn) => fn(acc), m0);
}
