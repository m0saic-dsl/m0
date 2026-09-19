/**
 * parse-svg-path (vendored)
 *
 * Original npm package: parse-svg-path
 * Version copied:       0.1.2
 * Copy date:            2026-05-31
 * Source (npm):         https://www.npmjs.com/package/parse-svg-path
 * Source (GitHub):      https://github.com/jkroso/parse-svg-path
 * Original author:      Jake Rosoman <jkroso@gmail.com>
 * License:              MIT (see ../LICENSE_MIT.md)
 *
 * Modifications from upstream:
 *   - Ported from CJS to TypeScript ESM.
 *   - Added an exported `PathSegment` type — a tuple of `[command, ...numbers]`.
 *   - Otherwise the parsing logic (regex, overloaded-moveto handling) is
 *     byte-identical to upstream.
 *
 * Parses an SVG path `d` attribute into an array of segments. Each
 * segment is a tuple `[command, ...numericArgs]`. Preserves command
 * case (uppercase = absolute, lowercase = relative).
 */

/** A parsed path segment: `[command, ...numericArgs]`. */
export type PathSegment = [string, ...number[]];

/** Number of expected numeric args per command (lowercase, applies to both cases). */
const LENGTH: Record<string, number> = {
  a: 7,
  c: 6,
  h: 1,
  l: 2,
  m: 2,
  q: 4,
  s: 4,
  t: 2,
  v: 1,
  z: 0,
};

/** Matches one command letter followed by its numeric blob. */
const SEGMENT_RE = /([astvzqmhlc])([^astvzqmhlc]*)/gi;

/** Matches a single numeric literal (integer / decimal / scientific). */
const NUMBER_RE = /-?[0-9]*\.?[0-9]+(?:e[-+]?\d+)?/gi;

function parseValues(args: string): number[] {
  const numbers = args.match(NUMBER_RE);
  return numbers ? numbers.map(Number) : [];
}

export function parseSvgPath(path: string): PathSegment[] {
  const data: PathSegment[] = [];

  path.replace(SEGMENT_RE, (_match, commandIn: string, argsRaw: string) => {
    let command = commandIn;
    let type = command.toLowerCase();
    const args = parseValues(argsRaw);

    // overloaded moveTo: extra coord pairs after M/m become implicit L/l.
    if (type === "m" && args.length > 2) {
      data.push([command, ...args.splice(0, 2)]);
      type = "l";
      command = command === "m" ? "l" : "L";
    }

    while (true) {
      const expected = LENGTH[type];
      if (args.length === expected) {
        data.push([command, ...args]);
        return "";
      }
      if (args.length < expected) {
        throw new Error("malformed path data");
      }
      data.push([command, ...args.splice(0, expected)]);
    }
  });

  return data;
}
