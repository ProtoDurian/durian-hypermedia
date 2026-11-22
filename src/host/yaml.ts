// YAML for front matter and chart data. Bun has a YAML parser built in; anywhere else the host sets one once:
//   import { parse } from "yaml"; setYamlParser(parse);
// A parser's own work may grow faster than the text: the yaml package (2.x) compares each new key of a map with the keys
// before it, so one map of 20,000 keys takes seconds. Before parsing, from the text: at most LIMITS.maxYamlChars characters
// and LIMITS.maxYamlNodes nodes (yamlNodeCount) in one text, and maxPageYamlChars / maxPageYamlNodes over all of one parse()
// or check() call's YAML texts.
// An anchor used many times stands for its whole value each time, so a few bytes of anchors and aliases can stand for
// gigabytes. Two guards, for any parser:
//   - before parsing, from the text: at most LIMITS.maxYamlAliases aliases, whatever their names are spelled with, and
//     next to an alias no merge key (<<), no tag (!) and no directive (%): a parser copies merged maps, so that work
//     comes before anything can size it, and a tag or directive can spell a merge without "<<" or the word;
//   - after parsing, yamlGuard: the value counted as it will be read and written out (an alias counts what it stands
//     for, a string each time it is held) may pass the text's own length by at most one part's caps. What it adds
//     beyond the text is recorded (yamlExtra), and parse() charges it to the page's evaluation budget.
import { LIMITS } from "../safety";
import { currentBudget, partLimitsOf } from "../core/budget";
type YamlParse = (text: string) => unknown;
let custom: YamlParse | null = null;
export function setYamlParser(fn: YamlParse | null): void { custom = fn; }
export function yamlParse(text: string): any {
  // inside parse() or check(), the caps given to that call (parse options); otherwise LIMITS
  const b = currentBudget(), lim = b?.lim ?? LIMITS, part = b?.partLimits ?? partLimitsOf(lim);
  let page = b; while (page?.parent) page = page.parent;
  yamlSizeCheck(text, lim, page);
  yamlPrecheck(text, lim.maxYamlAliases);
  let v: unknown;
  if (custom) v = custom(text);
  else {
    const B = (globalThis as any).Bun;
    if (!B?.YAML?.parse) throw new Error("durian-hypermedia: no YAML parser; call setYamlParser() (for example with parse from the yaml package)");
    v = B.YAML.parse(text);
  }
  yamlGuard(v, text.length, part.values, part.chars);
  return v;
}

/** Deepest nesting of lists and maps a YAML value may have. */
export const YAML_DEPTH = 64;
export class YamlTooBig extends Error {}
const fmt = (n: number) => n.toLocaleString("en-US");
const blank = (c: number) => c === 32 || c === 9 || c === 0xfeff;
const alnum = (c: number) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
/** The key a name has right after "&" or "*" at i: its leading run of ASCII letters and digits (at most 128 of them),
 *  or else its first character; null when no name follows. An alias names its anchor exactly, and no parser ends a name
 *  inside such a run, so an alias and its anchor always have the same key. */
function nameKey(t: string, i: number): string | null {
  if (i >= t.length) return null;
  const c = t.charCodeAt(i);
  if (c === 32 || c === 9 || c === 10 || c === 13) return null;
  let j = i;
  while (j < t.length && j < i + 128 && alnum(t.charCodeAt(j))) j++;
  return t.slice(i, j > i ? j : i + 1);
}
/** How many aliases a YAML text may hold: every "*" whose name has the key of some "&" in the text, wherever they are
 *  (no guess at where a node starts, which parsers read differently). It may count a "*" inside a value too, never
 *  fewer than a parser resolves; with no "&" at all it is 0, so Markdown in values is never counted. Two passes. */
export function yamlAliasCount(t: string): number {
  const keys = new Set<string>();
  for (let i = t.indexOf("&"); i >= 0; i = t.indexOf("&", i + 1)) { const k = nameKey(t, i + 1); if (k !== null) keys.add(k); }
  if (!keys.size) return 0;
  let n = 0;
  for (let i = t.indexOf("*"); i >= 0; i = t.indexOf("*", i + 1)) { const k = nameKey(t, i + 1); if (k !== null && keys.has(k)) n++; }
  return n;
}
// "<" as YAML may spell it in a key: itself, or an escape in a double-quoted string
const LT = /^(?:<|\\x3c|\\u003c|\\U0000003c)/i;
/** Whether a YAML text may hold a merge key: two "<" (or their escapes) with only blanks, line breaks and "\\" between
 *  them (a double-quoted key may join lines with an escaped line break), or a merge tag. One pass. */
export function yamlMayMerge(t: string): boolean {
  if (/[!:]merge/i.test(t)) return true;
  let lt = false;
  for (let i = 0; i < t.length; ) {
    const c = t.charCodeAt(i);
    if (c === 60 || c === 92) {
      const m = LT.exec(t.slice(i, i + 10));
      if (m) { if (lt) return true; lt = true; i += m[0].length; continue; }
      if (c === 92) { i++; continue; }
    }
    if (!(blank(c) || c === 10 || c === 13)) lt = false;
    i++;
  }
  return false;
}
/**
 * An upper bound, from the text alone, on the nodes (keys, values, lists and maps) a YAML parser will build from it, and
 * so on its work (one map's keys cost some parsers the square of their number, every node costs every parser some
 * microseconds). Counted, as written: every ":" and "?" (a key), "," and "-" (an item), "[" and "{" (a list or a map),
 * "!" (a lenient parser, Bun's among them, may make a key of a scalar tagged !!map) and line (a parser that recovers
 * from an error, as the yaml package does, may make a key of a line with no ":"). Escapes make content, never
 * structure, so only these characters as written count; a quoted or commented one counts too, so never fewer than the
 * parser sees (seeded fuzz with Bun's parser and the yaml package). One pass.
 */
export function yamlNodeCount(t: string): number {
  let n = t.length ? 1 : 0; // the last line, which may have no line break
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c === 58 || c === 63 || c === 44 || c === 45 || c === 91 || c === 123 || c === 33 || c === 10 || c === 13) n++;
  }
  return n;
}
// what one parse() or check() call's YAML texts have used so far (characters, keys), per call budget
const pageYaml = new WeakMap<object, { c: number; k: number }>();
/** Throws YamlTooBig, before any parser runs, when the text has more characters or keys (yamlNodeCount) than one text
 *  may, or would take the page's YAML over its totals. */
export function yamlSizeCheck(t: string, lim: { maxYamlChars: number; maxYamlNodes: number; maxPageYamlChars: number; maxPageYamlNodes: number } = LIMITS, page: object | null = null): void {
  if (t.length > lim.maxYamlChars) throw new YamlTooBig(`the YAML is too long (${fmt(t.length)} characters; the limit is ${fmt(lim.maxYamlChars)})`);
  const k = yamlNodeCount(t);
  if (k > lim.maxYamlNodes) throw new YamlTooBig(`the YAML has too many keys and values (${fmt(k)}, counting every ":", "?", ",", "-", "!", "[", "{" and line; the limit is ${fmt(lim.maxYamlNodes)})`);
  if (!page) return;
  const u = pageYaml.get(page) ?? { c: 0, k: 0 };
  if (u.c + t.length > lim.maxPageYamlChars) throw new YamlTooBig(`the page's YAML is too long (${fmt(u.c + t.length)} characters with this one; the limit for a page is ${fmt(lim.maxPageYamlChars)})`);
  if (u.k + k > lim.maxPageYamlNodes) throw new YamlTooBig(`the page's YAML has too many keys and values (${fmt(u.k + k)} with this one; the limit for a page is ${fmt(lim.maxPageYamlNodes)})`);
  u.c += t.length; u.k += k; pageYaml.set(page, u);
}
// blanks and line breaks in the widest sense any YAML parser might take them (only used to find more, never fewer)
const isBreak = (c: number) => c === 10 || c === 13 || c === 0x85 || c === 0x2028 || c === 0x2029;
const wide = (c: number) => c <= 32 || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200b) || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;
/** Whether a YAML text may hold a tag or a directive: a "!" followed by a non-blank and not right after an ASCII letter
 *  or digit (wherever it is: no guess at where a node starts), or a "%" first on a line. A tag can spell a merge without
 *  "<<" or the word (percent escapes, %TAG handles), so with an alias in the text any tag or directive is refused.
 *  "Wow!" and "50% off" are not tags; "x !y" is taken for one. One pass. */
export function yamlMayTag(t: string): boolean {
  let lineStart = true;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (isBreak(c)) { lineStart = true; continue; }
    if (wide(c)) continue;
    if (lineStart && c === 37) return true;
    lineStart = false;
    if (c !== 33 || i + 1 >= t.length) continue;
    const d = t.charCodeAt(i + 1);
    if (wide(d) || isBreak(d) || (i > 0 && alnum(t.charCodeAt(i - 1)))) continue;
    return true;
  }
  return false;
}
/** Throws YamlTooBig, before any parser runs, when the text uses more aliases than `most`, or uses an alias together
 *  with a merge key, a tag or a directive. */
export function yamlPrecheck(t: string, most = LIMITS.maxYamlAliases): void {
  const a = yamlAliasCount(t);
  if (a > most) throw new YamlTooBig(`the YAML uses too many anchors and aliases (${fmt(a)} aliases; the limit is ${fmt(most)})`);
  if (a > 0 && yamlMayMerge(t)) throw new YamlTooBig("the YAML uses anchors and aliases with a merge key (<<), which is not read; write the keys out");
  if (a > 0 && yamlMayTag(t)) throw new YamlTooBig("the YAML uses anchors and aliases with a tag (!) or a directive (%), which is not read; drop the tag or the aliases");
}

/** What a parsed value adds beyond its text (value slots, characters), and the text's length, for values yamlParse made. */
const extras = new WeakMap<object, { text: number; n: number; c: number }>();
export function yamlExtra(v: unknown): { text: number; n: number; c: number } | undefined { return v !== null && typeof v === "object" ? extras.get(v) : undefined; }
/**
 * Throws YamlTooBig when a parsed value, counted as it is read (an alias counts what it stands for each time, a string
 * each time it is held), has more value slots or characters than its text has characters plus one part's caps
 * (LIMITS.maxEvalValues, LIMITS.maxEvalChars), when it nests deeper than YAML_DEPTH, or when it holds itself. A slot is a
 * list item or a map key. Each shared list or map is walked once (its size kept), so this costs what the text spells out.
 */
export function yamlGuard(v: unknown, text = 0, extraValues = LIMITS.maxEvalValues, extraChars = LIMITS.maxEvalChars): void {
  if (v === null || typeof v !== "object") return;
  const memo = new Map<object, [number, number]>();
  const open = new Set<object>();
  const walk = (x: unknown, depth: number): [number, number] => {
    if (typeof x === "string") return [0, x.length];
    if (x === null || typeof x !== "object") return [0, 0];
    const m = memo.get(x);
    if (m) return m;
    if (open.has(x)) throw new YamlTooBig("the YAML holds itself (an alias inside its own anchor)");
    if (depth >= YAML_DEPTH) throw new YamlTooBig(`the YAML nests more than ${YAML_DEPTH} levels deep`);
    open.add(x);
    let n = 0, c = 0;
    if (Array.isArray(x)) { n = x.length; for (const y of x) { const [a, b] = walk(y, depth + 1); n += a; c += b; } }
    else for (const k of Object.keys(x)) { n++; c += k.length; const [a, b] = walk((x as any)[k], depth + 1); n += a; c += b; }
    open.delete(x);
    const r: [number, number] = [n, c];
    memo.set(x, r);
    return r;
  };
  const [n, c] = walk(v, 0);
  if (n > text + extraValues || c > text + extraChars)
    throw new YamlTooBig(`the YAML's anchors and aliases repeat too much: it stands for ${n > text + extraValues ? `${fmt(n)} values` : `${fmt(c)} characters`} where its text has ${fmt(text)} characters (aliases may add at most ${fmt(extraValues)} values and ${fmt(extraChars)} characters)`);
  extras.set(v, { text, n: Math.max(0, n - text), c: Math.max(0, c - text) });
}
/** Charge what a parsed value adds beyond its text to a budget (parse() charges the page, once per front matter or
 *  part). Over it, YamlTooBig. */
export function chargeYaml(v: unknown, b: { charge(steps: number, values?: number, chars?: number): void } | null): void {
  const x = yamlExtra(v);
  if (!b || !x || (!x.n && !x.c)) return;
  try { b.charge(1, x.n, x.c); }
  catch (e) { throw new YamlTooBig(`the YAML's anchors and aliases on this page repeat too much (this one adds ${fmt(x.n)} values and ${fmt(x.c)} characters beyond its text, and the page's budget is spent)`); }
}
