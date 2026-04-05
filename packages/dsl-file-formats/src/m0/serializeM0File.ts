import type { M0FileMeta } from "../types";
import { toCanonicalM0String } from "@m0saic/dsl";

/**
 * Serialize an .m0 file.
 *
 * Produces a deterministic, human-readable header followed by the
 * canonical m0 layout string. The DSL payload is always canonicalized
 * (whitespace stripped, aliases normalized: F→1, >→0).
 */
export function serializeM0File(opts: {
  m0: string;
  size?: { width: number; height: number } | null;
  created?: Date;
  app?: string | null;
  appVersion?: string | null;
  meta?: M0FileMeta | null;
}): string {
  const layout = toCanonicalM0String(opts.m0);
  if (!layout) {
    throw new Error("serializeM0File: m0 layout string cannot be empty.");
  }

  const created = opts.created ?? new Date();
  const app = (opts.app ?? null) ? String(opts.app).trim() : null;
  const appVersion = (opts.appVersion ?? null) ? String(opts.appVersion).trim() : null;
  const meta = opts.meta ?? null;
  const size = opts.size ?? null;

  if (size) assertValidSize(size.width, size.height);

  const lines: string[] = [
    "# m0",
    "# version: 1",
    `# created: ${formatISO(created)}`,
  ];

  if (size) {
    lines.push(`# size: ${size.width}x${size.height}`);
  }

  if (app) {
    lines.push(`# app: ${app}`);
  }

  if (appVersion) {
    lines.push(`# appVersion: ${appVersion}`);
  }

  if (meta) {
    const order: (keyof M0FileMeta)[] = ["title", "author", "source", "note"];
    for (const key of order) {
      const value = meta[key];
      if (value != null && value.trim() !== "") {
        lines.push(`# ${key}: ${value.trim()}`);
      }
    }
  }

  // Separate header from payload
  lines.push("");
  // Payload (single-line canonical layout)
  lines.push(layout);

  return lines.join("\n") + "\n";
}

function assertValidSize(width: number, height: number): void {
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error("serializeM0File: width must be a positive integer.");
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error("serializeM0File: height must be a positive integer.");
  }
}

/**
 * Format a Date as UTC ISO 8601 with milliseconds and trailing Z.
 *
 * Example: `2026-02-13T09:15:22.123Z`
 */
export function formatISO(d: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");

  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` +
    `.${pad(d.getUTCMilliseconds(), 3)}Z`
  );
}
