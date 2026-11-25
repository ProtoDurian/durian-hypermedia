// Long paths in labels (SPEC 6.15). A path is broken after its separators, but a phone's three lines then ended
// "registry/…" and lost the file's name, the one word the reader needs. Used only when the plain wrap would cut a path
// or break inside one of its segments, so every other label wraps as before:
// - a line ends only after a "/" or at a space; the box grows for a long segment (GROW times, or to WIDE);
// - up to MORE lines beyond the usual; past that the middle is left out ("…/") and the file's name stays.
// Every scan is one pass over the text.
type Measure = (s: string, font: number) => number;
const GROW = 1.7, WIDE = 180, MORE = 3, SKIP = "…/";
const SP = /^\s$/;

// a "/" with a character that is neither a space nor a "/" on each side
export function hasPath(s: string): boolean {
  for (let i = 1; i + 1 < s.length; i++) if (s[i] === "/" && s[i - 1] !== "/" && !SP.test(s[i - 1]) && s[i + 1] !== "/" && !SP.test(s[i + 1])) return true;
  return false;
}
// a word cut after each run of slashes: "a/b//c" is "a/", "b//", "c"
function segments(w: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (let i = 0; i < w.length; i++) {
    if (w[i] !== "/") continue;
    let j = i;
    while (j + 1 < w.length && w[j + 1] === "/") j++;
    out.push(w.slice(from, j + 1));
    from = j + 1;
    i = j;
  }
  if (from < w.length) out.push(w.slice(from));
  return out.length ? out : [w];
}
const words = (s: string) => s.split(/\s+/).filter(Boolean);

// does this wrap lose some of the label, or end a line inside a segment of a path?
export function hurtsPath(s: string, lines: string[]): boolean {
  if (lines.at(-1)?.endsWith("…")) return true;
  let at = 0;
  for (const line of lines.slice(0, -1)) {
    const i = s.indexOf(line, at);
    if (i < 0) return true; // a hyphen was added
    at = i + line.length;
    if (line.at(-1) === "/" || at >= s.length || SP.test(s[at])) continue;
    const from = Math.max(s.lastIndexOf(" ", at - 1) + 1, 0), to = s.indexOf(" ", at);
    if (hasPath(s.slice(from, to < 0 ? s.length : to))) return true;
  }
  return false;
}

// breakLong: the engine's own break of one word that is wider than any box may grow
export function wrapPath(s: string, font: number, maxW: number, maxLines: number, textW: Measure, breakLong: (w: string, width: number) => string[]): string[] {
  const ws = words(s);
  const width = Math.max(maxW, Math.min(Math.max(maxW * GROW, WIDE), Math.max(0, ...ws.flatMap(segments).map((x) => textW(x, font)))));
  const fits = (t: string) => textW(t, font) <= width + 0.5;
  const lines: string[] = [];
  let cur = "";
  for (const word of ws) segments(word).forEach((seg, k) => {
    const joined = cur ? `${cur}${k ? "" : " "}${seg}` : seg;
    if (fits(joined)) { cur = joined; return; }
    if (cur) lines.push(cur);
    const pieces = fits(seg) ? [seg] : breakLong(seg, width);
    lines.push(...pieces.slice(0, -1));
    cur = pieces.at(-1)!;
  });
  if (cur) lines.push(cur);
  const room = maxLines + MORE;
  if (lines.length <= room) return lines;
  return [lines[0], SKIP, ...lines.slice(-(room - 2))];
}

// one line (a chip, a cell): the end of a path, as much as fits ("…/providers.go"); null when even that does not fit
export function pathTail(s: string, fits: (t: string) => boolean): string | null {
  if (/\s/.test(s) || !hasPath(s)) return null;
  const segs = segments(s);
  for (let k = 1; k < segs.length; k++) { const t = SKIP + segs.slice(k).join(""); if (fits(t)) return t; }
  return null;
}
