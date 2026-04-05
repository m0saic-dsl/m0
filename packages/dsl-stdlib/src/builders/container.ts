import type { M0String } from "@m0saic/dsl";
import { toM0String } from "../constructors/toM0String";

/** Split axis direction for {@link container}. */
export type ContainerAxis = "col" | "row";

/**
 * Wrap a token array in a counted DSL container expression and return a
 * validated, branded {@link M0String}.
 *
 * - `"col"` produces a horizontal split: `N(token0,token1,...)`
 * - `"row"` produces a vertical split:   `N[token0,token1,...]`
 *
 * When the array contains exactly one token the token is returned as-is,
 * avoiding the illegal `1(...)` / `1[...]` forms.
 *
 * The result is canonicalized and validated before branding. Throws if
 * the assembled expression is not a valid m0 string (e.g. empty
 * tokens or invalid token contents).
 *
 * @param tokens - Ordered array of DSL tokens.
 * @param axis   - `"col"` for parentheses (horizontal), `"row"` for brackets (vertical).
 * @returns A validated, branded `M0String`.
 *
 * @example
 * container(["1", "1", "1"], "col") // => "3(1,1,1)"
 * container(["1", "1"], "row")      // => "2[1,1]"
 * container(["1"], "col")           // => "1"
 */
export function container(tokens: string[], axis: ContainerAxis): M0String {
  if (tokens.length === 0) {
    throw new Error("container: tokens must be non-empty");
  }
  if (tokens.length === 1) {
    return toM0String(tokens[0], "container");
  }
  const [open, close] = axis === "col" ? ["(", ")"] : ["[", "]"];
  const raw = `${tokens.length}${open}${tokens.join(",")}${close}`;
  return toM0String(raw, "container");
}
