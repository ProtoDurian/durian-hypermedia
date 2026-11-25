// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// expr: the small, safe expression language of DurianMarkdown.
// Used by chart `let` entries and series `data`, and by `{...}` holes in texts (fillHoles).
// No property access, no assignment, no loops, no host functions: a parse tree evaluated by a tiny interpreter.
// Arithmetic and comparisons work element by element on lists ("broadcasting"), so `calls - 1` subtracts 1 from each.
//
// Every bit of work is paid for from a Budget (core/budget.ts) BEFORE it is done: each token, each parse-tree node,
// each list element an operator or a built-in visits, every value slot a new list holds and every character of new
// text. A list that holds another list counts what it holds, however often that list is shared, so `fill` of a big
// list pays for every copy it stands for. Going over throws a BudgetError (never caught here); the caller shows it.
import { type Budget, BudgetError, partBudget } from "./budget";

export type Val = number | string | boolean | Val[];
export type Ast =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "name"; v: string }
  | { t: "list"; items: Ast[] }
  | { t: "un"; op: string; a: Ast }
  | { t: "bin"; op: string; a: Ast; b: Ast }
  | { t: "if"; c: Ast; a: Ast; b: Ast }
  | { t: "call"; f: string; args: Ast[] }
  | { t: "index"; a: Ast; i: Ast };

export class ExprError extends Error {}

export const EXPR_CAPS = {
  /** values in one list (its own length; what it holds counts against the budget) */
  list: 10000,
  /** lists inside lists */
  nest: 32,
  /** depth of one expression's parse tree */
  tree: 200,
  /** user functions calling each other */
  calls: 50,
  /** nested evaluation in all (function calls times their bodies' depth) */
  evalDepth: 1000,
  /** characters of one name (so a name lookup, a set of names and a message naming it stay small) */
  name: 64,
  /** characters of one definition key, name(params) included */
  key: 256,
  /** parameters of one user function (a parameter lookup scans at most these) */
  params: 16,
  /** error messages one block of definitions reports (the rest are counted), and characters of one */
  errors: 10,
  errorChars: 150,
};
const MAX_LEN = EXPR_CAPS.list;
const own = (o: object | undefined, k: string) => o !== undefined && Object.prototype.hasOwnProperty.call(o, k);

// the budget of the evaluation running now (evaluation is synchronous; a nested call saves and restores it)
let B: Budget | null = null;
const bud = (): Budget => B ?? partBudget();

// ---------- sizes: what a value holds, counted as its lists hold it (a shared list counts each time) ----------
export interface Size { n: number; c: number; d: number } // value slots, characters of text, lists inside lists
const NONE: Size = { n: 0, c: 0, d: 0 };
const sizes = new WeakMap<object, Size>();
const tooDeep = () => new ExprError(`lists are nested too deeply (the limit is ${EXPR_CAPS.nest} levels)`);
/** The size of a value. Lists made here are known; any other list or object (from YAML) is walked once, paying a
 *  step a slot. An object counts a slot and its key's characters for each key, and what each key holds. */
export function sizeOf(v: unknown, b: Budget, depth = 0): Size {
  if (typeof v === "string") return { n: 0, c: v.length, d: 0 };
  if (v === null || typeof v !== "object") return NONE;
  const m = sizes.get(v);
  if (m) return m;
  if (depth >= EXPR_CAPS.nest) throw tooDeep();
  if (Array.isArray(v)) { b.charge(1 + (v.length >> 3)); return keep(v, b, depth); }
  const keys = Object.keys(v);
  b.charge(1 + (keys.length >> 3));
  let n = keys.length, c = 0, d = 0;
  for (const k of keys) { const z = sizeOf((v as any)[k], b, depth + 1); n += z.n; c += k.length + z.c; if (z.d > d) d = z.d; }
  const r = { n, c, d: d + 1 };
  if (r.d > EXPR_CAPS.nest) throw tooDeep();
  sizes.set(v, r);
  return r;
}
/** The size of a value with every shared list or object counted once: what the source itself spells out. */
export function spelledOf(v: unknown, b: Budget): { n: number; c: number } {
  const seen = new Set<object>();
  let n = 0, c = 0;
  const walk = (x: unknown, depth: number) => {
    if (typeof x === "string") { c += x.length; return; }
    if (x === null || typeof x !== "object" || seen.has(x)) return;
    if (depth >= EXPR_CAPS.nest) throw tooDeep();
    seen.add(x);
    if (Array.isArray(x)) { b.charge(1 + (x.length >> 3)); n += x.length; for (const y of x) walk(y, depth + 1); return; }
    const keys = Object.keys(x);
    b.charge(1 + (keys.length >> 3)); n += keys.length;
    for (const k of keys) { c += k.length; walk((x as any)[k], depth + 1); }
  };
  walk(v, 0);
  return { n, c };
}
// record the size of a list whose own slots are paid for (its items may still be walked)
function keep(v: unknown[], b: Budget, depth = 0): Size {
  let n = v.length, c = 0, d = 0;
  for (const x of v) { const s = sizeOf(x, b, depth + 1); n += s.n; c += s.c; if (s.d > d) d = s.d; }
  const r = { n, c, d: d + 1 };
  if (r.d > EXPR_CAPS.nest) throw tooDeep();
  sizes.set(v, r);
  return r;
}
// a new list of items that already exist (a list literal, fill, if): pays for every slot the items stand for
function holding(v: Val[], b: Budget, slotsPaid = false): Val[] {
  if (!slotsPaid) b.charge(v.length, v.length);
  let n = 0, c = 0, d = 0;
  for (const x of v) { const s = sizeOf(x, b, 1); n += s.n; c += s.c; if (s.d > d) d = s.d; }
  if (d + 1 > EXPR_CAPS.nest) throw tooDeep();
  b.charge(0, n, c);
  sizes.set(v, { n: n + v.length, c, d: d + 1 });
  return v;
}

// ---------- tokens ----------
type Tok = { k: "num" | "str" | "id" | "op"; v: string; at: number };
// one pass over the characters (the same tokens as the patterns /\s/, /(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i,
// /[A-Za-z_][A-Za-z0-9_]*/ and the operators), with no regular expression per token
const digit = (c: number) => c >= 48 && c <= 57;
const idStart = (c: number) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const idPart = (c: number) => idStart(c) || digit(c);
const space = (s: string, i: number) => { const c = s.charCodeAt(i); return c === 32 || (c >= 9 && c <= 13) || (c > 127 && /\s/.test(s[i])); };
const OPS2 = new Set(["==", "!=", "<=", ">=", "&&", "||"]);
const OPS1 = new Set("-+*/%^<>!?:(),[]");
function lex(s: string, b: Budget): Tok[] {
  b.charge(1 + Math.ceil(s.length / 8)); // reading the text
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    if (space(s, i)) { i++; continue; }
    b.charge(1);
    const c = s[i], cc = s.charCodeAt(i);
    if (digit(cc) || (cc === 46 && digit(s.charCodeAt(i + 1)))) {
      let j = i;
      if (cc === 46) { j++; while (digit(s.charCodeAt(j))) j++; }
      else { while (digit(s.charCodeAt(j))) j++; if (s.charCodeAt(j) === 46) { j++; while (digit(s.charCodeAt(j))) j++; } }
      if (s[j] === "e" || s[j] === "E") { let k = j + 1; if (s[k] === "+" || s[k] === "-") k++; if (digit(s.charCodeAt(k))) { while (digit(s.charCodeAt(k))) k++; j = k; } }
      out.push({ k: "num", v: s.slice(i, j), at: i }); i = j; continue;
    }
    if (idStart(cc)) {
      let j = i + 1; while (idPart(s.charCodeAt(j))) j++;
      if (j - i > EXPR_CAPS.name) throw new ExprError(`a name at column ${i + 1} is longer than ${EXPR_CAPS.name} characters`);
      out.push({ k: "id", v: s.slice(i, j), at: i }); i = j; continue;
    }
    if (c === '"' || c === "'") {
      const j = s.indexOf(c, i + 1);
      if (j < 0) throw new ExprError(`a string opened at column ${i + 1} is never closed`);
      b.charge(0, 0, j - i - 1);
      out.push({ k: "str", v: s.slice(i + 1, j), at: i }); i = j + 1; continue;
    }
    const two = s.slice(i, i + 2);
    if (OPS2.has(two)) { out.push({ k: "op", v: two, at: i }); i += 2; continue; }
    if (OPS1.has(c)) { out.push({ k: "op", v: c, at: i }); i++; continue; }
    throw new ExprError(`unexpected "${c}" at column ${i + 1}`);
  }
  return out;
}

// ---------- parser ----------
const tooNested = () => new ExprError(`the expression is nested too deeply (the limit is ${EXPR_CAPS.tree} levels)`);
export function parse(src: string, budget?: Budget): Ast {
  const b = budget ?? bud();
  const t = lex(src, b);
  let p = 0, nest = 0;
  const depth = new WeakMap<Ast, number>();
  // every node is paid for, and no tree grows deeper than the cap (a long a+b+c+... is as deep as it is long)
  const mk = (n: Ast, kids: Ast[]): Ast => {
    b.charge(1);
    let d = 0;
    for (const k of kids) { const x = depth.get(k) ?? 1; if (x > d) d = x; }
    if (d + 1 > EXPR_CAPS.tree) throw tooNested();
    depth.set(n, d + 1);
    return n;
  };
  const deeper = <T>(f: () => T): T => { if (++nest > EXPR_CAPS.tree) throw tooNested(); try { return f(); } finally { nest--; } };
  const peek = (v?: string) => (t[p] && (v === undefined || t[p].v === v) ? t[p] : null);
  const eat = (v: string) => { if (!peek(v)) throw new ExprError(`expected "${v}"${t[p] ? ` at column ${t[p].at + 1}` : " at the end"}`); p++; };
  const expr = (): Ast => deeper(() => {
    const c = or();
    if (peek("?")) { p++; const a = expr(); eat(":"); const b2 = expr(); return mk({ t: "if", c, a, b: b2 }, [c, a, b2]); }
    return c;
  });
  const left = (next: () => Ast, ops: string[]) => (): Ast => {
    let a = next();
    while (t[p] && t[p].k === "op" && ops.includes(t[p].v)) { const op = t[p++].v; const r = next(); a = mk({ t: "bin", op, a, b: r }, [a, r]); }
    return a;
  };
  const unary = (): Ast => {
    if (peek("-") || peek("!")) { const op = t[p++].v; const a = deeper(unary); return mk({ t: "un", op, a }, [a]); }
    return pow();
  };
  const pow = (): Ast => {
    const a = postfix();
    if (peek("^")) { p++; const r = deeper(unary); return mk({ t: "bin", op: "^", a, b: r }, [a, r]); }
    return a;
  };
  const postfix = (): Ast => {
    let a = primary();
    while (peek("[")) { p++; const i = expr(); eat("]"); a = mk({ t: "index", a, i }, [a, i]); }
    return a;
  };
  const primary = (): Ast => {
    const k = t[p];
    if (!k) throw new ExprError("the expression ends too early");
    if (k.k === "num") { p++; return { t: "num", v: +k.v }; }
    if (k.k === "str") { p++; return { t: "str", v: k.v }; }
    if (k.k === "id") {
      p++;
      if (k.v === "true" || k.v === "false") return { t: "bool", v: k.v === "true" };
      if (peek("(")) {
        p++;
        const args: Ast[] = [];
        if (!peek(")")) { args.push(expr()); while (peek(",")) { p++; args.push(expr()); } }
        eat(")");
        return mk({ t: "call", f: k.v, args }, args);
      }
      return { t: "name", v: k.v };
    }
    if (k.v === "(") { p++; const e = expr(); eat(")"); return e; }
    if (k.v === "[") {
      p++;
      const items: Ast[] = [];
      if (!peek("]")) { items.push(expr()); while (peek(",")) { p++; items.push(expr()); } }
      eat("]");
      return mk({ t: "list", items }, items);
    }
    throw new ExprError(`unexpected "${clip(k.v, 20)}" at column ${k.at + 1}`);
  };
  const mul = left(unary, ["*", "/", "%"]);
  const add = left(mul, ["+", "-"]);
  const cmp = left(add, ["==", "!=", "<", "<=", ">", ">="]);
  const and = left(cmp, ["&&"]);
  const or = left(and, ["||"]);
  const e = expr();
  if (p < t.length) throw new ExprError(`unexpected "${clip(t[p].v, 20)}" at column ${t[p].at + 1}`);
  return e;
}

// ---------- built-in functions ----------
const clip = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const show = (v: Val): string => (Array.isArray(v) ? `a list of ${v.length}` : typeof v === "string" ? JSON.stringify(clip(v)) : v !== null && typeof v === "object" ? "an object" : String(JSON.stringify(v)));
const num = (v: Val, f: string): number => { if (typeof v !== "number") throw new ExprError(`${f}() needs a number, got ${show(v)}`); return v; };
const list = (v: Val, f: string): Val[] => { if (!Array.isArray(v)) throw new ExprError(`${f}() needs a list, got ${show(v)}`); return v; };
const nums = (v: Val, f: string): number[] => { const l = list(v, f); bud().charge(l.length); return l.map((x) => num(x, f)); };
const finite = (v: Val, f: string): number => { const n = num(v, f); if (!Number.isFinite(n)) throw new ExprError(`${f}() needs a finite number, got ${n}`); return n; };
const map1 = (f: (x: number) => number, name: string) => (a: Val[]) => each1(a[0], (x) => f(num(x, name)));
// f on every value of a (nested) list; each level pays for its slots before it is made
function each1(v: Val, f: (x: Val) => Val): Val {
  if (!Array.isArray(v)) return f(v);
  const b = bud(), n = v.length;
  b.charge(n, n);
  const out: Val[] = [];
  let flat = true;
  for (let i = 0; i < n; i++) { const x = v[i]; const r = Array.isArray(x) ? each1(x, f) : f(x); if (typeof r === "object" || typeof r === "string") flat = false; out.push(r); }
  if (flat) sizes.set(out, { n, c: 0, d: 1 }); else keep(out, b);
  return out;
}
// a new list of numbers, paid for before it is made
function numbers(n: number, f: (i: number) => number): number[] {
  const b = bud();
  b.charge(n, n);
  const out = Array.from({ length: n }, (_, i) => f(i));
  sizes.set(out, { n, c: 0, d: 1 });
  return out;
}
const extreme = (a: Val[], name: string, pick: (x: number, y: number) => number): number => {
  const xs = a.length === 1 ? nums(a[0], name) : a.map((x) => num(x, name));
  let r = xs.length ? xs[0] : name === "min" ? Infinity : -Infinity;
  for (const x of xs) { if (Number.isNaN(x)) return NaN; r = pick(r, x); }
  return r;
};

export const BUILTINS: Record<string, { arity: [number, number]; doc: string; fn: (a: Val[]) => Val }> = {
  range: { arity: [2, 3], doc: "range(a, b, step=1): the numbers from a to b, both included", fn: ([a, b, s]) => {
    const lo = finite(a, "range"), hi = finite(b, "range"), st = s === undefined ? 1 : finite(s, "range");
    if (st <= 0) throw new ExprError("range() needs a step above 0");
    const n = Math.floor((hi - lo) / st + 1e-9) + 1;
    if (!(n <= MAX_LEN)) throw new ExprError(`range() would make ${n} values (the limit is ${MAX_LEN})`);
    // whole numbers need no rounding (toFixed gives them back unchanged); others are cleaned to 10 decimals
    const whole = Number.isInteger(lo) && Number.isInteger(st) && Math.abs(lo) + Math.abs(st) * n < 2 ** 52;
    if (!whole) bud().charge(6 * Math.max(0, n)); // the rounding costs about six steps a value
    return numbers(Math.max(0, n), whole ? (i) => lo + i * st : (i) => +(lo + i * st).toFixed(10));
  } },
  len: { arity: [1, 1], doc: "len(list): how many values", fn: ([a]) => list(a, "len").length },
  sum: { arity: [1, 1], doc: "sum(list)", fn: ([a]) => nums(a, "sum").reduce((x, y) => x + y, 0) },
  cumsum: { arity: [1, 1], doc: "cumsum(list): running total", fn: ([a]) => { let s = 0; const xs = nums(a, "cumsum"); return numbers(xs.length, (i) => (s += xs[i])); } },
  min: { arity: [1, 9], doc: "min(list) or min(a, b, ...)", fn: (a) => extreme(a, "min", Math.min) },
  max: { arity: [1, 9], doc: "max(list) or max(a, b, ...)", fn: (a) => extreme(a, "max", Math.max) },
  round: { arity: [1, 2], doc: "round(x, digits=0)", fn: ([a, d]) => { const k = 10 ** (d === undefined ? 0 : finite(d, "round")); return each1(a, (x) => Math.round(num(x, "round") * k) / k); } },
  floor: { arity: [1, 1], doc: "floor(x)", fn: map1(Math.floor, "floor") },
  ceil: { arity: [1, 1], doc: "ceil(x)", fn: map1(Math.ceil, "ceil") },
  abs: { arity: [1, 1], doc: "abs(x)", fn: map1(Math.abs, "abs") },
  sqrt: { arity: [1, 1], doc: "sqrt(x)", fn: map1(Math.sqrt, "sqrt") },
  log: { arity: [1, 1], doc: "log(x): natural log", fn: map1(Math.log, "log") },
  log2: { arity: [1, 1], doc: "log2(x)", fn: map1(Math.log2, "log2") },
  exp: { arity: [1, 1], doc: "exp(x)", fn: map1(Math.exp, "exp") },
  if: { arity: [3, 3], doc: "if(cond, a, b), value by value", fn: ([c, a, b]) => zip3(c, a, b) },
  text: { arity: [1, 2], doc: "text(x, digits): a number as text", fn: ([a, d]) => {
    const k = d === undefined ? undefined : num(d, "text");
    if (k !== undefined && !(Number.isInteger(k) && k >= 0 && k <= 100)) throw new ExprError(`text() needs digits from 0 to 100, got ${k}`);
    const b = bud();
    return each1(a, (x) => { const s = typeof x === "number" && k !== undefined ? x.toFixed(k) : String(x); b.charge(0, 0, s.length); return s; });
  } },
  first: { arity: [1, 1], doc: "first(list)", fn: ([a]) => list(a, "first")[0] ?? 0 },
  last: { arity: [1, 1], doc: "last(list)", fn: ([a]) => { const l = list(a, "last"); return l[l.length - 1] ?? 0; } },
  fill: { arity: [2, 2], doc: "fill(value, n): a list of n copies", fn: ([v, n]) => {
    const k = num(n, "fill");
    if (k > MAX_LEN || Number.isNaN(k)) throw new ExprError("fill() is over the limit");
    const len = Math.max(0, Math.floor(k));
    // every copy is paid for as if it were made: a list of n copies of a list holds n times what that list holds
    const b = bud(), s = sizeOf(v, b);
    if (s.d + 1 > EXPR_CAPS.nest) throw tooDeep();
    b.charge(len, len + len * s.n, len * s.c);
    const out = Array.from({ length: len }, () => v);
    sizes.set(out, { n: len + len * s.n, c: len * s.c, d: s.d + 1 });
    return out;
  } },
};
function zip3(c: Val, a: Val, b: Val): Val {
  const arrs = [c, a, b].filter(Array.isArray) as Val[][];
  if (!arrs.length) return c ? a : b;
  const n = arrs[0].length;
  if (arrs.some((x) => x.length !== n)) throw new ExprError("if() lists have different lengths");
  const pick = (v: Val, i: number) => (Array.isArray(v) ? v[i] : v);
  const bg = bud();
  bg.charge(n, n);
  return holding(Array.from({ length: n }, (_, i) => (pick(c, i) ? pick(a, i) : pick(b, i))), bg, true);
}

// ---------- evaluation ----------
export interface Env { vars: Record<string, Val>; fns?: Record<string, { params: string[]; body: Ast }> }

function binop(op: string, a: Val, b: Val): Val {
  if (Array.isArray(a) || Array.isArray(b)) {
    const n = Array.isArray(a) ? a.length : (b as Val[]).length;
    if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) throw new ExprError(`"${op}" on lists of ${a.length} and ${b.length} values`);
    const bg = bud(), A = Array.isArray(a), Bl = Array.isArray(b);
    bg.charge(n, n);
    const out: Val[] = [];
    let flat = true;
    for (let i = 0; i < n; i++) {
      const x = A ? (a as Val[])[i] : a, y = Bl ? (b as Val[])[i] : b;
      const r = Array.isArray(x) || Array.isArray(y) ? binop(op, x, y) : scalar(op, x, y);
      if (typeof r === "object" || typeof r === "string") flat = false;
      out.push(r);
    }
    if (flat) sizes.set(out, { n, c: 0, d: 1 }); else keep(out, bg);
    return out;
  }
  return scalar(op, a, b);
}
function scalar(op: string, a: Val, b: Val): Val {
  switch (op) {
    case "+": {
      if (typeof a !== "string" && typeof b !== "string") return num(a, "+") + num(b, "+");
      const x = String(a), y = String(b);
      bud().charge(1, 0, x.length + y.length);
      return x + y;
    }
    case "-": return num(a, "-") - num(b, "-");
    case "*": return num(a, "*") * num(b, "*");
    case "/": return num(a, "/") / num(b, "/");
    case "%": return num(a, "%") % num(b, "%");
    case "^": return num(a, "^") ** num(b, "^");
    case "==": if (typeof a === "string" && typeof b === "string") bud().charge(Math.min(a.length, b.length) >> 5); return a === b;
    case "!=": if (typeof a === "string" && typeof b === "string") bud().charge(Math.min(a.length, b.length) >> 5); return a !== b;
    case "<": return num(a, "<") < num(b, "<");
    case "<=": return num(a, "<=") <= num(b, "<=");
    case ">": return num(a, ">") > num(b, ">");
    case ">=": return num(a, ">=") >= num(b, ">=");
    case "&&": return Boolean(a) && Boolean(b);
    case "||": return Boolean(a) || Boolean(b);
  }
  throw new ExprError(`unknown operator ${op}`);
}

// names live in objects without a prototype, so "constructor" or "__proto__" is only ever an author's own name
function scopeOf(vars: Record<string, Val>, b: Budget): Record<string, Val> {
  if (Object.getPrototypeOf(vars) === null) return vars;
  const keys = Object.keys(vars);
  b.charge(keys.length);
  const out: Record<string, Val> = Object.create(null);
  for (const k of keys) out[k] = vars[k];
  return out;
}

export function evaluate(ast: Ast, env: Env, budget?: Budget): Val {
  const b = budget ?? bud();
  const saved = B;
  B = b;
  try {
    const globals = scopeOf(env.vars, b);
    const fns = env.fns;
    // a function call's own names: its parameters, looked up before the definitions (no copy of every name)
    type Local = { names: string[]; vals: Val[] } | null;
    const ev = (n: Ast, loc: Local, calls: number, level: number): Val => {
      b.charge(1);
      if (calls > EXPR_CAPS.calls) throw new ExprError("functions call each other too deeply");
      if (level > EXPR_CAPS.evalDepth) throw new ExprError("the expression is nested too deeply");
      const l = level + 1;
      switch (n.t) {
        case "num": case "str": case "bool": return n.v;
        case "name": {
          if (loc) { const k = loc.names.indexOf(n.v); if (k >= 0) return loc.vals[k]; }
          if (n.v in globals) return globals[n.v];
          throw new ExprError(`unknown name "${n.v}"`);
        }
        case "list": return holding(n.items.map((x) => ev(x, loc, calls, l)), b);
        case "un": {
          const a = ev(n.a, loc, calls, l);
          if (n.op === "-") return binop("*", a, -1);
          if (!Array.isArray(a)) return !a;
          b.charge(a.length, a.length);
          const out = a.map((x) => !x);
          sizes.set(out, { n: out.length, c: 0, d: 1 });
          return out;
        }
        case "bin": return binop(n.op, ev(n.a, loc, calls, l), ev(n.b, loc, calls, l));
        case "if": return ev(n.c, loc, calls, l) ? ev(n.a, loc, calls, l) : ev(n.b, loc, calls, l);
        case "index": {
          const a = ev(n.a, loc, calls, l), i = ev(n.i, loc, calls, l);
          if (!Array.isArray(a)) throw new ExprError("[ ] needs a list");
          const k = num(i, "[ ]");
          const v = a[k < 0 ? a.length + k : k];
          if (v === undefined) throw new ExprError(`index ${k} is outside a list of ${a.length}`);
          return v;
        }
        case "call": {
          const args = n.args.map((x) => ev(x, loc, calls, l));
          const u = own(fns, n.f) ? fns![n.f] : undefined;
          if (u) {
            if (args.length !== u.params.length) throw new ExprError(`${n.f}() takes ${u.params.length} values, got ${args.length}`);
            // the function sees the definitions and its own parameters; a call (a frame, its arguments, a scope) costs 4 steps
            b.charge(3);
            return ev(u.body, { names: u.params, vals: args }, calls + 1, l);
          }
          if (!own(BUILTINS, n.f)) throw new ExprError(`unknown function "${n.f}"`);
          const bi = BUILTINS[n.f];
          if (args.length < bi.arity[0] || args.length > bi.arity[1]) throw new ExprError(`${n.f}() takes ${bi.arity[0]}${bi.arity[1] > bi.arity[0] ? ` to ${bi.arity[1]}` : ""} values, got ${args.length}`);
          const r = bi.fn(args);
          if (Array.isArray(r) && r.length > MAX_LEN) throw new ExprError("a list is over the limit");
          return r;
        }
      }
    };
    return ev(ast, null, 0, 0);
  } finally { B = saved; }
}

// names an expression reads (free names and called functions)
export function namesOf(ast: Ast, out = { vars: new Set<string>(), fns: new Set<string>() }, budget?: Budget) {
  const b = budget ?? bud();
  const w = (n: Ast) => {
    b.charge(1);
    switch (n.t) {
      case "name": out.vars.add(n.v); break;
      case "list": n.items.forEach(w); break;
      case "un": w(n.a); break;
      case "bin": w(n.a); w(n.b); break;
      case "if": w(n.c); w(n.a); w(n.b); break;
      case "index": w(n.a); w(n.i); break;
      case "call": out.fns.add(n.f); n.args.forEach(w); break;
    }
  };
  w(ast);
  return out;
}

// ---------- a block of definitions: `name: expr` and `name(a, b): expr` ----------
export interface Defs { order: string[]; vars: Record<string, Ast>; fns: Record<string, { params: string[]; body: Ast }> }

// a definition key: `name` or `name(a, b)` (spaces allowed around the parameters), read in one pass; null if it is not one
const isName = (s: string) => s.length > 0 && idStart(s.charCodeAt(0)) && [...s].every((ch) => idPart(ch.charCodeAt(0)));
function readKey(k: string): { name: string; params: string[] | null } | null {
  let j = 0;
  if (!idStart(k.charCodeAt(0))) return null;
  while (idPart(k.charCodeAt(j))) j++;
  const name = k.slice(0, j);
  if (j === k.length) return { name, params: null };
  if (k[j] !== "(" || k[k.length - 1] !== ")") return null;
  const inner = k.slice(j + 1, -1);
  if (!inner.trim()) return { name, params: [] };
  const params = inner.split(",").map((x) => x.trim());
  return params.every(isName) ? { name, params } : null;
}
// a definition's source as text; a YAML list (written by mistake) is paid for before it is turned into text
function sourceOf(v: unknown, b: Budget): string {
  if (Array.isArray(v)) { const s = sizeOf(v, b); b.charge(s.n, 0, s.c + s.n * 24); }
  return String(v);
}
// a cycle's path, shortened in the middle when it is long
const pathText = (names: string[]) => (names.length > 12 ? [...names.slice(0, 5), "…", ...names.slice(-6)] : names).map((x) => clip(x, EXPR_CAPS.name)).join(" → ");
export function parseDefs(entries: Record<string, unknown>, known: string[], budget?: Budget): { defs: Defs; errors: string[] } {
  const b = budget ?? bud();
  // at most EXPR_CAPS.errors messages of at most EXPR_CAPS.errorChars each; the rest are counted
  const errors: string[] = [];
  let more = 0;
  const fail = (m: string) => { if (errors.length < EXPR_CAPS.errors) errors.push(clip(m, EXPR_CAPS.errorChars)); else more++; };
  const defs: Defs = { order: [], vars: Object.create(null), fns: Object.create(null) };
  b.charge(1 + known.length); // the controls' names, read into sets below (once per evaluation)
  const knownSet = new Set(known);
  for (const [k, v] of Object.entries(entries ?? {})) {
    b.charge(1 + (k.length >> 3));
    const m = k.length <= EXPR_CAPS.key ? readKey(k) : null;
    if (!m) { fail(`"${clip(k)}" is not a name or a name(params)${k.length > EXPR_CAPS.key ? ` (a key has at most ${EXPR_CAPS.key} characters)` : ""}`); continue; }
    if (m.name.length > EXPR_CAPS.name || (m.params ?? []).some((p) => p.length > EXPR_CAPS.name)) { fail(`"${clip(k)}": a name has at most ${EXPR_CAPS.name} characters`); continue; }
    if ((m.params?.length ?? 0) > EXPR_CAPS.params) { fail(`${m.name}(): a function takes at most ${EXPR_CAPS.params} parameters`); continue; }
    if (own(BUILTINS, m.name) || knownSet.has(m.name)) { fail(`"${m.name}" is already a control or a built-in function`); continue; }
    let ast: Ast;
    try { ast = parse(sourceOf(v, b), b); } catch (e) { if (e instanceof BudgetError) throw e; fail(`${clip(k)}: ${(e as Error).message}`); continue; }
    if (m.params) defs.fns[m.name] = { params: m.params, body: ast };
    else { defs.vars[m.name] = ast; defs.order.push(m.name); }
  }
  // every name must resolve; no cycles among vars (walked with a stack of our own: a long chain is no deep recursion)
  const read = new WeakMap<Ast, ReturnType<typeof namesOf>>();
  const names = (a: Ast) => { let r = read.get(a); if (!r) { r = namesOf(a, undefined, b); read.set(a, r); } return r; };
  const deps = (n: string): string[] => {
    const out: string[] = [];
    const { vars, fns } = names(defs.vars[n]);
    for (const f of fns) if (own(defs.fns, f)) for (const x of names(defs.fns[f].body).vars) { b.charge(1); if (own(defs.vars, x) && !defs.fns[f].params.includes(x)) out.push(x); }
    for (const x of vars) { b.charge(1); if (own(defs.vars, x)) out.push(x); }
    return out;
  };
  const state = new Map<string, 1 | 2>(); // 1 visiting, 2 done
  const order: string[] = [];
  for (const root of defs.order) {
    if (state.has(root)) continue;
    const stack: { n: string; d: string[]; i: number }[] = [{ n: root, d: deps(root), i: 0 }];
    state.set(root, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.i < top.d.length) {
        const x = top.d[top.i++];
        b.charge(1);
        const st = state.get(x);
        if (st === 2) continue;
        if (st === 1) { if (errors.length < EXPR_CAPS.errors) { const L = stack.length; const ns = L > 12 ? [...stack.slice(0, 5).map((f) => f.n), "", ...stack.slice(L - 5).map((f) => f.n)] : stack.map((f) => f.n); fail(`"${pathText([...ns, x]).replace(" →  →", " → … →")}" refers to itself`); } else more++; continue; }
        state.set(x, 1);
        stack.push({ n: x, d: deps(x), i: 0 });
      } else { stack.pop(); state.set(top.n, 2); order.push(top.n); }
    }
  }
  defs.order = order;
  const scope = new Set([...known, ...Object.keys(defs.vars)]);
  const checkNames = (ast: Ast, where: string, params: string[] = []) => {
    const { vars, fns } = names(ast);
    for (const x of vars) { b.charge(1); if (!scope.has(x) && !params.includes(x)) fail(`${where}: unknown name "${x}"`); }
    for (const f of fns) { b.charge(1); if (!own(BUILTINS, f) && !own(defs.fns, f)) fail(`${where}: unknown function "${f}"`); }
  };
  for (const n of Object.keys(defs.vars)) checkNames(defs.vars[n], n);
  for (const [n, f] of Object.entries(defs.fns)) checkNames(f.body, `${n}()`, f.params);
  if (more) errors.push(`and ${more} more`);
  return { defs, errors };
}

// evaluate every definition with the given control values, in dependency order (one budget for them all)
export function evalDefs(defs: Defs, controls: Record<string, Val>, budget?: Budget): Record<string, Val> {
  const b = budget ?? bud();
  const vars = scopeOf({ ...controls }, b);
  for (const n of defs.order) vars[n] = evaluate(defs.vars[n], { vars, fns: defs.fns }, b);
  return vars;
}

export function checkExpr(src: string, scope: string[], fns: string[] = [], budget?: Budget): string | null {
  try {
    const b = budget ?? bud();
    const { vars, fns: fs } = namesOf(parse(src, b), undefined, b);
    for (const x of vars) if (!scope.includes(x)) return `unknown name "${x}"`;
    for (const f of fs) if (!own(BUILTINS, f) && !fns.includes(f)) return `unknown function "${f}"`;
    return null;
  } catch (e) { if (e instanceof BudgetError) throw e; return (e as Error).message; }
}

// fill `{expr}` holes in a text; every hole and the text it makes are paid for from one budget
export function fillHoles(text: string, vars: Record<string, Val>, budget?: Budget): string {
  const b = budget ?? bud();
  const scope = scopeOf(vars, b);
  b.charge(1 + Math.ceil(text.length / 8), 0, text.length);
  return text.replace(/\{([^{}]+)\}/g, (_, e) => {
    const v = evaluate(parse(e, b), { vars: scope }, b);
    if (!Array.isArray(v)) { const s = String(v); b.charge(1, 0, s.length); return s; }
    const s = sizeOf(v, b);
    b.charge(s.n, 0, s.c + s.n * 26); // the joined text: every value and its ", " (a number prints in at most 24 characters)
    return v.join(", ");
  });
}
