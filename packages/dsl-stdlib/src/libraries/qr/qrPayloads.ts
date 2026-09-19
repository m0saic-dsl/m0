/**
 * Canonical QR payload string builders.
 *
 * QR codes carry arbitrary text; what makes a scanner offer a "Join Wi-Fi"
 * or "Add contact" action is the *shape* of that text. Each helper emits the
 * de-facto-standard string for one such convention. Callers then pass the
 * result into `qrToM0` / `qrToMatrix` / `qrToRects` / `qrToM0c` like any
 * other text.
 *
 * Pure, deterministic, no I/O.
 */

/** Replace each character matched by `chars` with `\<char>`. Used by wifi + vCard. */
function escapeWith(value: string, chars: ReadonlyArray<string>): string {
  let out = "";
  for (const ch of value) {
    if (chars.includes(ch)) out += `\\${ch}`;
    else out += ch;
  }
  return out;
}

// ── Wifi ────────────────────────────────────────────────────────────

export type QrPayloadWifiOptions = {
  ssid: string;
  password?: string;
  /** Default "WPA". Use "nopass" for open networks. */
  encryption?: "WPA" | "WEP" | "nopass";
  /** Whether the SSID is hidden. Default false. */
  hidden?: boolean;
};

/**
 * Build a `WIFI:` payload string (de-facto spec from ZXing's contrib).
 *
 * Format: `WIFI:T:<auth>;S:<ssid>;P:<password>;H:<hidden>;;`
 * Special chars (`\`, `;`, `,`, `:`, `"`) inside SSID/password are escaped
 * with a leading backslash.
 */
export function qrPayloadWifi(opts: QrPayloadWifiOptions): string {
  if (!opts.ssid) throw new Error("qrPayloadWifi: ssid is required");
  const escapeChars = ["\\", ";", ",", ":", "\""] as const;
  const T = opts.encryption ?? "WPA";
  const S = escapeWith(opts.ssid, escapeChars);
  const parts = [`WIFI:T:${T}`, `S:${S}`];
  if (T !== "nopass" && opts.password !== undefined && opts.password !== "") {
    parts.push(`P:${escapeWith(opts.password, escapeChars)}`);
  }
  if (opts.hidden) parts.push("H:true");
  // Trailing `;;` terminates the payload per the de-facto spec.
  return `${parts.join(";")};;`;
}

// ── vCard 3.0 ───────────────────────────────────────────────────────

export type QrPayloadVCardAddress = {
  street?: string;
  city?: string;
  region?: string;
  postal?: string;
  country?: string;
};

export type QrPayloadVCardOptions = {
  /** Full display name (FN field). Required by vCard 3.0. */
  fullName: string;
  /** Structured name: Family;Given;Additional;Prefix;Suffix. Optional. */
  name?: {
    family?: string;
    given?: string;
    additional?: string;
    prefix?: string;
    suffix?: string;
  };
  org?: string;
  title?: string;
  /** One phone or many. */
  phone?: string | ReadonlyArray<string>;
  /** One email or many. */
  email?: string | ReadonlyArray<string>;
  url?: string;
  address?: QrPayloadVCardAddress;
  note?: string;
};

function vCardEscape(value: string): string {
  // RFC 6350 §3.4 — escape `\`, `,`, `;` and represent newlines as `\n`.
  // Order matters: backslash first.
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function toArray(v: string | ReadonlyArray<string> | undefined): ReadonlyArray<string> {
  if (v === undefined) return [];
  return typeof v === "string" ? [v] : v;
}

/**
 * Build a minimal vCard 3.0 payload. CRLF line endings per RFC 6350.
 * vCard 3.0 (not 4.0) is the format with the broadest scanner support.
 */
export function qrPayloadVCard(opts: QrPayloadVCardOptions): string {
  if (!opts.fullName) throw new Error("qrPayloadVCard: fullName is required");
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];
  if (opts.name) {
    const n = [
      opts.name.family ?? "",
      opts.name.given ?? "",
      opts.name.additional ?? "",
      opts.name.prefix ?? "",
      opts.name.suffix ?? "",
    ].map(vCardEscape).join(";");
    lines.push(`N:${n}`);
  }
  lines.push(`FN:${vCardEscape(opts.fullName)}`);
  if (opts.org) lines.push(`ORG:${vCardEscape(opts.org)}`);
  if (opts.title) lines.push(`TITLE:${vCardEscape(opts.title)}`);
  for (const tel of toArray(opts.phone)) {
    lines.push(`TEL:${vCardEscape(tel)}`);
  }
  for (const em of toArray(opts.email)) {
    lines.push(`EMAIL:${vCardEscape(em)}`);
  }
  if (opts.url) lines.push(`URL:${vCardEscape(opts.url)}`);
  if (opts.address) {
    // ADR:PO Box;Extended;Street;Locality;Region;Postal;Country
    const a = opts.address;
    const adr = [
      "", "",
      a.street ?? "",
      a.city ?? "",
      a.region ?? "",
      a.postal ?? "",
      a.country ?? "",
    ].map(vCardEscape).join(";");
    lines.push(`ADR:${adr}`);
  }
  if (opts.note) lines.push(`NOTE:${vCardEscape(opts.note)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

// ── Mailto ──────────────────────────────────────────────────────────

export type QrPayloadMailtoOptions = {
  to: string;
  subject?: string;
  body?: string;
  cc?: string;
  bcc?: string;
};

/**
 * Build a `mailto:` URI. Query values are %-encoded per RFC 2368/6068.
 */
export function qrPayloadMailto(opts: QrPayloadMailtoOptions): string {
  if (!opts.to) throw new Error("qrPayloadMailto: to is required");
  const query: string[] = [];
  if (opts.subject !== undefined) query.push(`subject=${encodeURIComponent(opts.subject)}`);
  if (opts.body !== undefined) query.push(`body=${encodeURIComponent(opts.body)}`);
  if (opts.cc !== undefined) query.push(`cc=${encodeURIComponent(opts.cc)}`);
  if (opts.bcc !== undefined) query.push(`bcc=${encodeURIComponent(opts.bcc)}`);
  const qs = query.length ? `?${query.join("&")}` : "";
  return `mailto:${opts.to}${qs}`;
}

// ── Phone normalization ─────────────────────────────────────────────

function normalizePhone(phone: string): string {
  // Keep `+` (only at the start) and digits; drop common visual separators
  // (whitespace, dashes, dots, parens) and any other punctuation.
  const trimmed = phone.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) throw new Error(`normalizePhone: no digits in ${JSON.stringify(phone)}`);
  return `${plus}${digits}`;
}

// ── Tel ──────────────────────────────────────────────────────────────

export type QrPayloadTelOptions = { phone: string };

/** Build a `tel:` URI per RFC 3966. Strips visual separators. */
export function qrPayloadTel(opts: QrPayloadTelOptions): string {
  return `tel:${normalizePhone(opts.phone)}`;
}

// ── SMS ──────────────────────────────────────────────────────────────

export type QrPayloadSmsOptions = {
  phone: string;
  body?: string;
};

/** Build an `sms:` URI per RFC 5724. Body is %-encoded. */
export function qrPayloadSms(opts: QrPayloadSmsOptions): string {
  const num = normalizePhone(opts.phone);
  const qs = opts.body !== undefined ? `?body=${encodeURIComponent(opts.body)}` : "";
  return `sms:${num}${qs}`;
}

// ── Geo ──────────────────────────────────────────────────────────────

export type QrPayloadGeoOptions = {
  lat: number;
  lng: number;
  /** Optional altitude in metres. */
  altitude?: number;
  /** Optional `q=` query (e.g. a label or search string). */
  query?: string;
};

/** Build a `geo:` URI per RFC 5870. */
export function qrPayloadGeo(opts: QrPayloadGeoOptions): string {
  if (!Number.isFinite(opts.lat) || !Number.isFinite(opts.lng)) {
    throw new Error("qrPayloadGeo: lat and lng must be finite numbers");
  }
  if (opts.altitude !== undefined && !Number.isFinite(opts.altitude)) {
    throw new Error("qrPayloadGeo: altitude must be finite when provided");
  }
  const coords = opts.altitude !== undefined
    ? `${opts.lat},${opts.lng},${opts.altitude}`
    : `${opts.lat},${opts.lng}`;
  const qs = opts.query !== undefined ? `?q=${encodeURIComponent(opts.query)}` : "";
  return `geo:${coords}${qs}`;
}
