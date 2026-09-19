import { formatISO } from "../m0/serializeM0File";
import type { M0vFile, M0FileMeta } from "../types";

// ─────────────────────────────────────────────────────────────
// Serialize
// ─────────────────────────────────────────────────────────────

export function serializeM0vFile(opts: {
  /**
   * Shared output preset bundle. Omit (or pass an empty object) for
   * an assets-only vocabulary. See `M0vFile.outputs`.
   */
  outputs?: Record<string, unknown>;
  /**
   * Shared asset bundle keyed by asset id. Omit (or pass an empty
   * object) for an outputs-only vocabulary. See `M0vFile.assets`.
   */
  assets?: Record<string, unknown>;
  created?: Date;
  app?: string | null;
  appVersion?: string | null;
  meta?: M0FileMeta | null;
  /** Free-form JSON. Round-trips unchanged. */
  custom?: unknown | null;
}): string {
  const created = opts.created ?? new Date();

  // Outputs and assets are both optional first-class slots. When
  // provided, validate the shape (non-null object, not an array);
  // when absent, omit from the serialized file entirely so an
  // assets-only or custom-only vocab doesn't carry meaningless
  // `"outputs": {}` lines.
  if (opts.outputs !== undefined) {
    if (opts.outputs === null || typeof opts.outputs !== "object" || Array.isArray(opts.outputs)) {
      throw new Error("serializeM0vFile: outputs must be an object map when provided");
    }
  }
  if (opts.assets !== undefined) {
    if (opts.assets === null || typeof opts.assets !== "object" || Array.isArray(opts.assets)) {
      throw new Error("serializeM0vFile: assets must be an object map when provided");
    }
  }

  const app = opts.app ?? null;
  const appVersion = opts.appVersion ?? null;
  const meta = normalizeMeta(opts.meta ?? null);

  const file: M0vFile = {
    format: "m0v",
    version: 1,
    created: formatISO(created),
    app: app && app.trim() !== "" ? app.trim() : null,
    appVersion: appVersion && appVersion.trim() !== "" ? appVersion.trim() : null,
    meta,
    custom: opts.custom ?? null,
  };
  if (opts.outputs && Object.keys(opts.outputs).length > 0) {
    file.outputs = opts.outputs;
  }
  if (opts.assets && Object.keys(opts.assets).length > 0) {
    file.assets = opts.assets;
  }

  return JSON.stringify(file, null, 2) + "\n";
}

function normalizeMeta(meta: M0FileMeta | null): M0FileMeta | null {
  if (!meta) return null;

  const out: M0FileMeta = {};
  const order: (keyof M0FileMeta)[] = ["title", "author", "source", "note"];

  for (const k of order) {
    const v = meta[k];
    if (v != null) {
      const trimmed = v.trim();
      if (trimmed !== "") out[k] = trimmed;
    }
  }

  return Object.keys(out).length ? out : null;
}

// ─────────────────────────────────────────────────────────────
// Parse
// ─────────────────────────────────────────────────────────────

export function parseM0vFile(jsonText: string): M0vFile {
  if (typeof jsonText !== "string") {
    throw new Error("parseM0vFile: input must be a string");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error("parseM0vFile: invalid JSON");
  }

  if (!isPlainObject(raw)) {
    throw new Error("parseM0vFile: expected JSON object");
  }

  const r = raw as Record<string, unknown>;

  if (r.format !== "m0v") {
    throw new Error(
      `parseM0vFile: expected format "m0v", got "${String(r.format)}"`
    );
  }
  if (r.version !== 1) {
    throw new Error(
      `parseM0vFile: expected version 1, got ${String(r.version)}`
    );
  }

  const created = typeof r.created === "string" ? r.created.trim() : "";
  if (!created) throw new Error("parseM0vFile: missing created timestamp");

  const outputs = parseOptionalMap(r.outputs, "outputs");
  const assets = parseOptionalMap(r.assets, "assets");
  const app = parseStringOrNull(r.app);
  const appVersion = parseStringOrNull(r.appVersion);
  const meta = parseMetaOrNull(r.meta);

  const parsed: M0vFile = {
    format: "m0v",
    version: 1,
    created,
    app,
    appVersion,
    meta,
    custom: r.custom === undefined ? null : r.custom,
  };
  if (outputs !== undefined) parsed.outputs = outputs;
  if (assets !== undefined) parsed.assets = assets;
  return parsed;
}

// Both `outputs` and `assets` are optional first-class slots — a
// vocab may carry either, both, or neither. We distinguish "not
// present" (return undefined → field omitted on the parsed object)
// from "present but malformed" (throw). Envelope-only validation:
// the platform loader validates each entry against MosaicOutput /
// MosaicAsset semantics.
function parseOptionalMap(v: unknown, fieldName: string): Record<string, unknown> | undefined {
  if (v === undefined) return undefined;
  if (v === null) {
    throw new Error(`parseM0vFile: invalid ${fieldName} (expected object map or omit, got null)`);
  }
  if (!isPlainObject(v)) {
    throw new Error(
      `parseM0vFile: invalid ${fieldName} (expected object map, got ` +
        (Array.isArray(v) ? "array" : typeof v) +
        ")"
    );
  }
  return v as Record<string, unknown>;
}

function parseStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function parseMetaOrNull(v: unknown): M0FileMeta | null {
  if (v == null) return null;
  if (!isPlainObject(v)) throw new Error("parseM0vFile: invalid meta (expected object or null)");

  const metaObj = v as Record<string, unknown>;
  const meta: M0FileMeta = {};
  for (const key of ["title", "author", "source", "note"] as const) {
    const vv = metaObj[key];
    if (typeof vv === "string") {
      const t = vv.trim();
      if (t) meta[key] = t;
    }
  }
  return Object.keys(meta).length ? meta : null;
}

function isPlainObject(x: unknown): x is Record<string, any> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
