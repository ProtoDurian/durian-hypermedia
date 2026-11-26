// A small TOML reader for the explore part: tables, arrays of tables, dotted and quoted keys, basic and literal strings
// (single and multi line), integers (with _, 0x 0o 0b), floats, booleans, dates (kept as their text), arrays and inline
// tables. A hand scan, linear in the text, each character charged to the page budget; the few regular expressions run over
// one scanned word, none can backtrack. Objects have no prototype, so a key such as __proto__ is plain data. A syntax error names its line.
import type { Budget } from "../../core/budget";
import type { J } from "../log/jq";

type O = { [k: string]: J };
const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
const isBare = (c: string | undefined) => c !== undefined && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || isDigit(c) || c === "_" || c === "-");
const isHex = (c: string | undefined) => c !== undefined && (isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F"));
const ESC: Record<string, string> = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" };

export function readToml(text: string, budget?: Budget): J {
  const s = text.replace(/\r\n?/g, "\n");
  budget?.charge(s.length, 0, s.length);
  let i = 0, line = 1;
  const fail = (msg: string): never => { throw new Error(`toml line ${line}: ${msg}`); };
  const blank = () => { while (s[i] === " " || s[i] === "\t") i++; };
  const comment = () => { if (s[i] === "#") while (i < s.length && s[i] !== "\n") i++; };
  const skipWs = () => { for (;;) { blank(); comment(); if (s[i] === "\n") { i++; line++; } else return; } };
  const endLine = () => { blank(); comment(); if (i < s.length && s[i] !== "\n") fail("something follows the value on the same line"); if (s[i] === "\n") { i++; line++; } };

  const basicString = (): string => {
    const multi = s.startsWith('"""', i); i += multi ? 3 : 1;
    if (multi && s[i] === "\n") { i++; line++; }
    let out = "";
    for (;;) {
      if (i >= s.length) fail("a string is never closed");
      const c = s[i];
      if (multi ? s.startsWith('"""', i) : c === '"') {
        if (multi) { let q = 0; while (s[i + 3 + q] === '"' && q < 2) q++; out += '"'.repeat(q); i += 3 + q; } else i++;
        return out;
      }
      if (c === "\n") { if (!multi) fail("a string is never closed on its line"); out += c; i++; line++; continue; }
      if (c === "\\") {
        const n = s[i + 1];
        if (n !== undefined && n in ESC) { out += ESC[n]; i += 2; continue; }
        if (n === "u" || n === "U") {
          const len = n === "u" ? 4 : 8; const hex = s.slice(i + 2, i + 2 + len);
          if (hex.length !== len || ![...hex].every(isHex)) fail("a \\u escape needs hex digits");
          const cp = parseInt(hex, 16); if (cp > 0x10ffff || (cp >= 0xd800 && cp < 0xe000)) fail("a \\u escape names no character");
          out += String.fromCodePoint(cp); i += 2 + len; continue;
        }
        if (multi && (n === "\n" || n === " " || n === "\t")) { let j = i + 1; while (s[j] === " " || s[j] === "\t") j++; if (s[j] !== "\n") fail("a bad escape"); while (s[j] === "\n" || s[j] === " " || s[j] === "\t") { if (s[j] === "\n") line++; j++; } i = j; continue; }
        fail("a bad escape in a string");
      }
      out += c; i++;
    }
  };
  const literalString = (): string => {
    const multi = s.startsWith("'''", i); i += multi ? 3 : 1;
    if (multi && s[i] === "\n") { i++; line++; }
    const at = i;
    for (;;) {
      if (i >= s.length) fail("a string is never closed");
      if (multi ? s.startsWith("'''", i) : s[i] === "'") { let out = s.slice(at, i); if (multi) { let q = 0; while (s[i + 3 + q] === "'" && q < 2) q++; out += "'".repeat(q); i += 3 + q; } else i++; return out; }
      if (s[i] === "\n") { if (!multi) fail("a string is never closed on its line"); line++; }
      i++;
    }
  };
  const keyPart = (): string => {
    blank();
    if (s[i] === '"') return basicString();
    if (s[i] === "'") return literalString();
    const at = i; while (isBare(s[i])) i++;
    if (i === at) fail("a key is expected");
    return s.slice(at, i);
  };
  const keyPath = (): string[] => { const ks = [keyPart()]; for (;;) { blank(); if (s[i] !== ".") return ks; i++; ks.push(keyPart()); } };

  const number = (): J => {
    const at = i; while (i < s.length && !" \t\n,]}#".includes(s[i])) i++;
    const w = s.slice(at, i);
    if (/^[+-]?(inf|nan)$/.test(w)) return w.endsWith("nan") ? "nan" : w.startsWith("-") ? "-inf" : "inf";
    if (/^\d{4}-\d{2}-\d{2}/.test(w) || /^\d{2}:\d{2}/.test(w)) { // a date or time: kept as written; a space may join date and time
      if (s[i] === " " && /^\d{4}-\d{2}-\d{2}$/.test(w) && isDigit(s[i + 1])) { const t = i + 1; let e = t; while (e < s.length && !" \t\n,]}#".includes(s[e])) e++; i = e; return `${w} ${s.slice(t, e)}`; }
      return w;
    }
    const clean = w.replace(/_/g, "");
    if (/^[+-]?(0|[1-9]\d*)$/.test(clean) && !/__|^_|_$|_\D|\D_/.test(w.replace(/^[+-]/, "")) ) return Number(clean);
    if (/^0x[0-9a-fA-F]+$/.test(clean)) return parseInt(clean.slice(2), 16);
    if (/^0o[0-7]+$/.test(clean)) return parseInt(clean.slice(2), 8);
    if (/^0b[01]+$/.test(clean)) return parseInt(clean.slice(2), 2);
    if (/^[+-]?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(clean) && !/__|_\.|\._|_[eE]|[eE]_/.test(w)) return Number(clean);
    return fail(`"${w.slice(0, 30)}" is not a value`);
  };
  const value = (depth: number): J => {
    if (depth > 64) fail("values are nested too deep");
    const c = s[i];
    if (c === '"') return basicString();
    if (c === "'") return literalString();
    if (c === "[") {
      i++; const out: J[] = [];
      for (;;) { skipWs(); if (s[i] === "]") { i++; return out; } if (i >= s.length) fail("an array is never closed"); out.push(value(depth + 1)); skipWs(); if (s[i] === ",") { i++; continue; } if (i >= s.length) fail("an array is never closed"); if (s[i] !== "]") fail("an array needs , or ]"); }
    }
    if (c === "{") {
      i++; const out: O = Object.create(null); blank();
      if (s[i] === "}") { i++; return out; }
      for (;;) {
        blank(); const ks = keyPath(); blank(); if (s[i] !== "=") fail("= is expected after a key"); i++; blank();
        put(out, ks, value(depth + 1)); blank();
        if (s[i] === ",") { i++; continue; } if (s[i] === "}") { i++; return out; } fail("an inline table needs , or }");
      }
    }
    if (s.startsWith("true", i) && !isBare(s[i + 4])) { i += 4; return true; }
    if (s.startsWith("false", i) && !isBare(s[i + 5])) { i += 5; return false; }
    if (c === undefined || c === "\n" || c === "#") fail("a value is expected");
    return number();
  };
  const own = (o: O, k: string) => Object.prototype.hasOwnProperty.call(o, k);
  const put = (root: O, ks: string[], v: J) => {
    let o = root;
    for (let n = 0; n < ks.length - 1; n++) {
      const k = ks[n]; const cur = own(o, k) ? o[k] : undefined;
      if (cur === undefined) { const next: O = Object.create(null); o[k] = next; o = next; }
      else if (Array.isArray(cur) && cur.length && typeof cur[cur.length - 1] === "object") o = cur[cur.length - 1] as O;
      else if (cur && typeof cur === "object" && !Array.isArray(cur)) o = cur as O;
      else fail(`"${k}" is already a value, not a table`);
    }
    const last = ks[ks.length - 1]; if (own(o, last)) fail(`the key "${last}" is written twice`);
    o[last] = v;
  };
  const defined = new WeakSet<O>(), root: O = Object.create(null);
  let cur: O = root;
  for (;;) {
    skipWs(); if (i >= s.length) break;
    if (s[i] === "[") {
      const arr = s[i + 1] === "["; i += arr ? 2 : 1; blank(); const ks = keyPath(); blank();
      if (arr ? !s.startsWith("]]", i) : s[i] !== "]") fail(arr ? "]] closes an array of tables" : "] closes a table header"); i += arr ? 2 : 1;
      let o = root;
      for (let n = 0; n < ks.length; n++) {
        const k = ks[n], lastKey = n === ks.length - 1; const have = own(o, k) ? o[k] : undefined;
        if (lastKey && arr) { const t: O = Object.create(null); if (have === undefined) o[k] = [t]; else if (Array.isArray(have)) have.push(t); else fail(`"${k}" is already a table`); o = t; }
        else if (have === undefined) { const t: O = Object.create(null); o[k] = t; if (lastKey) defined.add(t); o = t; }
        else if (Array.isArray(have) && have.length) o = have[have.length - 1] as O;
        else if (have && typeof have === "object" && !Array.isArray(have)) { if (lastKey) { if (defined.has(have as O)) fail(`the table [${ks.join(".")}] is written twice`); defined.add(have as O); } o = have as O; }
        else fail(`"${k}" is already a value, not a table`);
      }
      cur = o; endLine(); continue;
    }
    const ks = keyPath(); blank(); if (s[i] !== "=") fail("= is expected after a key"); i++; blank();
    put(cur, ks, value(0)); endLine();
  }
  return root;
}
