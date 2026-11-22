// YAML for front matter and chart data. Bun has a YAML parser built in; anywhere else the host sets one once:
//   import { parse } from "yaml"; setYamlParser(parse);
// Every parsed value is sized before anyone reads it (yamlGuard): an anchor used many times stands for its whole value
// each time, so a few bytes of anchors and aliases can stand for gigabytes. The guard counts the value as a graph (each
// shared list or map is walked once, its size kept), so the count costs what the text spells out, never what it stands for.
import { LIMITS } from "../safety";
type YamlParse = (text: string) => unknown;
let custom: YamlParse | null = null;
export function setYamlParser(fn: YamlParse | null): void { custom = fn; }
export function yamlParse(text: string): any {
  let v: unknown;
  if (custom) v = custom(text);
  else {
    const B = (globalThis as any).Bun;
    if (!B?.YAML?.parse) throw new Error("durian-hypermedia: no YAML parser; call setYamlParser() (for example with parse from the yaml package)");
    v = B.YAML.parse(text);
  }
  yamlGuard(v);
  return v;
}

/** Deepest nesting of lists and maps a YAML value may have. */
export const YAML_DEPTH = 64;
export class YamlTooBig extends Error {}
const fmt = (n: number) => n.toLocaleString("en-US");
/**
 * Throws YamlTooBig when a parsed value stands for more than its text spells out plus one part's caps
 * (LIMITS.maxEvalValues value slots, LIMITS.maxEvalChars characters), when it nests deeper than YAML_DEPTH, or when it
 * holds itself. A slot is a list item or a map key; characters are those of strings and keys. Linear in what is spelled out.
 */
export function yamlGuard(v: unknown, extraValues = LIMITS.maxEvalValues, extraChars = LIMITS.maxEvalChars): void {
  if (v === null || typeof v !== "object") return;
  const memo = new Map<object, [number, number]>();
  const open = new Set<object>();
  let sn = 0, sc = 0; // what the text spells out: every list and map counted once
  const walk = (x: unknown, depth: number): [number, number] => {
    if (typeof x === "string") return [0, x.length];
    if (x === null || typeof x !== "object") return [0, 0];
    const m = memo.get(x);
    if (m) return m;
    if (open.has(x)) throw new YamlTooBig("the YAML holds itself (an alias inside its own anchor)");
    if (depth >= YAML_DEPTH) throw new YamlTooBig(`the YAML nests more than ${YAML_DEPTH} levels deep`);
    open.add(x);
    let n = 0, c = 0;
    if (Array.isArray(x)) { n = x.length; sn += n; for (const y of x) { const [a, b] = walk(y, depth + 1); n += a; c += b; } }
    else for (const k of Object.keys(x)) { n++; sn++; c += k.length; sc += k.length; const [a, b] = walk((x as any)[k], depth + 1); n += a; c += b; }
    // a string counts once where the text spells it (the first time its holder is walked)
    if (Array.isArray(x)) { for (const y of x) if (typeof y === "string") sc += y.length; }
    else for (const k of Object.keys(x)) { const y = (x as any)[k]; if (typeof y === "string") sc += y.length; }
    open.delete(x);
    const r: [number, number] = [n, c];
    memo.set(x, r);
    return r;
  };
  const [n, c] = walk(v, 0);
  if (n > sn + extraValues || c > sc + extraChars)
    throw new YamlTooBig(`the YAML's anchors and aliases repeat too much: it stands for ${n > sn + extraValues ? `${fmt(n)} values where its text spells out ${fmt(sn)}` : `${fmt(c)} characters where its text spells out ${fmt(sc)}`} (aliases may add at most ${fmt(extraValues)} values and ${fmt(extraChars)} characters)`);
}
