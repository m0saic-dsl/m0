import type { StableKey } from "@m0saic/dsl";

/**
 * Input frame shape for rank algorithms. Compatible with the output of
 * `queryFrames(m0).logical()` — see `rankFramesFromM0` for the bridge.
 */
export type RankFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Document-order index of this frame within the parsed m0. Used as a
   * deterministic tie-breaker when an algorithm's primary sort key produces
   * equal values across frames.
   */
  logicalIndex: number;
  /**
   * Structural identity for this frame. Optional — the positional builders
   * (`generateRankSet`, `customRankSet`, `editRankSet`) don't read it and
   * accept frames without it. The StableKey-keyed builders
   * (`generateStableKeyRankSet`, `customStableKeyRankSet`,
   * `editStableKeyRankSet`) REQUIRE it at runtime and throw a descriptive
   * error when absent.
   *
   * `rankFramesFromM0` always populates it; hand-crafted `RankFrame[]`
   * inputs (tests, ad-hoc tooling) only need it when the StableKey-keyed
   * builders are in scope.
   */
  stableKey?: StableKey;
};

/** Built-in rank ordering modes. `"custom"` packages caller-supplied ranks verbatim. */
export type RankMode = "diag" | "cascade" | "radial" | "custom";

/** Built-in modes only (no `"custom"`). Use this where the algorithm must run. */
export type BuiltInRankMode = Exclude<RankMode, "custom">;
