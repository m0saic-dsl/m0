import type { M0String } from "@m0saic/dsl";
import type { ContainerAxis } from "./container";
import { container } from "./container";

/**
 * Build an equal split with `count` identical children along the given axis.
 *
 * This is the canonical shorthand for the most common DSL pattern:
 * N children each occupying one equal slot.
 *
 * The result is a validated, branded {@link M0String}.
 *
 * @param count    - Number of equal children. Must be a positive integer.
 * @param axis     - `"col"` for parentheses (horizontal), `"row"` for brackets (vertical).
 * @param claimant - Token placed in each slot. Defaults to `"1"` (media tile).
 *                   May be any valid DSL expression, e.g. `"1{1}"`.
 * @returns A branded `M0String`.
 *
 * @example
 * equalSplit(3, "col")          // => "3(1,1,1)"
 * equalSplit(2, "row")          // => "2[1,1]"
 * equalSplit(4, "col", "1{1}")  // => "4(1{1},1{1},1{1},1{1})"
 * equalSplit(1, "col")          // => "1"
 */
export function equalSplit(
  count: number,
  axis: ContainerAxis,
  claimant?: string,
): M0String {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(
      `equalSplit: count must be a positive integer, got ${count}`,
    );
  }

  const token = claimant ?? "1";
  const slots = Array<string>(count).fill(token);
  return container(slots, axis);
}
