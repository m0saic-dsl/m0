/**
 * `editFileMeta` — lossless, format-agnostic metadata patcher.
 *
 * The serializers in this package are flat-option *builders*: to re-emit a file
 * you must re-pass every field, and dropping one silently nukes its data
 * (e.g. forgetting `background` blanks a `.m0c`'s derive image). That makes
 * "I just want to tweak `meta`/`custom` on an existing file" error-prone.
 *
 * `editFileMeta(content, patch)` closes that gap. It detects the format
 * (`.m0` / `.m0c` / `.m0g` / `.m0p` / `.m0v`), parses, merges the patch into
 * `meta` / `custom` / `agent`, and reserializes — **preserving every other
 * field** (background, labels, masks, fill, insets, rankSets, gold, pack
 * variants and their backgrounds, …).
 *
 * Merge semantics, per patch field:
 *  - `undefined` → leave the existing value untouched.
 *  - `null`      → clear the field (`meta`/`agent` → null).
 *  - an object   → shallow-merge over the existing object.
 *                  `custom` replaces wholesale when either side is not a plain
 *                  object (so a primitive/array `custom` overwrites cleanly).
 */

import type { M0FileMeta, M0AgentMeta, M0pVariantEntry } from "../types";
import { parseM0File, serializeM0File } from "../m0";
import { parseM0cFile, serializeM0cFile } from "../m0c";
import { parseM0pFile, serializeM0pFile } from "../m0p";
import { parseM0vFile, serializeM0vFile } from "../m0v";

/** Patch applied to a file's metadata. Omitted fields are left untouched. */
export type EditFileMetaPatch = {
  /** Merge over `meta` (shallow); `null` clears it. */
  meta?: M0FileMeta | null;
  /** Merge over `custom` (shallow when both are plain objects; else replace). */
  custom?: unknown;
  /** Merge over `agent` (shallow); `null` clears it. Ignored for `.m0v`. */
  agent?: M0AgentMeta | null;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/** undefined → keep; null → null; object → shallow-merge over existing. */
function mergeObjectField<T>(existing: T | null | undefined, patch: T | null | undefined): T | null {
  if (patch === undefined) return (existing ?? null) as T | null;
  if (patch === null) return null;
  if (isPlainObject(existing) && isPlainObject(patch)) return { ...existing, ...patch } as T;
  return patch;
}

/** undefined → keep; else shallow-merge plain objects, otherwise replace. */
function mergeCustom(existing: unknown, patch: unknown): unknown {
  if (patch === undefined) return existing ?? null;
  if (isPlainObject(existing) && isPlainObject(patch)) return { ...existing, ...patch };
  return patch;
}

/** Parsed `created` is an ISO string; the serializers want a Date. */
function asDate(created: unknown): Date | undefined {
  if (created instanceof Date) return created;
  if (typeof created === "string" && created) return new Date(created);
  return undefined;
}

type DetectedFormat = "m0" | "m0c" | "m0g" | "m0p" | "m0v";

/** Sniff the format: strip a leading comment block, JSON-parse, read `format`;
 *  a non-JSON body (or one without a `format`) is the text `.m0` DSL. */
function detectFormat(content: string): DetectedFormat {
  const stripped = content.replace(/^\s*(?:#[^\n]*\n)+/, "");
  try {
    const obj = JSON.parse(stripped);
    if (isPlainObject(obj) && typeof obj.format === "string") {
      const f = obj.format;
      if (f === "m0c" || f === "m0g" || f === "m0p" || f === "m0v") return f;
    }
  } catch {
    /* not JSON → text .m0 */
  }
  return "m0";
}

/** Map a parsed pack variant back to the serializer's flat input (lossless). */
function variantToInput(v: M0pVariantEntry) {
  return {
    size: v.size,
    m0: v.m0,
    meta: v.meta ?? undefined,
    agent: (v as { agent?: M0AgentMeta | null }).agent ?? undefined,
    labels: v.labels ?? undefined,
    background: (v.derive as { background?: string | null } | undefined)?.background ?? null,
    masks: (v as { masks?: unknown }).masks ?? undefined,
    fill: (v as { fill?: unknown }).fill ?? undefined,
    insets: (v as { insets?: unknown }).insets ?? undefined,
    rankSets: (v as { rankSets?: unknown }).rankSets ?? undefined,
    custom: v.custom ?? undefined,
    created: asDate((v as { created?: unknown }).created),
    app: (v as { app?: string | null }).app ?? undefined,
    appVersion: (v as { appVersion?: string | null }).appVersion ?? undefined,
  } as Record<string, unknown>;
}

/**
 * Patch a file's `meta` / `custom` / `agent` in place, preserving all other
 * fields. Returns the reserialized file string.
 */
export function editFileMeta(content: string, patch: EditFileMetaPatch): string {
  const fmt = detectFormat(content);

  if (fmt === "m0") {
    const f = parseM0File(content);
    return serializeM0File({
      m0: f.m0,
      size: f.size,
      created: asDate(f.created),
      app: f.app,
      appVersion: f.appVersion,
      meta: mergeObjectField(f.meta, patch.meta),
      agent: mergeObjectField(f.agent, patch.agent),
    });
  }

  if (fmt === "m0p") {
    const f = parseM0pFile(content);
    const variants: Record<string, ReturnType<typeof variantToInput>> = {};
    for (const [key, v] of Object.entries(f.variants)) variants[key] = variantToInput(v);
    return serializeM0pFile({
      variants: variants as never,
      created: asDate(f.created),
      app: f.app,
      appVersion: f.appVersion,
      meta: mergeObjectField(f.meta, patch.meta),
      agent: mergeObjectField((f as { agent?: M0AgentMeta | null }).agent, patch.agent),
      regions: f.regions,
      custom: mergeCustom(f.custom, patch.custom),
    });
  }

  if (fmt === "m0v") {
    const f = parseM0vFile(content);
    // `.m0v` carries no agent block; an agent patch is ignored here.
    return serializeM0vFile({
      outputs: f.outputs,
      assets: f.assets,
      created: asDate(f.created),
      app: f.app,
      appVersion: f.appVersion,
      meta: mergeObjectField(f.meta, patch.meta),
      custom: mergeCustom(f.custom, patch.custom),
    });
  }

  // m0c / m0g — same parser; `gold` presence re-emits the `.m0g` flavor.
  const f = parseM0cFile(content);
  return serializeM0cFile({
    m0: f.m0,
    size: f.size,
    created: asDate(f.created),
    app: f.app,
    appVersion: f.appVersion,
    meta: mergeObjectField(f.meta, patch.meta),
    agent: mergeObjectField(f.agent, patch.agent),
    labels: f.labels,
    background: f.derive?.background ?? null,
    masks: f.masks,
    fill: f.fill,
    insets: f.insets,
    rankSets: f.rankSets,
    gold: f.gold ?? null,
    custom: mergeCustom(f.custom, patch.custom),
  });
}
