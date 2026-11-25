// A safe regular expression engine for the jq subset's `test` and LogQL's `|~` (pass 11, helper "data").
// It never backtracks: the pattern is compiled to a small program and run as a Thompson/Pike simulation, so the work is
// (text length) x (program size) and every step is charged to a budget. A pattern with a back reference, a look-around or
// another form that needs backtracking is refused by name (RegexError); nothing is ever answered wrongly.
// Supported: literals, `.`, classes `[a-z0-9_]` `[^x]`, `\d \D \w \W \s \S \b \B`, `^ $`, groups `( )` `(?: )` `(?<n> )`,
// `|`, `* + ? {n} {n,} {n,m}` (lazy `?` suffix accepted), flags `i s m` (also `(?i)` first in the pattern).
import { Budget } from "../../core/budget";

export class RegexError extends Error {}
const refuse = (what: string): never => { throw new RegexError(`regex subset: ${what} is not supported (the engine never backtracks)`); };

type Node =
  | { t: "ch"; set: (c: number, budget?: Budget) => boolean }
  | { t: "cat"; xs: Node[] } | { t: "alt"; xs: Node[] }
  | { t: "rep"; x: Node; min: number; max: number }
  | { t: "bol" } | { t: "eol" } | { t: "wb"; neg: boolean } | { t: "empty" };

import { DEFAULT_CAPS, type QueryCaps } from "./query";
const isWord = (c: number) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || c === 95 || (c >= 97 && c <= 122);
const isDigit = (c: number) => c >= 48 && c <= 57;
const isSpace = (c: number) => c === 32 || (c >= 9 && c <= 13) || c === 0xa0 || c === 0xfeff || c === 0x2028 || c === 0x2029;
const fold = (c: number) => (c >= 65 && c <= 90 ? c + 32 : c);

function parse(src: string, f: { i: boolean; s: boolean; m: boolean }, caps: QueryCaps, budget?: Budget): Node {
  const cs = [...src].map((c) => c.codePointAt(0)!);
  let p = 0, depth = 0;
  const peek = () => cs[p], eat = () => { budget?.charge(1); return cs[p++]; };
  const ch = (set: (c: number, budget?: Budget) => boolean): Node => ({ t: "ch", set });
  const lit = (c: number): Node => (f.i ? ch((x) => fold(x) === fold(c)) : ch((x) => x === c));
  function esc(inClass: boolean): Node | number {
    const c = eat();
    if (c === undefined) throw new RegexError("regex subset: a pattern may not end with a backslash");
    const s = String.fromCodePoint(c);
    switch (s) {
      case "d": return ch(isDigit); case "D": return ch((x) => !isDigit(x));
      case "w": return ch(isWord); case "W": return ch((x) => !isWord(x));
      case "s": return ch(isSpace); case "S": return ch((x) => !isSpace(x));
      case "n": return 10; case "t": return 9; case "r": return 13; case "f": return 12; case "v": return 11; case "0": return 0;
      case "b": return inClass ? 8 : ({ t: "wb", neg: false } as Node);
      case "B": return inClass ? refuse("`\\B` inside a class") : ({ t: "wb", neg: true } as Node);
      case "p": case "P": return refuse("a Unicode property class `\\p{...}`");
      case "k": return refuse("a named back reference `\\k<name>`");
      case "A": case "z": case "Z": case "G": return refuse(`\`\\${s}\``);
      case "x": { const h = String.fromCodePoint(cs[p] ?? 0) + String.fromCodePoint(cs[p + 1] ?? 0); if (!/^[0-9a-fA-F]{2}$/.test(h)) throw new RegexError("regex subset: `\\x` needs two hex digits"); p += 2; return parseInt(h, 16); }
      case "u": { const h = cs.slice(p, p + 4).map((x) => String.fromCodePoint(x)).join(""); if (!/^[0-9a-fA-F]{4}$/.test(h)) throw new RegexError("regex subset: `\\u` needs four hex digits"); p += 4; return parseInt(h, 16); }
      default:
        if (c >= 49 && c <= 57) return refuse("a back reference");
        if (/[A-Za-z]/.test(s)) return refuse(`the escape \`\\${s}\``);
        return c;
    }
  }
  function cls(): Node {
    const neg = peek() === 94 ? (p++, true) : false;
    const parts: ((c: number) => boolean)[] = [];
    let first = true;
    for (;;) {
      const c = eat();
      if (c === undefined) throw new RegexError("regex subset: a `[` class is never closed");
      if (c === 93 && !first) break;
      first = false;
      if (c === 91 && peek() === 58) refuse("a POSIX class `[[:alpha:]]`");
      let lo: number | null = null;
      if (c === 92) { const e = esc(true); if (typeof e === "number") lo = e; else if (e.t === "ch") { parts.push(e.set); continue; } else refuse("that escape in a class"); } else lo = c;
      if (peek() === 45 && cs[p + 1] !== undefined && cs[p + 1] !== 93) {
        p++; let hi = eat()!; if (hi === 92) { const e = esc(true); if (typeof e !== "number") refuse("a class range ending in a class escape"); hi = e as number; }
        if (hi < lo!) throw new RegexError("regex subset: a class range ends before it starts");
        const a = lo!, b = hi;
        parts.push(f.i ? (x) => (x >= a && x <= b) || (fold(x) >= fold(a) && fold(x) <= fold(b)) || (x >= a && x <= b) : (x) => x >= a && x <= b);
      } else { const a = lo!; parts.push(f.i ? (x) => fold(x) === fold(a) : (x) => x === a); }
    }
    return ch((x, budget) => { budget?.charge(parts.length); return parts.some((q) => q(x)) !== neg; });
  }
  function atom(): Node {
    const c = eat();
    if (c === 40) { // (
      if (++depth > caps.maxDepth) throw new RegexError("regex subset: groups are nested too deep");
      if (peek() === 63) { // (?
        p++; const k = eat();
        if (k === 58) { /* (?: */ }
        else if (k === 60 && (cs[p] === 61 || cs[p] === 33)) return refuse("a look-behind `(?<=` or `(?<!`");
        else if (k === 60 || k === 80) { if (k === 80) p++; while (peek() !== 62 && peek() !== undefined) p++; p++; /* named group */ }
        else if (k === 61 || k === 33) return refuse("a look-ahead `(?=` or `(?!`");
        else if (k === 62) return refuse("an atomic group `(?>`");
        else return refuse("an inline flag group (use the flags argument)");
      }
      const x = alt();
      if (eat() !== 41) throw new RegexError("regex subset: a `(` group is never closed");
      depth--; return x;
    }
    if (c === 41) throw new RegexError("regex subset: a `)` with no `(` before it");
    if (c === 91) return cls();
    if (c === 46) return f.s ? ch(() => true) : ch((x) => x !== 10 && x !== 13);
    if (c === 94) return { t: "bol" };
    if (c === 36) return { t: "eol" };
    if (c === 92) { const e = esc(false); return typeof e === "number" ? lit(e) : e; }
    if (c === 42 || c === 43 || c === 63) throw new RegexError(`regex subset: \`${String.fromCodePoint(c)}\` has nothing before it to repeat`);
    return lit(c!);
  }
  function piece(): Node {
    let x = atom();
    for (;;) {
      const c = peek();
      let min = 0, max = Infinity;
      if (c === 42) p++; else if (c === 43) { p++; min = 1; } else if (c === 63) { p++; max = 1; }
      else if (c === 123) {
        // `{n}`, `{n,}` or `{n,m}`, read where it stands (only its own characters, each charged); anything else is a literal `{`
        let i = p + 1, lo = 0, hi = 0;
        const digits = () => { const s = i; let v = 0; while (i < cs.length && isDigit(cs[i])) v = v * 10 + cs[i++] - 48; return i > s ? v : -1; };
        lo = digits();
        if (lo >= 0 && cs[i] === 44) { i++; hi = digits(); if (hi < 0) hi = Infinity; } else hi = lo;
        budget?.charge(i - p);
        if (lo < 0 || cs[i] !== 125) { return x; }
        p = i + 1; min = lo; max = hi;
        if (max < min) throw new RegexError("regex subset: `{n,m}` has m smaller than n");
        if (min > caps.regexRepeat || (max !== Infinity && max > caps.regexRepeat)) throw new RegexError(`regex subset: a repeat count over ${caps.regexRepeat} is too large`);
      } else return x;
      if (peek() === 63) p++;                      // lazy: same yes/no answer
      else if (peek() === 43) refuse("a possessive repeat `*+`");
      x = { t: "rep", x, min, max };
    }
  }
  function seq(): Node {
    const xs: Node[] = [];
    while (p < cs.length && peek() !== 124 && peek() !== 41) xs.push(piece());
    return xs.length === 1 ? xs[0] : xs.length ? { t: "cat", xs } : { t: "empty" };
  }
  function alt(): Node {
    const xs = [seq()];
    while (peek() === 124) { p++; xs.push(seq()); }
    return xs.length === 1 ? xs[0] : { t: "alt", xs };
  }
  const r = alt();
  if (p < cs.length) throw new RegexError("regex subset: a `)` with no `(` before it");
  return r;
}

// program: 0 char(set), 1 split(a,b), 2 jmp(a), 3 match, 4 bol, 5 eol, 6 wb, 7 nwb
type Inst = { op: number; set?: (c: number, budget?: Budget) => boolean; a?: number; b?: number };
function compile(n: Node, mline: boolean, caps: QueryCaps, budget?: Budget): Inst[] {
  const prog: Inst[] = [];
  const emit = (i: Inst) => { budget?.charge(1, 1); if (prog.length >= caps.regexProgram) throw new RegexError("regex subset: the pattern is too large"); prog.push(i); return prog.length - 1; };
  const gen = (n: Node) => {
    budget?.charge(1);
    switch (n.t) {
      case "ch": emit({ op: 0, set: n.set }); break;
      case "empty": break;
      case "bol": emit({ op: 4 }); break;
      case "eol": emit({ op: 5 }); break;
      case "wb": emit({ op: n.neg ? 7 : 6 }); break;
      case "cat": for (const x of n.xs) gen(x); break;
      case "alt": {
        const jumps: number[] = [];
        for (let k = 0; k < n.xs.length - 1; k++) { const s = emit({ op: 1 }); prog[s].a = prog.length; gen(n.xs[k]); jumps.push(emit({ op: 2 })); prog[s].b = prog.length; }
        gen(n.xs[n.xs.length - 1]);
        for (const j of jumps) prog[j].a = prog.length;
        break;
      }
      case "rep": {
        for (let k = 0; k < n.min; k++) gen(n.x);
        if (n.max === Infinity) { const s = emit({ op: 1 }); prog[s].a = prog.length; gen(n.x); emit({ op: 2, a: s }); prog[s].b = prog.length; }
        else { const ss: number[] = []; for (let k = n.min; k < n.max; k++) { const s = emit({ op: 1 }); ss.push(s); prog[s].a = prog.length; gen(n.x); } for (const s of ss) prog[s].b = prog.length; }
        break;
      }
    }
  };
  gen(n); emit({ op: 3 });
  void mline;
  return prog;
}

export interface Re { test(text: string, budget?: Budget): boolean; exec(text: string, budget?: Budget): { start: number; end: number } | null }

export function compileRegex(pattern: string, flags = "", caps: QueryCaps = DEFAULT_CAPS, budget: Budget = new Budget({steps:caps.steps,values:caps.values,chars:caps.chars},null,null,"the regex query")): Re {
  budget.charge(pattern.length + flags.length, pattern.length * 3, pattern.length);
  const f = { i: false, s: false, m: false };
  let pat = pattern;
  for (const c of flags) { if (c === "i") f.i = true; else if (c === "s") f.s = true; else if (c === "m") f.m = true; else if (c === "g" || c === "n") continue; else throw new RegexError(`regex subset: the flag "${c}" is not supported (flags: i, s, m, g)`); }
  const lead = pat.match(/^\(\?([ims]+)\)/);
  if (lead) { for (const c of lead[1]) f[c as "i" | "s" | "m"] = true; pat = pat.slice(lead[0].length); }
  if (pat.length > caps.regexChars) throw new RegexError(`regex subset: the pattern is too long (${caps.regexChars} characters)`);
  const prog = compile(parse(pat, f, caps, budget), f.m, caps, budget);
  const re = makeRe(prog, f.m);
  return re;
}

function makeRe(prog: Inst[], mline: boolean): Re {
  const run = (text: string, budget: Budget | undefined, wantSpan: boolean): { start: number; end: number } | null => {
    // positions are in UTF-16 units; characters are read by code point
    const n = text.length, N = prog.length;
    budget?.charge(N, N * 3);
    let clist: { pc: number; st: number }[] = [], nlist: { pc: number; st: number }[] = [];
    const mark = new Int32Array(N).fill(-1);
    let gen = 0, best: { start: number; end: number } | null = null;
    const cp = (i: number) => (i < n ? text.codePointAt(i)! : -1);
    const prevCp = (i: number) => { if (i <= 0) return -1; const c = text.charCodeAt(i - 1); if (c >= 0xdc00 && c <= 0xdfff && i >= 2) return text.codePointAt(i - 2)!; return c; };
    const add = (list: { pc: number; st: number }[], pc0: number, pos: number, st: number) => {
      const stack = [pc0];
      while (stack.length) {
        const pc = stack.pop()!;
        if (mark[pc] === gen) continue;
        mark[pc] = gen;
        budget?.charge(1);
        const I = prog[pc];
        switch (I.op) {
          case 2: stack.push(I.a!); break;
          case 1: stack.push(I.b!); stack.push(I.a!); break;
          case 4: { const pc1 = prevCp(pos); if (pos === 0 || (mline && (pc1 === 10 || pc1 === 13))) stack.push(pc + 1); break; }
          case 5: { const c = cp(pos); if (pos === n || (mline && (c === 10 || c === 13))) stack.push(pc + 1); break; }
          case 6: case 7: { const a = isWord(prevCp(pos)), b = isWord(cp(pos)); if ((a !== b) === (I.op === 6)) stack.push(pc + 1); break; }
          default: budget?.charge(0, 1); list.push({ pc, st });
        }
      }
    };
    gen = 1;
    for (let i = 0; ; ) {
      if (!best) add(clist, 0, i, i);                 // a new thread at i, after the older ones (older starts win)
      const c = cp(i);
      const step = c > 0xffff ? 2 : 1;
      gen++; nlist = [];
      for (const t of clist) {
        const I = prog[t.pc];
        budget?.charge(1);
        if (I.op === 3) { if (!best || t.st < best.start || (t.st === best.start && i > best.end)) best = { start: t.st, end: i }; if (!wantSpan) return best; continue; }
        if (I.op === 0 && c >= 0 && I.set!(c, budget)) add(nlist, t.pc + 1, i + step, t.st);
      }
      if (best) nlist = nlist.filter((t) => t.st <= best!.start);
      clist = nlist;
      if (c < 0 || (best && !clist.length)) break;
      i += step;
    }
    return best;
  };
  return { test: (t, b) => run(t, b, false) !== null, exec: (t, b) => run(t, b, true) };
}
