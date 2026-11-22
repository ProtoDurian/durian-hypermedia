// YAML for front matter and chart data. Bun has a YAML parser built in; anywhere else the host sets one once:
//   import { parse } from "yaml"; setYamlParser(parse);
// An anchor used many times stands for its whole value each time, so a few bytes of anchors and aliases can stand for
// gigabytes. Two guards, for any parser:
//   - before parsing, from the text: at most LIMITS.maxYamlAliases aliases, whatever their names are spelled with, and no
//     merge key (<<) next to an alias (a parser copies merged maps, so that work comes before anything can size it);
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
// characters after which (blanks aside) a YAML node, so an alias, may start: a line start, "-", ":", "?", "[", "{", ","
const NODE_START = new Set([10, 13, 45, 58, 63, 91, 123, 44]);
/** How many aliases a YAML text may hold: every "*" followed by a name where a node can start, whatever the name is
 *  spelled with. It may count a "*" inside a quoted string too (never fewer than the parser sees). One pass. */
export function yamlAliasCount(t: string): number {
  let n = 0, prev = 10;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c === 10 || c === 13) { prev = 10; continue; }
    if (blank(c)) continue;
    if (c === 42 && NODE_START.has(prev) && i + 1 < t.length) { const d = t.charCodeAt(i + 1); if (!blank(d) && d !== 10 && d !== 13) n++; }
    prev = c;
  }
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
/** Throws YamlTooBig, before any parser runs, when the text uses more aliases than `most` or a merge key
 *  together with an alias. */
export function yamlPrecheck(t: string, most = LIMITS.maxYamlAliases): void {
  const a = yamlAliasCount(t);
  if (a > most) throw new YamlTooBig(`the YAML uses too many anchors and aliases (${fmt(a)} aliases; the limit is ${fmt(most)})`);
  if (a > 0 && yamlMayMerge(t)) throw new YamlTooBig("the YAML uses anchors and aliases with a merge key (<<), which is not read; write the keys out");
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
