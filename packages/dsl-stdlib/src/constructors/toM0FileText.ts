import type { M0AgentMeta as M0AgentMetaFile } from "@m0saic/dsl-file-formats";
import { serializeM0File } from "@m0saic/dsl-file-formats";
import { toM0String } from "./toM0String";

/**
 * Structured agent metadata carried alongside a `.m0` layout candidate.
 *
 * Designed for agent ↔ human iteration loops where one side generates a
 * candidate layout and the other reviews it. The `.m0` header is the
 * transport: `parseM0File` silently passes unknown `# key: value` lines
 * through, so these fields are read by tooling that knows about them
 * without disturbing the existing format.
 *
 * Two audiences:
 *
 * - `note` / `question` are HUMAN-readable prose — what the writing side
 *   wants the reviewing side to look at or answer.
 * - `regions` / `context` are STRUCTURED data for the next agent in the
 *   chain — a downstream "context agent" (whose job is mostly routing
 *   information to known solutions) can `JSON.parse` them without having
 *   to extract intent from prose.
 */
export type M0AgentMeta = {
  /** Free-form prose: "Look at the spacing between bands 1 and 2." */
  note?: string;
  /** Specific question for the reviewing side. */
  question?: string;
  /**
   * Labels for layout regions, keyed by stableKey (the same identity
   * scheme `.m0c` uses for labels / masks / rank sets). Values are short
   * human-readable names (`"title-band"`, `"plot"`, etc.). stableKey
   * survives structural edits, so the annotation still points at the
   * right node after the human edits the layout in Layout and bounces it
   * back. Emitted as single-line JSON.
   */
  regions?: Record<string, string>;
  /**
   * Anything else serializable. Used to carry derivation context the
   * downstream agent can route on without re-deriving it (e.g. which
   * builder produced the layout, what constraint it was solving).
   */
  context?: unknown;
};

/**
 * Options for {@link toM0FileText}.
 *
 * `size`, `created`, and metadata fields are forwarded to the underlying
 * {@link serializeM0File} call. The `created` default is `new Date()` —
 * supply a fixed `Date` when callers need deterministic file content
 * (e.g. golden tests).
 */
export type M0FileTextOptions = {
  /** Optional canvas size header, e.g. `{ width: 1920, height: 1080 }`. */
  size?: { width: number; height: number };
  /** Override the `created` timestamp. Defaults to `new Date()`. */
  created?: Date;
  /** Optional `app` header (typically the authoring tool name). */
  app?: string;
  /** Optional `appVersion` header (typically a semver of the authoring tool). */
  appVersion?: string;
  /** Free-form meta block — emitted as `# title:` / `# author:` / `# source:` / `# note:` lines. */
  meta?: {
    title?: string;
    author?: string;
    source?: string;
    note?: string;
  };
  /**
   * Structured agent metadata. Emitted under the `m0agent:` namespace so
   * the lines coexist with the standard headers without colliding.
   */
  agent?: M0AgentMeta;
};

/**
 * Convert a raw m0 layout string into the text content of a valid `.m0` file.
 *
 * Validates the m0 string first (throws if invalid), then wraps with the
 * canonical header block produced by {@link serializeM0File} — including the
 * mandatory `created` header that bare m0 payloads lack. The returned string
 * is ready to write to disk and re-parse via `parseM0File` / `m0saic
 * make-wireframe --mfile`.
 *
 * Intended for tooling and agent-driven workflows that want to materialize a
 * layout string into an editable / reviewable artifact (Layout app, wireframe
 * preview, golden fixture) in one step.
 *
 * @param m0   - Raw or canonical m0 layout string.
 * @param opts - Optional header overrides.
 * @returns The full `.m0` file text (headers + payload + trailing newline).
 * @throws  If `m0` fails validation.
 *
 * @example
 *   import { writeFileSync } from "node:fs";
 *   import { weightedSplit, toM0FileText } from "@m0saic/dsl-stdlib";
 *
 *   const layout = weightedSplit([1, 13, 1], "row");
 *   const text = toM0FileText(layout, {
 *     size: { width: 1920, height: 1080 },
 *     meta: { title: "tick rail candidate v3" },
 *   });
 *   writeFileSync("/tmp/candidate.m0", text);
 */
export function toM0FileText(m0: string, opts?: M0FileTextOptions): string {
  // Validate (and canonicalize) the payload before handing it to the
  // serializer. The dsl's toCanonicalM0String is what serializeM0File runs
  // under the hood, but routing through `toM0String` here gives the caller
  // a clearer error message that points at this entry point.
  const canonical = toM0String(m0, "toM0FileText");
  return serializeM0File({
    m0: canonical,
    size: opts?.size,
    created: opts?.created,
    app: opts?.app ?? null,
    appVersion: opts?.appVersion ?? null,
    meta: opts?.meta ?? null,
    // The dsl-stdlib `M0AgentMeta` and dsl-file-formats `M0AgentMeta` are
    // structurally identical; cast over the brand to satisfy the compiler.
    agent: opts?.agent ? (opts.agent as unknown as M0AgentMetaFile) : null,
  });
}
