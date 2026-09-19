import {
  parseM0StringToFullGraph,
  parseM0StringToLogicalFrames,
  parseM0StringToRenderFrames,
  type EditorFrame,
  type LogicalFrame,
  type RenderFrame,
  type StableKey,
} from "@m0saic/dsl";

/**
 * Predicate query API.
 *
 * Frame-walk primitives that take an m0 string + predicate and
 * return frame data, so consumers never touch
 * `parseM0StringToFullGraph` directly. Mirrors `Array.prototype`
 * semantics deliberately — `find` / `filter` / `map` / `some` /
 * `every` are already in every JS dev's muscle memory.
 *
 * Default frame model: `EditorFrame` — the full structural tree
 * (groups, frames, passthroughs, nulls). Variants
 * `findRenderFrames` / `findLogicalFrames` swap the walk for
 * callers that only care about rendered tiles or logical leaves.
 *
 * Predicate signature: `(frame, ctx)` where `ctx` carries the
 * common bits that aren't directly on the frame (`stableKey`,
 * `depth`, `parentStableKey`, `logicalIndex`). Predicates are plain
 * JS — no string query DSL.
 *
 * Stateless: each helper parses internally. Use `queryFrames(m0)`
 * (separate file) for repeated queries on one string.
 */

export type QueryContext = {
  stableKey: StableKey;
  parentStableKey: StableKey | null;
  /** Structural depth (NOT overlay depth). 0 = root. */
  depth: number;
  /** 0-based logical index for rendered frames; `undefined` otherwise. */
  logicalIndex: number | undefined;
};

export type EditorPredicate = (frame: EditorFrame, ctx: QueryContext) => boolean;
export type EditorMapper<T> = (frame: EditorFrame, ctx: QueryContext) => T;

export type QueryOptions = {
  /** Canvas width used during parse. Default 1920. */
  width?: number;
  /** Canvas height used during parse. Default 1080. */
  height?: number;
};

const DEFAULT_W = 1920;
const DEFAULT_H = 1080;

function ctxFor(frame: EditorFrame): QueryContext {
  return {
    stableKey: frame.meta.stableKey,
    parentStableKey: frame.meta.parentStableKey,
    depth: frame.meta.structuralDepth,
    logicalIndex: frame.logicalIndex,
  };
}

function editorWalk(m0: string, opts?: QueryOptions): EditorFrame[] {
  return parseM0StringToFullGraph(m0, opts?.width ?? DEFAULT_W, opts?.height ?? DEFAULT_H);
}

// ── Stateless helpers (default: EditorFrame) ──────────────────────

/** Return every editor frame matching `predicate`. */
export function findFrames(
  m0: string,
  predicate: EditorPredicate,
  opts?: QueryOptions,
): EditorFrame[] {
  const frames = editorWalk(m0, opts);
  const out: EditorFrame[] = [];
  for (const f of frames) {
    if (predicate(f, ctxFor(f))) out.push(f);
  }
  return out;
}

/** Return the first editor frame matching `predicate`, or `null`. */
export function findFirstFrame(
  m0: string,
  predicate: EditorPredicate,
  opts?: QueryOptions,
): EditorFrame | null {
  const frames = editorWalk(m0, opts);
  for (const f of frames) {
    if (predicate(f, ctxFor(f))) return f;
  }
  return null;
}

/** Return the StableKey of every editor frame matching `predicate`. */
export function findStableKeys(
  m0: string,
  predicate: EditorPredicate,
  opts?: QueryOptions,
): StableKey[] {
  const frames = editorWalk(m0, opts);
  const out: StableKey[] = [];
  for (const f of frames) {
    if (predicate(f, ctxFor(f))) out.push(f.meta.stableKey);
  }
  return out;
}

/** Count editor frames matching `predicate`. */
export function countFrames(
  m0: string,
  predicate: EditorPredicate,
  opts?: QueryOptions,
): number {
  const frames = editorWalk(m0, opts);
  let n = 0;
  for (const f of frames) {
    if (predicate(f, ctxFor(f))) n += 1;
  }
  return n;
}

/** Map every editor frame through `mapper`. */
export function mapFrames<T>(
  m0: string,
  mapper: EditorMapper<T>,
  opts?: QueryOptions,
): T[] {
  const frames = editorWalk(m0, opts);
  const out: T[] = new Array(frames.length);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]!;
    out[i] = mapper(f, ctxFor(f));
  }
  return out;
}

/** True iff at least one editor frame matches `predicate`. */
export function someFrame(
  m0: string,
  predicate: EditorPredicate,
  opts?: QueryOptions,
): boolean {
  const frames = editorWalk(m0, opts);
  for (const f of frames) {
    if (predicate(f, ctxFor(f))) return true;
  }
  return false;
}

/** True iff every editor frame matches `predicate`. */
export function everyFrame(
  m0: string,
  predicate: EditorPredicate,
  opts?: QueryOptions,
): boolean {
  const frames = editorWalk(m0, opts);
  for (const f of frames) {
    if (!predicate(f, ctxFor(f))) return false;
  }
  return true;
}

// ── Variant walks (rendered-only / logical-only) ───────────────────

/** Render-only walk: iterate rendered tiles (`1` / `F`) only. */
export function findRenderFrames(
  m0: string,
  predicate: (frame: RenderFrame) => boolean,
  opts?: QueryOptions,
): RenderFrame[] {
  const frames = parseM0StringToRenderFrames(
    m0,
    opts?.width ?? DEFAULT_W,
    opts?.height ?? DEFAULT_H,
  );
  return frames.filter(predicate);
}

/** Logical-only walk: iterate logical leaves (rendered, in logical order). */
export function findLogicalFrames(
  m0: string,
  predicate: (frame: LogicalFrame) => boolean,
  opts?: QueryOptions,
): LogicalFrame[] {
  const frames = parseM0StringToLogicalFrames(
    m0,
    opts?.width ?? DEFAULT_W,
    opts?.height ?? DEFAULT_H,
  );
  return frames.filter(predicate);
}
