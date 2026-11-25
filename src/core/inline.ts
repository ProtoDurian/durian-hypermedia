// Inline marks in an animation's prose (SPEC 6.15): captions, say and note= take three marks and nothing else:
// `code`, **bold** and *italic*. Labels on the stage stay plain text. Pure: no HTML is ever made here; the renderers make
// React elements and text nodes from the spans (src/ui/inline.tsx, src/ui/inline-dom.ts). Every scan is one pass over the
// text with no pattern that can backtrack: a mark's closer is the next star, found once.
export interface Span { t: string; code?: true; b?: true; i?: true }

const WORD = /^[\p{Script=Latin}\p{N}_]$/u; // one character: a letter of the Latin script, a number or _
const isWord = (c: string | undefined) => c !== undefined && WORD.test(c);
const isSpace = (c: string | undefined) => c === undefined || /^\s$/.test(c);

// a code span is set aside first, so a * inside it is only a *
export const unclosedTick = (s: string) => (s.split("`").length - 1) % 2 === 1;
// `code` runs: the start, the end (after the closing tick) and the text between the ticks (never empty, never over a line)
function codeRuns(s: string): { a: number; z: number; t: string }[] {
  const out: { a: number; z: number; t: string }[] = [];
  for (let i = 0; i < s.length;) {
    if (s[i] !== "`") { i++; continue; }
    let j = i + 1;
    while (j < s.length && s[j] !== "`" && s[j] !== "\n") j++;
    if (s[j] === "`" && j > i + 1) { out.push({ a: i, z: j + 1, t: s.slice(i + 1, j) }); i = j + 1; } else i++;
  }
  return out;
}
export const codeSpans = (s: string): string[] => codeRuns(s).map((r) => s.slice(r.a, r.z));

// where a mark of n stars opens and closes in t: it opens before a word and closes after one, so "2 * 3", "*.ts,*.js" and
// "a*b*c" are left as they are. The text between has no star, so the closer is the next star.
function marks(t: string, n: 1 | 2): { a: number; z: number; inner: string }[] {
  const out: { a: number; z: number; inner: string }[] = [];
  const next: number[] = new Array(t.length + 1).fill(-1);
  for (let k = t.length - 1; k >= 0; k--) next[k] = t[k] === "*" ? k : next[k + 1];
  const open = "*".repeat(n);
  for (let i = 0; i < t.length;) {
    if (!t.startsWith(open, i)) { i++; continue; }
    const before = t[i - 1], first = t[i + n];
    const blocked = isWord(before) || before === "*" || (n === 1 && (before === "." || before === "/"));
    if (blocked || first === undefined || isSpace(first) || first === "*") { i++; continue; }
    const j = next[i + n];
    if (j < 0 || !t.startsWith(open, j) || isSpace(t[j - 1])) { i++; continue; }
    const after = t[j + n];
    const stops = isWord(after) || after === "*" || (n === 1 && (after === "/" || (after === "." && isWord(t[j + n + 1]))));
    if (stops) { i++; continue; }
    out.push({ a: i, z: j + n, inner: t.slice(i + n, j) });
    i = j + n;
  }
  return out;
}
function cut(parts: Span[], n: 1 | 2): Span[] {
  const mark = n === 2 ? "b" : "i";
  return parts.flatMap((p) => {
    const out: Span[] = [];
    let at = 0;
    for (const m of marks(p.t, n)) {
      if (m.a > at) out.push({ ...p, t: p.t.slice(at, m.a) });
      out.push({ ...p, t: m.inner, [mark]: true });
      at = m.z;
    }
    if (at < p.t.length) out.push({ ...p, t: p.t.slice(at) });
    return out;
  });
}
// a code span stands in the text as a marker (HOLE, its number, HOLE), so a bold or italic mark may enclose code
const HOLE = String.fromCharCode(1);
export function spans(s: string): Span[] {
  if (!s.includes("`") && !s.includes("*")) return [{ t: s }];
  const codes: string[] = [];
  let held = "", at = 0;
  for (const r of codeRuns(s)) { held += s.slice(at, r.a) + HOLE + (codes.push(r.t) - 1) + HOLE; at = r.z; }
  held += s.slice(at);
  return cut(cut([{ t: held }], 2), 1).flatMap((p) => p.t.split(HOLE).flatMap((t, k): Span[] => (k % 2 ? [{ ...p, t: codes[+t], code: true }] : t ? [{ ...p, t }] : [])));
}
export const hasMarks = (s: string) => (s.includes("`") || s.includes("*")) && spans(s).some((x) => x.code || x.b || x.i);
export const plain = (s: string) => spans(s).map((x) => x.t).join("");

// speech on the 2D stage is SVG, which does not flow text: the engine wraps the plain words, and each wrapped line is
// cut here into runs of one style, with where each starts and how wide it is.
const SP = /^\s$/;
export interface Run { t: string; x: number; w: number; code: boolean; b: boolean; i: boolean }
const MONO_EM = 0.6, BOLD_K = 1.06, CODE_PAD = 3;
export function lineRuns(text: string, lines: string[], font: number, textW: (s: string, f: number) => number): { runs: Run[]; w: number }[] {
  const chars = spans(text).flatMap((s) => [...s.t].map((ch) => ({ ch, code: !!s.code, b: !!s.b, i: !!s.i })));
  let at = 0, last = { code: false, b: false, i: false };
  return lines.map((line) => {
    while (at < chars.length && SP.test(chars[at].ch)) at++;
    const styled = [...line].map((ch) => {
      const space = SP.test(ch);
      if (space) while (at + 1 < chars.length && SP.test(chars[at].ch) && SP.test(chars[at + 1].ch)) at++;
      // a character the wrap added (a hyphen, the cut's …) keeps the style before it
      if (at < chars.length && (chars[at].ch === ch || (space && SP.test(chars[at].ch)))) last = chars[at++];
      return { ch, code: last.code, b: last.b, i: last.i };
    });
    const runs: Run[] = [];
    let x = 0;
    for (let k = 0; k < styled.length;) {
      const s = styled[k];
      let j = k;
      while (j < styled.length && styled[j].code === s.code && styled[j].b === s.b && styled[j].i === s.i) j++;
      const raw = styled.slice(k, j).map((c) => c.ch).join(""), t = raw.trim();
      // SVG drops the spaces at a run's ends, so they are room between runs instead
      const lead = raw.length - raw.trimStart().length, tail = t ? raw.length - raw.trimEnd().length : 0;
      const gap = textW(" ", font);
      x += lead * gap;
      if (t) {
        const w = s.code ? [...t].length * MONO_EM * font * 0.94 + 2 * CODE_PAD : textW(t, font) * (s.b ? BOLD_K : 1);
        runs.push({ t, x, w, code: s.code, b: s.b, i: s.i });
        x += w;
      }
      x += tail * gap;
      k = j;
    }
    return { runs, w: x };
  });
}
