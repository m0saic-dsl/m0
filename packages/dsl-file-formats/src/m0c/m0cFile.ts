import { formatISO } from "../m0/serializeM0File";
import { toCanonicalM0String, type M0Label } from "@m0saic/dsl";
import type { M0cFile, M0FileMeta, M0cDeriveImage } from "../types";

// ─────────────────────────────────────────────────────────────
// Serialize
// ─────────────────────────────────────────────────────────────

export function serializeM0cFile(opts: {
  m0: string;
  size?: { width: number; height: number } | null;
  created?: Date;
  app?: string | null;
  appVersion?: string | null;
  meta?: M0FileMeta | null;
  labels?: Record<string /* stableKey */, M0Label> | null;
  deriveImage?: M0cDeriveImage | null;
}): string {
  const created = opts.created ?? new Date();

  const m0 = toCanonicalM0String(opts.m0);
  if (!m0) {
    throw new Error("serializeM0cFile: m0 layout string cannot be empty.");
  }

  const size = opts.size ?? null;
  if (size) assertValidSize(size.width, size.height);

  const app = opts.app ?? null;
  const appVersion = opts.appVersion ?? null;
  const meta = normalizeMeta(opts.meta ?? null);
  const labels = normalizeLabels(opts.labels ?? null);
  const derive = normalizeDerive(opts.deriveImage ?? null);

  const file: M0cFile = {
    format: "m0c",
    version: 1,
    created: formatISO(created),
    app: app && app.trim() !== "" ? app.trim() : null,
    appVersion: appVersion && appVersion.trim() !== "" ? appVersion.trim() : null,
    meta,
    size,
    m0,
    labels,
    derive,
  };

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

function normalizeLabels(
  labels: Record<string, M0Label> | null
): Record<string, M0Label> | null {
  if (!labels) return null;

  const out: Record<string, M0Label> = {};
  for (const [k, v] of Object.entries(labels).sort(([a], [b]) => a.localeCompare(b))) {
    if (!k) continue;
    if (!v) continue;

    const text = (v.text ?? "").trim();
    if (!text) continue;

    const color = v.color?.trim();
    out[k] = color ? { text, color } : { text };
  }

  return Object.keys(out).length ? out : null;
}

function normalizeDerive(img: M0cDeriveImage | null): { image: M0cDeriveImage | null } {
  return { image: img ?? null };
}

function assertValidSize(width: number, height: number): void {
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error("serializeM0cFile: width must be a positive integer.");
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error("serializeM0cFile: height must be a positive integer.");
  }
}

// ─────────────────────────────────────────────────────────────
// Parse
// ─────────────────────────────────────────────────────────────

export function parseM0cFile(jsonText: string): M0cFile {
  if (typeof jsonText !== "string") {
    throw new Error("parseM0cFile: input must be a string");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error("parseM0cFile: invalid JSON");
  }

  if (!isPlainObject(raw)) {
    throw new Error("parseM0cFile: expected JSON object");
  }

  const r = raw as Record<string, unknown>;

  if (r.format !== "m0c") {
    throw new Error(
      `parseM0cFile: expected format "m0c", got "${String(r.format)}"`
    );
  }
  if (r.version !== 1) {
    throw new Error(
      `parseM0cFile: expected version 1, got ${String(r.version)}`
    );
  }

  const created = typeof r.created === "string" ? r.created.trim() : "";
  if (!created) throw new Error("parseM0cFile: missing created timestamp");

  const m0 = typeof r.m0 === "string" ? r.m0.trim() : "";
  if (!m0) throw new Error("parseM0cFile: missing m0 payload");

  const size = parseSizeOrNull(r.size);
  const app = parseStringOrNull(r.app);
  const appVersion = parseStringOrNull(r.appVersion);
  const meta = parseMetaOrNull(r.meta);
  const labels = parseLabelsOrNull(r.labels);
  const derive = parseDerive(r.derive);

  return {
    format: "m0c",
    version: 1,
    created,
    app,
    appVersion,
    meta,
    size,
    m0,
    labels,
    derive,
  };
}

function parseStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function parseSizeOrNull(v: unknown): { width: number; height: number } | null {
  if (v == null) return null;
  if (!isPlainObject(v)) return null;

  const width = (v as any).width;
  const height = (v as any).height;

  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("parseM0cFile: invalid size (expected {width,height} positive ints or null)");
  }

  return { width, height };
}

function parseMetaOrNull(v: unknown): M0FileMeta | null {
  if (v == null) return null;
  if (!isPlainObject(v)) throw new Error("parseM0cFile: invalid meta (expected object or null)");

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

function parseLabelsOrNull(v: unknown): Record<string, M0Label> | null {
  if (v == null) return null;
  if (!isPlainObject(v) || Array.isArray(v)) {
    throw new Error("parseM0cFile: invalid labels (expected object map or null)");
  }

  const labelsObj = v as Record<string, unknown>;
  const out: Record<string, M0Label> = {};

  for (const [k, vv] of Object.entries(labelsObj)) {
    if (!k) continue;
    if (!isPlainObject(vv)) continue;

    const textRaw = (vv as any).text;
    const text = typeof textRaw === "string" ? textRaw.trim() : "";
    if (!text) continue;

    const colorRaw = (vv as any).color;
    const color = typeof colorRaw === "string" ? colorRaw.trim() : undefined;

    out[k] = color ? { text, color } : { text };
  }

  return Object.keys(out).length ? out : null;
}

function parseDerive(v: unknown): { image: M0cDeriveImage | null } {
  if (v == null) return { image: null };
  if (!isPlainObject(v)) throw new Error("parseM0cFile: invalid derive (expected object or null)");

  const image = (v as any).image;
  if (image == null) return { image: null };
  if (!isPlainObject(image)) throw new Error("parseM0cFile: invalid derive.image (expected object or null)");

  const mime = (image as any).mime;
  const bytes = (image as any).bytes;
  const b64 = (image as any).b64;

  if (mime !== "image/png" && mime !== "image/jpeg" && mime !== "image/webp") {
    throw new Error("parseM0cFile: invalid derive.image.mime");
  }
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    throw new Error("parseM0cFile: invalid derive.image.bytes");
  }
  if (typeof b64 !== "string" || b64.trim() === "") {
    throw new Error("parseM0cFile: invalid derive.image.b64");
  }

  return { image: { mime, bytes, b64 } };
}

function isPlainObject(x: unknown): x is Record<string, any> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
