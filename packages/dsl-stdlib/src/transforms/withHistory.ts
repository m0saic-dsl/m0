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

/**
 * Stack-aware wrapper that records every successful step so the
 * caller can `.undo()` / `.redo()` through them.
 *
 * Same surface as `Pipe` — every unified transform exposed as
 * a method that forwards `this.peek()` as the first arg — but each
 * call also pushes a snapshot onto the undo stack and clears the
 * redo stack. Failures throw without disturbing the stacks (they
 * still rewrap the underlying error with the step name + index in
 * the chain so failures can be attributed to the gesture).
 *
 * ```ts
 * const h = withHistory(m0)
 *   .split(target1, opts)
 *   .addOverlay(target2);
 * h.peek();   // current
 * h.undo();   // back to after split
 * h.undo();   // back to original m0
 * h.redo();   // forward to after split again
 * ```
 *
 * In-memory only — no session-restore semantics.
 */
export class History {
  /** Snapshots applied so far. `undoStack[undoStack.length - 1]` is the current. */
  private undoStack: string[];
  /** Snapshots that have been undone, top is the next to redo. */
  private redoStack: string[];
  /** Step counter — only counts successful applies, used for error wrapping. */
  private step: number;

  constructor(m0: string) {
    this.undoStack = [m0];
    this.redoStack = [];
    this.step = 0;
  }

  /**
   * Internal-but-typesafe factory used by `Pipe.buildWithHistory()`
   * to seed a history from the chain's start + end snapshots without
   * replaying every intermediate step. Each entry beyond the first
   * counts as one applied step. Empty / single-entry inputs yield an
   * empty history.
   *
   * Not intended for direct use — `withHistory(m0)` is the public
   * entry point.
   */
  static fromSnapshots(snapshots: readonly string[]): History {
    if (snapshots.length === 0) {
      throw new Error("History.fromSnapshots: requires at least one snapshot");
    }
    const h = new History(snapshots[0]!);
    for (let i = 1; i < snapshots.length; i++) {
      h.undoStack.push(snapshots[i]!);
      h.step += 1;
    }
    return h;
  }

  /** Read the current string without mutating the stacks. */
  peek(): string {
    return this.undoStack[this.undoStack.length - 1]!;
  }

  /**
   * Pop one step off the undo stack and return the previous string.
   * No-op when the stack is at the original input (only one entry).
   * Returns the (now) current string in either case.
   */
  undo(): string {
    if (this.undoStack.length > 1) {
      const popped = this.undoStack.pop()!;
      this.redoStack.push(popped);
    }
    return this.peek();
  }

  /**
   * Replay the most recently undone step. No-op when the redo stack
   * is empty. Returns the (now) current string in either case.
   */
  redo(): string {
    if (this.redoStack.length > 0) {
      const next = this.redoStack.pop()!;
      this.undoStack.push(next);
    }
    return this.peek();
  }

  /** True when there's at least one step to undo (beyond the input). */
  canUndo(): boolean {
    return this.undoStack.length > 1;
  }

  /** True when there's at least one undone step to redo. */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Number of applied steps (excludes the original input). */
  size(): number {
    return this.undoStack.length - 1;
  }

  /**
   * Terminate — return the final m0 string. Equivalent to `peek()`,
   * but signals at the call site that the chain is complete.
   */
  build(): string {
    return this.peek();
  }

  // ── Unified transforms (one method per export, mirrors Pipe) ────

  split(target: TransformTarget, opts: SplitOptions): this {
    return this.run("split", () => split(this.peek(), target, opts));
  }

  replace(target: TransformTarget, replacement: string, opts?: OpOutputOptions): this {
    return this.run("replace", () => replace(this.peek(), target, replacement, opts));
  }

  addOverlay(target: TransformTarget, opts?: OpOutputOptions): this {
    return this.run("addOverlay", () => addOverlay(this.peek(), target, opts));
  }

  removeOverlay(target: TransformTarget, opts?: OpOutputOptions): this {
    return this.run("removeOverlay", () => removeOverlay(this.peek(), target, opts));
  }

  setTileType(target: TransformTarget, type: TileTypePrimitive, opts?: OpOutputOptions): this {
    return this.run("setTileType", () => setTileType(this.peek(), target, type, opts));
  }

  measureSplit(target: TransformTarget, opts: MeasureSplitOptions): this {
    return this.run("measureSplit", () => measureSplit(this.peek(), target, opts));
  }

  swapFrames(indexA: number, indexB: number, opts?: OpOutputOptions): this {
    return this.run("swapFrames", () => swapFrames(this.peek(), indexA, indexB, opts));
  }

  /**
   * Wrap a per-step underlying call. On success, push the new
   * snapshot and clear the redo stack (the user's branch becomes
   * authoritative). On failure, leave both stacks alone and rewrap
   * the error with the step index + op name so failures point at
   * the gesture, not the primitive.
   */
  private run(opName: string, fn: () => string): this {
    const stepIndex = this.step;
    let next: string;
    try {
      next = fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const wrapped = new Error(`history step ${stepIndex} (${opName}): ${message}`);
      if (err instanceof Error && err.stack) {
        wrapped.stack = err.stack;
      }
      throw wrapped;
    }
    this.undoStack.push(next);
    this.redoStack = [];
    this.step += 1;
    return this;
  }
}

/**
 * Entry point for the stack-aware surface.
 *
 * ```ts
 * const h = withHistory(m0).split(...).addOverlay(...);
 * h.undo(); // step backwards
 * ```
 */
export function withHistory(m0: string): History {
  return new History(m0);
}
