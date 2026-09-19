import { normalizeCandidateContext } from "../agent";
import { canonicalizeAndValidateM0 } from "../m0Validation";

import type { M0AgentComment, M0AgentMeta, M0File, M0FileMeta } from "../types";

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
  // Agent annotations live under the `m0agent:` namespace. The standard
  // key regex stops at the first colon, so `# m0agent:note: foo` would
  // otherwise collapse to a single `m0agent` key — losing every subkey
  // but the last. We collect them into their own bucket here.
  const agentHeader: Record<string, string> = {};
  // `m0agent:comment` is the one subkey that may legitimately repeat —
  // the Reddit-style thread orbiting the OP. Collect all occurrences in
  // insertion order so the parser preserves chronology even when entries
  // lack timestamps.
  const agentCommentLines: string[] = [];
  const payloadParts: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") continue;

    if (line.startsWith("#")) {
      if (line === "# m0" || line === "# m0saic") continue;

      // Namespaced agent line: `# m0agent:<subkey>: <value>`. Capture
      // the subkey and value separately so subkeys don't overwrite each
      // other through the generic header map.
      const agentMatch = line.match(/^#\s*m0agent:([^:]+):\s*(.*)$/);
      if (agentMatch) {
        const subkey = agentMatch[1].trim();
        const value = agentMatch[2].trim();
        if (subkey === "comment") {
          agentCommentLines.push(value);
        } else if (subkey) {
          agentHeader[subkey] = value;
        }
        continue;
      }

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

  // Accept canonical OR pretty DSL on read, normalize to canonical, and reject
  // invalid m0 — the parsed record is always canonical and never broken.
  const m0 = canonicalizeAndValidateM0(
    "parseM0File",
    payloadParts.join(""),
    "parseM0File: payload is empty",
  );

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
  const agent = extractAgentMeta(agentHeader, agentCommentLines);

  const result: M0File = {
    version: 1,
    created,
    app: app && app !== "" ? app : null,
    appVersion: appVersion && appVersion !== "" ? appVersion : null,
    meta,
    agent,
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

/**
 * Extract `# m0agent:<key>: <value>` headers into an {@link M0AgentMeta}.
 *
 * `note` / `question` round-trip as plain trimmed strings. `regions` /
 * `context` are JSON-decoded; if the JSON is malformed the field is
 * silently dropped (the file is still well-formed without it — the
 * `m0agent:*` namespace is informational, not structural).
 */
function extractAgentMeta(
  header: Record<string, string>,
  commentLines: string[],
): M0AgentMeta | null {
  const id = header.id?.trim();
  const note = header.note?.trim();
  const question = header.question?.trim();
  const rawRegions = header.regions?.trim();
  const rawContext = header.context?.trim();
  const rawResponse = header.response?.trim();

  const agent: M0AgentMeta = {};
  if (id) agent.id = id;
  if (note) agent.note = note;
  if (question) agent.question = question;

  if (rawRegions) {
    const parsed = safeJsonParse(rawRegions);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      // Coerce values to strings — agent metadata is human-readable region
      // names, not arbitrary payloads. Anything non-string is dropped.
      const regions: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string") regions[k] = v;
      }
      if (Object.keys(regions).length) agent.regions = regions;
    }
  }

  if (rawContext) {
    const parsed = safeJsonParse(rawContext);
    const narrowed = normalizeCandidateContext(parsed);
    if (narrowed !== undefined) agent.context = narrowed;
  }

  if (rawResponse) {
    const parsed = safeJsonParse(rawResponse);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const r = parsed as Record<string, unknown>;
      if (typeof r.body === "string" && r.body.trim() !== "") {
        const out: { body: string; from?: string; at?: string } = {
          body: r.body,
        };
        if (typeof r.from === "string" && r.from.trim() !== "") out.from = r.from;
        if (typeof r.at === "string" && r.at.trim() !== "") out.at = r.at;
        agent.response = out;
      }
    }
  }

  if (commentLines.length > 0) {
    const comments: M0AgentComment[] = [];
    for (const raw of commentLines) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const parsed = safeJsonParse(trimmed);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      const c = parsed as Record<string, unknown>;
      if (typeof c.body !== "string" || c.body.trim() === "") continue;
      const out: M0AgentComment = { body: c.body };
      if (typeof c.id === "string" && c.id.trim() !== "") out.id = c.id;
      if (typeof c.from === "string" && c.from.trim() !== "") out.from = c.from;
      if (typeof c.at === "string" && c.at.trim() !== "") out.at = c.at;
      comments.push(out);
    }
    if (comments.length) agent.comments = comments;
  }

  return Object.keys(agent).length ? agent : null;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
