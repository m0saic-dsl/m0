/**
 * Text → labeled `.m0c` file string (the canonical m0+context format).
 *
 * Accepts any string the QR encoder can carry (URL, plain text, structured
 * payload, etc.); mode is auto-selected for compactness.
 *
 * Thin wrapper over `qrToM0` + `serializeM0cFile` from
 * `@m0saic/dsl-file-formats`. Every overlay-channel frame ends up labeled
 * with its stable-key catalog entry (`qr-eye-tl`, `qr-align-3`, …,
 * `qr-pack-{i}`, `qr-safe-area`), so dropping the file into the Layout
 * editor surfaces a navigable, labeled rectangle tree.
 *
 * Pairs with `qrToM0` (full struct) and `qrToMatrix` (raw matrix).
 *
 * @example
 *   // Template author: build, render to m0c, drag into Layout to inspect.
 *   const { m0c } = qrToM0c("https://m0saic.io", { channels: { eyes: true } });
 *   writeFileSync("debug.m0c", m0c);
 */

import { serializeM0cFile } from "@m0saic/dsl-file-formats";
import type { M0Label } from "@m0saic/dsl-file-formats";
import { qrToM0 } from "./qrToM0";
import type { QrToM0Options, QrToM0Result } from "./types";

export type QrToM0cOptions = QrToM0Options & {
  /** Serialization metadata forwarded to the m0c file. */
  m0c?: {
    /** `app` field in the m0c — identifies the generator. Default "qrToM0c". */
    app?: string;
    /** `appVersion` field in the m0c. Default undefined. */
    appVersion?: string;
    /** Optional title for the m0c file's meta block. */
    title?: string;
    /** Optional author. */
    author?: string;
    /** Optional source (e.g. the encoded text — auto-set to the input text). */
    source?: string;
    /** Optional free-form note. */
    note?: string;
  };
};

export type QrToM0cResult = QrToM0Result & {
  /** Serialized `.m0c` JSON file contents (with trailing newline). */
  m0c: string;
};

export function qrToM0c(text: string, opts: QrToM0cOptions = {}): QrToM0cResult {
  const { m0c: m0cMeta, ...qrOpts } = opts;
  const result = qrToM0(text, qrOpts);

  // Convert the labels map to the M0Label record shape expected by
  // serializeM0cFile (text + optional color).
  const labelsForM0c: Record<string, M0Label> = {};
  for (const [stableKey, text] of Object.entries(result.labels)) {
    labelsForM0c[stableKey] = { text };
  }

  const m0c = serializeM0cFile({
    m0: String(result.m0),
    size: { width: result.canvasW, height: result.canvasH },
    app: m0cMeta?.app ?? "qrToM0c",
    appVersion: m0cMeta?.appVersion,
    meta: {
      title: m0cMeta?.title,
      author: m0cMeta?.author,
      source: m0cMeta?.source ?? text,
      note: m0cMeta?.note,
    },
    labels: labelsForM0c,
  });

  return { ...result, m0c };
}
