import type { M0AgentMeta, M0FileMeta } from "../types";
import { normalizeCandidateContext } from "../agent";
import { canonicalizeAndValidateM0 } from "../m0Validation";

/**
 * Serialize an .m0 file.
 *
 * Produces a deterministic, human-readable header followed by the
 * canonical m0 layout string. The DSL payload is always canonicalized
 * (whitespace stripped, aliases normalized: F→1, >→0).
 *
 * Agent annotations (`agent: { note, question, regions, context }`) are
 * emitted under the `# m0agent:*` namespace after the standard meta block.
 */
export function serializeM0File(opts: {
  m0: string;
  size?: { width: number; height: number } | null;
  created?: Date;
  app?: string | null;
  appVersion?: string | null;
  meta?: M0FileMeta | null;
  agent?: M0AgentMeta | null;
}): string {
  const layout = canonicalizeAndValidateM0(
    "serializeM0File",
    opts.m0,
    "serializeM0File: m0 layout string cannot be empty.",
  );

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

  appendAgentLines(lines, opts.agent ?? null);

  // Separate header from payload
  lines.push("");
  // Payload (single-line canonical layout)
  lines.push(layout);

  return lines.join("\n") + "\n";
}

/**
 * Append the four `# m0agent:*` header lines for any populated fields on
 * {@link M0AgentMeta}. Prose values get newlines / runs-of-whitespace
 * collapsed back to single spaces so the line-based parser doesn't see
 * a header value spilling onto an unrelated line. Object values are
 * emitted as single-line `JSON.stringify`.
 */
function appendAgentLines(lines: string[], agent: M0AgentMeta | null): void {
  if (!agent) return;
  // The post's own id (4chan-style deep-link target). Emit first so the
  // header is grep-able at the top of the agent block.
  if (agent.id && agent.id.trim() !== "") {
    lines.push(`# m0agent:id: ${agent.id.trim()}`);
  }
  // The `.m0` transport is line-based, so prose is collapsed to a single line
  // here — a newline would split the value across unrelated header lines. Rich
  // (markdown) agent prose round-trips through the `.m0c` / `.m0p` JSON formats,
  // which preserve line structure via `normalizeAgentProse`.
  if (agent.note && agent.note.trim() !== "") {
    lines.push(`# m0agent:note: ${collapseToSingleLine(agent.note)}`);
  }
  if (agent.question && agent.question.trim() !== "") {
    lines.push(`# m0agent:question: ${collapseToSingleLine(agent.question)}`);
  }
  if (agent.regions && Object.keys(agent.regions).length > 0) {
    lines.push(`# m0agent:regions: ${JSON.stringify(agent.regions)}`);
  }
  if (agent.context !== undefined) {
    // Narrow first — drops the header entirely when the context is
    // empty (`{}`) or non-object so we don't litter files with empty
    // `# m0agent:context: {}` noise.
    const normalized = normalizeCandidateContext(agent.context);
    if (normalized !== undefined) {
      lines.push(`# m0agent:context: ${JSON.stringify(normalized)}`);
    }
  }
  // The response slot closes the loop: writing party emits the ask
  // (above lines), responding party fills this in. Same file becomes
  // the conversation log.
  if (agent.response && agent.response.body.trim() !== "") {
    const compact = {
      body: collapseToSingleLine(agent.response.body),
      ...(agent.response.from && agent.response.from.trim() !== ""
        ? { from: agent.response.from.trim() }
        : {}),
      ...(agent.response.at && agent.response.at.trim() !== ""
        ? { at: agent.response.at.trim() }
        : {}),
    };
    lines.push(`# m0agent:response: ${JSON.stringify(compact)}`);
  }
  // Comment thread (Reddit-style orbit around the OP). One header line
  // per comment, JSON-encoded so the body can carry punctuation without
  // ambiguity. The single repeated subkey in the namespace — the parser
  // collects them into the comments array in insertion order.
  if (agent.comments && agent.comments.length > 0) {
    for (const c of agent.comments) {
      if (!c || typeof c.body !== "string" || c.body.trim() === "") continue;
      // Field order: id first so `grep '"id":"abc123"'` finds the
      // comment quickly when scanning a session directory.
      const compact = {
        ...(c.id && c.id.trim() !== "" ? { id: c.id.trim() } : {}),
        body: collapseToSingleLine(c.body),
        ...(c.from && c.from.trim() !== "" ? { from: c.from.trim() } : {}),
        ...(c.at && c.at.trim() !== "" ? { at: c.at.trim() } : {}),
      };
      lines.push(`# m0agent:comment: ${JSON.stringify(compact)}`);
    }
  }
}

function collapseToSingleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
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
