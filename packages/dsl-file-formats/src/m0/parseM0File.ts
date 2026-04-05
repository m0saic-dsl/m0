import type { M0File, M0FileMeta } from "../types";

/**
 * Parse an .m0 file into the canonical M0File shape.
 *
 * - Accepts "# key: value" headers (case-sensitive keys).
 * - Requires: created
 * - Validates: format === "m0" (if present), version === 1 (if present)
 * - Canonicalizes payload to a single trimmed line (m0).
 * - Normalizes absent fields to null for stable shape.
 */
export function parseM0File(text: string): M0File {
  if (typeof text !== "string") {
    throw new Error("parseM0File: input must be a string");
  }

  const lines = text.split(/\r?\n/);

  const header: Record<string, string> = {};
  const payloadParts: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") continue;

    if (line.startsWith("#")) {
      if (line === "# m0" || line === "# m0saic") continue;

      const match = line.match(/^#\s*([^:]+):\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (key) header[key] = value;
      }
      continue;
    }

    payloadParts.push(line);
  }

  const m0 = payloadParts.join("").trim();
  if (m0 === "") {
    throw new Error("parseM0File: payload is empty");
  }

  // Validate version (if present) — must be exactly 1
  if (header.version != null) {
    const v = header.version.trim();
    if (v !== "1") {
      throw new Error(
        `parseM0File: unsupported version "${header.version}" (expected "1")`
      );
    }
  }

  const size = parseSize(header.size);
  if (header.size != null && size == null) {
    throw new Error(
      `parseM0File: invalid size "${header.size}" (expected WxH e.g. 1920x1080)`
    );
  }

  const created = header.created?.trim();
  if (!created) {
    throw new Error('parseM0File: missing required header "created"');
  }

  const app = header.app?.trim();
  const appVersion = header.appVersion?.trim();
  const meta = extractKnownMeta(header);

  const result: M0File = {
    version: 1,
    created,
    app: app && app !== "" ? app : null,
    appVersion: appVersion && appVersion !== "" ? appVersion : null,
    meta,
    size: size ?? null,
    m0,
  };

  return result;
}

function parseSize(v: string | undefined): { width: number; height: number } | null {
  if (v == null || v.trim() === "") return null;

  const m = v.match(/^(\d+)x(\d+)$/);
  if (!m) return null;

  const width = Number(m[1]);
  const height = Number(m[2]);

  if (!Number.isInteger(width) || width <= 0) return null;
  if (!Number.isInteger(height) || height <= 0) return null;

  return { width, height };
}

function extractKnownMeta(header: Record<string, string>): M0FileMeta | null {
  const title = header.title?.trim();
  const author = header.author?.trim();
  const source = header.source?.trim();
  const note = header.note?.trim();

  const meta: M0FileMeta = {};

  if (title) meta.title = title;
  if (author) meta.author = author;
  if (source) meta.source = source;
  if (note) meta.note = note;

  return Object.keys(meta).length ? meta : null;
}
