import type { TransformTarget } from "./types";
import type { OpOutputOptions } from "./_internal/output";
import type { TileTypePrimitive } from "../types";
import { split, type SplitOptions } from "./unified/split";
import { replace } from "./unified/replace";
import { addOverlay } from "./unified/addOverlay";
import { removeOverlay } from "./unified/removeOverlay";
import { setTileType } from "./unified/setTileType";
import { measureSplit, type MeasureSplitOptions } from "./unified/measureSplit";
import { swapFrames } from "./unified/swapFrames";
import { History } from "./withHistory";

/**
 * Fluent transform pipeline for m0 strings.
 *
 * Every unified transform in `transforms/unified/` shares the shape
 * `(m0, target, opts) → string`. `Pipe` hides the single-string
 * invariant ("`let s = m0; s = ...; s = ...;`") behind a chain — each
 * method forwards to the matching transform with the pipe's current
 * string as the first arg, then stores the result.
 *
 * - `build()` — terminator returning the final canonical / pretty m0.
 * - `peek()` — read the current string mid-chain (no terminator).
 * - `log(label)` — prints `[label] <current>` via `console.log`,
 *   returns `this` so chaining continues. Useful inside the editor
 *   handler migration.
 * - `through(fn)` — applies a `compose`'d function (or any
 *   `(m: string) => string`) to the pipeline; bridges the two
 *   surfaces.
 *
 * Errors from the underlying transforms are wrapped with the step
 * name + 0-based step index in the chain so failures point at the
 * gesture, not just the primitive — `pipe step 2 (addOverlay):
 * logicalIndex 5 not found` rather than the bare primitive error.
 *
 * The pipe is intentionally mutable. `withHistory` layers snapshot
 * retention on top; downstream diff utilities consume before/after
 * pairs at the boundaries.
 */
export class Pipe {
  private readonly start: string;
  private current: string;
  private step: number;

  constructor(m0: string) {
    this.start = m0;
    this.current = m0;
    this.step = 0;
  }

  /** Read the current string without terminating the chain. */
  peek(): string {
    return this.current;
  }

  /**
   * Terminate the chain — returns the final m0 string. Equivalent to
   * `peek()` but the name marks the chain as complete at the call
   * site.
   */
  build(): string {
    return this.current;
  }

  /**
   * Alternate terminator — returns a `History` seeded with
   * the original input and the chain's final state. The pipe records
   * before/after only at the boundaries (the start string and
   * `current`), so the resulting history has a single `undo()` step
   * collapsing the whole chain. This matches the editor pattern
   * where each user gesture is one undo entry, regardless of how
   * many internal pipe steps it took.
   *
   * For per-step granularity, use `withHistory(m0)` directly.
   */
  buildWithHistory(): History {
    if (this.current === this.start) {
      return new History(this.start);
    }
    return History.fromSnapshots([this.start, this.current]);
  }

  /**
   * Side-channel inspection. Logs `[<label>] <current>` and returns
   * `this` so chaining continues. No-op effect on the pipe state.
   */
  log(label: string): this {
    // eslint-disable-next-line no-console
    console.log(`[${label}] ${this.current}`);
    return this;
  }

  /**
   * Apply an arbitrary `(m0) => m0` function inside the chain.
   * Bridges to `compose(...)` and lets ad-hoc one-offs slot in
   * without leaving the fluent surface.
   */
  through(fn: (m0: string) => string): this {
    return this.run("through", () => fn(this.current));
  }

  // ── Unified transforms (one method per export) ────────────────────

  split(target: TransformTarget, opts: SplitOptions): this {
    return this.run("split", () => split(this.current, target, opts));
  }

  replace(target: TransformTarget, replacement: string, opts?: OpOutputOptions): this {
    return this.run("replace", () => replace(this.current, target, replacement, opts));
  }

  addOverlay(target: TransformTarget, opts?: OpOutputOptions): this {
    return this.run("addOverlay", () => addOverlay(this.current, target, opts));
  }

  removeOverlay(target: TransformTarget, opts?: OpOutputOptions): this {
    return this.run("removeOverlay", () => removeOverlay(this.current, target, opts));
  }

  setTileType(target: TransformTarget, type: TileTypePrimitive, opts?: OpOutputOptions): this {
    return this.run("setTileType", () => setTileType(this.current, target, type, opts));
  }

  measureSplit(target: TransformTarget, opts: MeasureSplitOptions): this {
    return this.run("measureSplit", () => measureSplit(this.current, target, opts));
  }

  swapFrames(indexA: number, indexB: number, opts?: OpOutputOptions): this {
    return this.run("swapFrames", () => swapFrames(this.current, indexA, indexB, opts));
  }

  /**
   * Wrap a per-step underlying call: catches throws and rewraps with
   * the pipe's step index + op name so consumers can attribute
   * failures to the gesture, not the primitive.
   */
  private run(opName: string, fn: () => string): this {
    const stepIndex = this.step;
    try {
      this.current = fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const wrapped = new Error(`pipe step ${stepIndex} (${opName}): ${message}`);
      if (err instanceof Error && err.stack) {
        wrapped.stack = err.stack;
      }
      throw wrapped;
    }
    this.step += 1;
    return this;
  }
}

/**
 * Entry point for the fluent surface.
 *
 * ```ts
 * const result = pipe(m0)
 *   .split({ by: "logicalIndex", index: 0 }, { axis: "row", count: 3 })
 *   .addOverlay({ by: "logicalIndex", index: 1 })
 *   .build();
 * ```
 */
export function pipe(m0: string): Pipe {
  return new Pipe(m0);
}
