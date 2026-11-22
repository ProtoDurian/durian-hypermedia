// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// The width of a chip's words (format version 10). Chips (a token's, a send's, an arrow's label) are set semibold in
// the page's sans font (Poppins), which is wider than the general estimate in scene.ts textW, most of all for digits
// and for m, w, M, W: "seq 2001" drew 53 px wide but was given 48. These widths were measured in a browser, one per
// printable ASCII character, semibold at 11 px (whole pixels, as the browser lays them out at that size); other
// characters use the general estimate with a tenth more. The widths scale with the font size.
import { textW } from "./scene";
const SEMI11 = [3, 4, 5, 11, 8, 10, 9, 3, 5, 6, 6, 8, 3, 7, 3, 5, 8, 4, 7, 7, 8, 7, 7, 7, 7, 7, 3, 3, 6, 8, 6, 7, 12, 8, 7, 9, 8, 6, 6, 10, 8, 3, 7, 8, 5, 10, 8, 10, 7, 10, 7, 7, 8, 8, 8, 11, 8, 7, 7, 5, 8, 6, 7, 8, 4, 8, 8, 7, 8, 8, 5, 8, 8, 3, 3, 7, 3, 12, 8, 8, 8, 8, 5, 7, 6, 8, 7, 9, 6, 7, 6, 6, 4, 6, 7];
export function chipW(s: string, font = 11): number {
  let w = 0;
  for (const ch of s) { const c = ch.codePointAt(0)!; w += c >= 32 && c < 127 ? (SEMI11[c - 32] * font) / 11 : textW(ch, font) * 1.1; }
  return w;
}
