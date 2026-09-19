/**
 * Higher-order wrapper that turns any unified transform into one
 * that returns its inverse alongside the result.
 *
 * Snapshot inverse, not symbolic — the inverse closes over the
 * pre-transform string. O(1) memory per step (one string ref) and
 * trivially correct: no target-shift bookkeeping, no overlay-chain
 * complications.
 *
 * ```ts
 * const { m0: next, inverse } = withInverse(split)(m0, target, opts);
 * inverse(); // → original m0
 * ```
 *
 * The wrapper is generic over the transform's argument list, so
 * every existing unified transform composes with `withInverse`
 * without per-transform glue. The result type is uniform: `{ m0,
 * inverse }`.
 */
export type WithInverseResult = {
  m0: string;
  inverse: () => string;
};

export type AnyTransform<TArgs extends readonly unknown[] = readonly unknown[]> = (
  m0: string,
  ...rest: TArgs
) => string;

export function withInverse<TArgs extends readonly unknown[]>(
  transform: AnyTransform<TArgs>,
): (m0: string, ...rest: TArgs) => WithInverseResult {
  return (m0: string, ...rest: TArgs): WithInverseResult => {
    const next = transform(m0, ...rest);
    return { m0: next, inverse: () => m0 };
  };
}
