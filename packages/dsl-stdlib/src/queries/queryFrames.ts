import {
  parseM0StringToFullGraph,
  parseM0StringToLogicalFrames,
  parseM0StringToRenderFrames,
  type EditorFrame,
  type LogicalFrame,
  type M0Rect,
  type RenderFrame,
  type StableKey,
} from "@m0saic/dsl";
import type {
  EditorMapper,
  EditorPredicate,
  QueryContext,
  QueryOptions,
} from "./findFrames";
import { containedIn } from "./withinBounds";

type RectFilter = (rect: M0Rect) => boolean;

/**
 * Cached query builder — parses `m0` once and reuses the editor /
 * render / logical walks across every method call. Same predicate
 * surface as the stateless `findFrames` family; right choice when
 * the same string is queried repeatedly (agent search loops, lint
 * passes, dictionary scoring).
 *
 * ```ts
 * const q = queryFrames(m0);
 * q.find(pred1);
 * q.count(pred2);
 * q.map(fn);
 *
 * // Chainable scope-narrowing via geometric containment:
 * q.within(eyeStableKey).render();          // all render frames in the eye region
 * q.within(qrRoot).within(eyeKey).editor(); // chain progressively narrows
 * ```
 *
 * `within(bounds | stableKey)` returns a new FrameQuery whose walks
 * yield only frames whose bounds are CONTAINED in the given region.
 * Cached walks are shared across the chain — `within()` filters the
 * already-parsed arrays, never re-parses.
 */
export class FrameQuery {
  private readonly m0: string;
  private readonly width: number;
  private readonly height: number;
  /** Lazy walks; populated on first access, shared across scoped children. */
  private editorCache: EditorFrame[] | null = null;
  private renderCache: RenderFrame[] | null = null;
  private logicalCache: LogicalFrame[] | null = null;
  /**
   * Composed containment filter. When `null`, walks return the full
   * unfiltered arrays. When set, walks filter by `f.bounds`. The
   * filter is composed across `within()` calls so chained scopes
   * intersect correctly without needing per-scope cache layers.
   */
  private readonly filter: RectFilter | null;
  /** Optional parent reference, so chained queries share the parent's cached parses. */
  private readonly parent: FrameQuery | null;

  constructor(
    m0: string,
    opts?: QueryOptions,
    filter: RectFilter | null = null,
    parent: FrameQuery | null = null,
  ) {
    this.m0 = m0;
    this.width = opts?.width ?? 1920;
    this.height = opts?.height ?? 1080;
    this.filter = filter;
    this.parent = parent;
  }

  // ── Walk accessors (lazy, cached, scope-aware) ────────────────────

  private editorBase(): EditorFrame[] {
    if (this.parent) return this.parent.editorBase();
    if (this.editorCache == null) {
      this.editorCache = parseM0StringToFullGraph(this.m0, this.width, this.height);
    }
    return this.editorCache;
  }
  private renderBase(): RenderFrame[] {
    if (this.parent) return this.parent.renderBase();
    if (this.renderCache == null) {
      this.renderCache = parseM0StringToRenderFrames(this.m0, this.width, this.height);
    }
    return this.renderCache;
  }
  private logicalBase(): LogicalFrame[] {
    if (this.parent) return this.parent.logicalBase();
    if (this.logicalCache == null) {
      this.logicalCache = parseM0StringToLogicalFrames(this.m0, this.width, this.height);
    }
    return this.logicalCache;
  }

  /** All editor frames (full structural tree). Filtered when scoped. */
  editor(): readonly EditorFrame[] {
    const base = this.editorBase();
    return this.filter ? base.filter((f) => this.filter!(f)) : base;
  }

  /** Rendered tiles only (`1` / `F`). Filtered when scoped. */
  render(): readonly RenderFrame[] {
    const base = this.renderBase();
    return this.filter ? base.filter((f) => this.filter!(f)) : base;
  }

  /** Logical leaves (rendered, in logical order). Filtered when scoped. */
  logical(): readonly LogicalFrame[] {
    const base = this.logicalBase();
    return this.filter ? base.filter((f) => this.filter!(f)) : base;
  }

  // ── Scope narrowing ───────────────────────────────────────────────

  /**
   * Return a new FrameQuery whose walks only yield frames whose bounds
   * are CONTAINED in the given region. Chainable.
   *
   *   - `M0Rect` argument: scope directly to that rect.
   *   - `StableKey` argument: look the key up in the editor walk,
   *     scope to that node's bounds. A missing key returns a query
   *     whose walks are empty (no throw).
   *
   * Cached parses are shared with the parent — `within()` never
   * re-parses. The new query composes its filter with the parent's,
   * so `q.within(A).within(B)` returns frames inside BOTH A and B.
   */
  within(boundsOrKey: M0Rect | StableKey): FrameQuery {
    let scope: M0Rect | null;
    if (typeof boundsOrKey === "string") {
      // Resolve stableKey → bounds via the editor walk. We compare
      // strings rather than branded-StableKey values since callers
      // often pass raw strings from external state (m0c labels, etc.).
      const target = this.editorBase().find(
        (f) => (f.meta.stableKey as unknown as string) === (boundsOrKey as unknown as string),
      );
      scope = target ? { x: target.x, y: target.y, width: target.width, height: target.height } : null;
    } else {
      scope = boundsOrKey;
    }

    if (scope === null) {
      // Missing key → empty scope (always-false filter); chainable.
      return new FrameQuery(this.m0, { width: this.width, height: this.height }, () => false, this);
    }

    const scopeRect = scope;
    const newFilter: RectFilter = this.filter
      ? (r) => this.filter!(r) && containedIn(r, scopeRect)
      : (r) => containedIn(r, scopeRect);
    return new FrameQuery(this.m0, { width: this.width, height: this.height }, newFilter, this);
  }

  // ── Editor-walk methods (default frame model, scope-aware) ────────

  find(predicate: EditorPredicate): EditorFrame[] {
    const out: EditorFrame[] = [];
    for (const f of this.editor()) {
      if (predicate(f, ctxFor(f))) out.push(f);
    }
    return out;
  }

  findFirst(predicate: EditorPredicate): EditorFrame | null {
    for (const f of this.editor()) {
      if (predicate(f, ctxFor(f))) return f;
    }
    return null;
  }

  stableKeys(predicate: EditorPredicate): StableKey[] {
    const out: StableKey[] = [];
    for (const f of this.editor()) {
      if (predicate(f, ctxFor(f))) out.push(f.meta.stableKey);
    }
    return out;
  }

  count(predicate: EditorPredicate): number {
    let n = 0;
    for (const f of this.editor()) {
      if (predicate(f, ctxFor(f))) n += 1;
    }
    return n;
  }

  map<T>(mapper: EditorMapper<T>): T[] {
    const frames = this.editor();
    const out: T[] = new Array(frames.length);
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]!;
      out[i] = mapper(f, ctxFor(f));
    }
    return out;
  }

  some(predicate: EditorPredicate): boolean {
    for (const f of this.editor()) {
      if (predicate(f, ctxFor(f))) return true;
    }
    return false;
  }

  every(predicate: EditorPredicate): boolean {
    for (const f of this.editor()) {
      if (!predicate(f, ctxFor(f))) return false;
    }
    return true;
  }
}

function ctxFor(frame: EditorFrame): QueryContext {
  return {
    stableKey: frame.meta.stableKey,
    parentStableKey: frame.meta.parentStableKey,
    depth: frame.meta.structuralDepth,
    logicalIndex: frame.logicalIndex,
  };
}

/** Entry point for the cached query surface. */
export function queryFrames(m0: string, opts?: QueryOptions): FrameQuery {
  return new FrameQuery(m0, opts);
}
