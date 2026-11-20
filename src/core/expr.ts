// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// expr: the small, safe expression language of Durian Hypermedia.
// Used by chart `let` entries and series `data`, and by `{...}` holes in animation loops.
// No property access, no assignment, no loops, no host functions: a parse tree evaluated by a tiny interpreter.
// Arithmetic and comparisons work element by element on lists ("broadcasting"), so `calls - 1` subtracts 1 from each.

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

const MAX_LEN = 10000;
const MAX_STEPS = 200000;

// ---------- tokens ----------
type Tok = { k: "num" | "str" | "id" | "op"; v: string; at: number };
function lex(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = s.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
    if (num) { out.push({ k: "num", v: num[0], at: i }); i += num[0].length; continue; }
    const id = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (id) { out.push({ k: "id", v: id[0], at: i }); i += id[0].length; continue; }
    if (c === '"' || c === "'") {
      const j = s.indexOf(c, i + 1);
      if (j < 0) throw new ExprError(`a string opened at column ${i + 1} is never closed`);
      out.push({ k: "str", v: s.slice(i + 1, j), at: i }); i = j + 1; continue;
    }
    const op = s.slice(i).match(/^(==|!=|<=|>=|&&|\|\||[-+*/%^<>!?:(),\[\]])/);
    if (op) { out.push({ k: "op", v: op[0], at: i }); i += op[0].length; continue; }
    throw new ExprError(`unexpected "${c}" at column ${i + 1}`);
  }
  return out;
}

// ---------- parser ----------
export function parse(src: string): Ast {
  const t = lex(src);
  let p = 0;
  const peek = (v?: string) => (t[p] && (v === undefined || t[p].v === v) ? t[p] : null);
  const eat = (v: string) => { if (!peek(v)) throw new ExprError(`expected "${v}"${t[p] ? ` at column ${t[p].at + 1}` : " at the end"}`); p++; };
  const expr = (): Ast => {
    const c = or();
    if (peek("?")) { p++; const a = expr(); eat(":"); const b = expr(); return { t: "if", c, a, b }; }
    return c;
  };
  const left = (next: () => Ast, ops: string[]) => (): Ast => {
    let a = next();
    while (t[p] && t[p].k === "op" && ops.includes(t[p].v)) { const op = t[p++].v; a = { t: "bin", op, a, b: next() }; }
    return a;
  };
  const unary = (): Ast => {
    if (peek("-") || peek("!")) { const op = t[p++].v; return { t: "un", op, a: unary() }; }
    return pow();
  };
  const pow = (): Ast => {
    const a = postfix();
    if (peek("^")) { p++; return { t: "bin", op: "^", a, b: unary() }; }
    return a;
  };
  const postfix = (): Ast => {
    let a = primary();
    while (peek("[")) { p++; const i = expr(); eat("]"); a = { t: "index", a, i }; }
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
        return { t: "call", f: k.v, args };
      }
      return { t: "name", v: k.v };
    }
    if (k.v === "(") { p++; const e = expr(); eat(")"); return e; }
    if (k.v === "[") {
      p++;
      const items: Ast[] = [];
      if (!peek("]")) { items.push(expr()); while (peek(",")) { p++; items.push(expr()); } }
      eat("]");
      return { t: "list", items };
    }
    throw new ExprError(`unexpected "${k.v}" at column ${k.at + 1}`);
  };
  const mul = left(unary, ["*", "/", "%"]);
  const add = left(mul, ["+", "-"]);
  const cmp = left(add, ["==", "!=", "<", "<=", ">", ">="]);
  const and = left(cmp, ["&&"]);
  const or = left(and, ["||"]);
  const e = expr();
  if (p < t.length) throw new ExprError(`unexpected "${t[p].v}" at column ${t[p].at + 1}`);
  return e;
}

// ---------- built-in functions ----------
const num = (v: Val, f: string): number => { if (typeof v !== "number") throw new ExprError(`${f}() needs a number, got ${show(v)}`); return v; };
const list = (v: Val, f: string): Val[] => { if (!Array.isArray(v)) throw new ExprError(`${f}() needs a list, got ${show(v)}`); return v; };
const nums = (v: Val, f: string): number[] => list(v, f).map((x) => num(x, f));
const map1 = (f: (x: number) => number, name: string) => (a: Val[]) => each1(a[0], (x) => f(num(x, name)));
function each1(v: Val, f: (x: Val) => Val): Val { return Array.isArray(v) ? v.map((x) => each1(x, f)) : f(v); }

export const BUILTINS: Record<string, { arity: [number, number]; doc: string; fn: (a: Val[]) => Val }> = {
  range: { arity: [2, 3], doc: "range(a, b, step=1): the numbers from a to b, both included", fn: ([a, b, s]) => {
    const lo = num(a, "range"), hi = num(b, "range"), st = s === undefined ? 1 : num(s, "range");
    if (st <= 0) throw new ExprError("range() needs a step above 0");
    const n = Math.floor((hi - lo) / st + 1e-9) + 1;
    if (n > MAX_LEN) throw new ExprError(`range() would make ${n} values (the limit is ${MAX_LEN})`);
    return Array.from({ length: Math.max(0, n) }, (_, i) => +(lo + i * st).toFixed(10));
  } },
  len: { arity: [1, 1], doc: "len(list): how many values", fn: ([a]) => list(a, "len").length },
  sum: { arity: [1, 1], doc: "sum(list)", fn: ([a]) => nums(a, "sum").reduce((x, y) => x + y, 0) },
  cumsum: { arity: [1, 1], doc: "cumsum(list): running total", fn: ([a]) => { let s = 0; return nums(a, "cumsum").map((x) => (s += x)); } },
  min: { arity: [1, 9], doc: "min(list) or min(a, b, ...)", fn: (a) => Math.min(...(a.length === 1 ? nums(a[0], "min") : a.map((x) => num(x, "min")))) },
  max: { arity: [1, 9], doc: "max(list) or max(a, b, ...)", fn: (a) => Math.max(...(a.length === 1 ? nums(a[0], "max") : a.map((x) => num(x, "max")))) },
  round: { arity: [1, 2], doc: "round(x, digits=0)", fn: ([a, d]) => { const k = 10 ** (d === undefined ? 0 : num(d, "round")); return each1(a, (x) => Math.round(num(x, "round") * k) / k); } },
  floor: { arity: [1, 1], doc: "floor(x)", fn: map1(Math.floor, "floor") },
  ceil: { arity: [1, 1], doc: "ceil(x)", fn: map1(Math.ceil, "ceil") },
  abs: { arity: [1, 1], doc: "abs(x)", fn: map1(Math.abs, "abs") },
  sqrt: { arity: [1, 1], doc: "sqrt(x)", fn: map1(Math.sqrt, "sqrt") },
  log: { arity: [1, 1], doc: "log(x): natural log", fn: map1(Math.log, "log") },
  log2: { arity: [1, 1], doc: "log2(x)", fn: map1(Math.log2, "log2") },
  exp: { arity: [1, 1], doc: "exp(x)", fn: map1(Math.exp, "exp") },
  if: { arity: [3, 3], doc: "if(cond, a, b), value by value", fn: ([c, a, b]) => zip3(c, a, b) },
  text: { arity: [1, 2], doc: "text(x, digits): a number as text", fn: ([a, d]) => each1(a, (x) => (typeof x === "number" && d !== undefined ? x.toFixed(num(d, "text")) : String(x))) },
  first: { arity: [1, 1], doc: "first(list)", fn: ([a]) => list(a, "first")[0] ?? 0 },
  last: { arity: [1, 1], doc: "last(list)", fn: ([a]) => { const l = list(a, "last"); return l[l.length - 1] ?? 0; } },
  fill: { arity: [2, 2], doc: "fill(value, n): a list of n copies", fn: ([v, n]) => { const k = num(n, "fill"); if (k > MAX_LEN) throw new ExprError("fill() is over the limit"); return Array.from({ length: Math.max(0, k) }, () => v); } },
};
function zip3(c: Val, a: Val, b: Val): Val {
  const arrs = [c, a, b].filter(Array.isArray) as Val[][];
  if (!arrs.length) return c ? a : b;
  const n = arrs[0].length;
  if (arrs.some((x) => x.length !== n)) throw new ExprError("if() lists have different lengths");
  const at = (v: Val, i: number) => (Array.isArray(v) ? v[i] : v);
  return Array.from({ length: n }, (_, i) => (at(c, i) ? at(a, i) : at(b, i)));
}
const show = (v: Val): string => (Array.isArray(v) ? `a list of ${v.length}` : JSON.stringify(v));

// ---------- evaluation ----------
export interface Env { vars: Record<string, Val>; fns?: Record<string, { params: string[]; body: Ast }> }

function binop(op: string, a: Val, b: Val): Val {
  if (Array.isArray(a) || Array.isArray(b)) {
    const n = Array.isArray(a) ? a.length : (b as Val[]).length;
    if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) throw new ExprError(`"${op}" on lists of ${a.length} and ${b.length} values`);
    return Array.from({ length: n }, (_, i) => binop(op, Array.isArray(a) ? a[i] : a, Array.isArray(b) ? b[i] : b));
  }
  switch (op) {
    case "+": return typeof a === "string" || typeof b === "string" ? String(a) + String(b) : num(a, "+") + num(b, "+");
    case "-": return num(a, "-") - num(b, "-");
    case "*": return num(a, "*") * num(b, "*");
    case "/": return num(a, "/") / num(b, "/");
    case "%": return num(a, "%") % num(b, "%");
    case "^": return num(a, "^") ** num(b, "^");
    case "==": return a === b;
    case "!=": return a !== b;
    case "<": return num(a, "<") < num(b, "<");
    case "<=": return num(a, "<=") <= num(b, "<=");
    case ">": return num(a, ">") > num(b, ">");
    case ">=": return num(a, ">=") >= num(b, ">=");
    case "&&": return Boolean(a) && Boolean(b);
    case "||": return Boolean(a) || Boolean(b);
  }
  throw new ExprError(`unknown operator ${op}`);
}

export function evaluate(ast: Ast, env: Env): Val {
  let steps = 0;
  const ev = (n: Ast, vars: Record<string, Val>, depth: number): Val => {
    if (++steps > MAX_STEPS) throw new ExprError("the expression takes too long");
    if (depth > 50) throw new ExprError("functions call each other too deeply");
    switch (n.t) {
      case "num": case "str": case "bool": return n.v;
      case "name": if (n.v in vars) return vars[n.v]; throw new ExprError(`unknown name "${n.v}"`);
      case "list": return n.items.map((x) => ev(x, vars, depth));
      case "un": { const a = ev(n.a, vars, depth); return n.op === "-" ? binop("*", a, -1) : Array.isArray(a) ? a.map((x) => !x) : !a; }
      case "bin": return binop(n.op, ev(n.a, vars, depth), ev(n.b, vars, depth));
      case "if": return ev(n.c, vars, depth) ? ev(n.a, vars, depth) : ev(n.b, vars, depth);
      case "index": {
        const a = ev(n.a, vars, depth), i = ev(n.i, vars, depth);
        if (!Array.isArray(a)) throw new ExprError("[ ] needs a list");
        const k = num(i, "[ ]");
        const v = a[k < 0 ? a.length + k : k];
        if (v === undefined) throw new ExprError(`index ${k} is outside a list of ${a.length}`);
        return v;
      }
      case "call": {
        const args = n.args.map((x) => ev(x, vars, depth));
        const u = env.fns?.[n.f];
        if (u) {
          if (args.length !== u.params.length) throw new ExprError(`${n.f}() takes ${u.params.length} values, got ${args.length}`);
          return ev(u.body, { ...env.vars, ...Object.fromEntries(u.params.map((p, i) => [p, args[i]])) }, depth + 1);
        }
        const b = BUILTINS[n.f];
        if (!b) throw new ExprError(`unknown function "${n.f}"`);
        if (args.length < b.arity[0] || args.length > b.arity[1]) throw new ExprError(`${n.f}() takes ${b.arity[0]}${b.arity[1] > b.arity[0] ? ` to ${b.arity[1]}` : ""} values, got ${args.length}`);
        const r = b.fn(args);
        if (Array.isArray(r) && r.length > MAX_LEN) throw new ExprError("a list is over the limit");
        return r;
      }
    }
  };
  return ev(ast, env.vars, 0);
}

// names an expression reads (free names and called functions)
export function namesOf(ast: Ast, out = { vars: new Set<string>(), fns: new Set<string>() }) {
  const w = (n: Ast) => {
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

const DEF_KEY = /^([A-Za-z_]\w*)(?:\(\s*([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)?\s*\))?$/;
export function parseDefs(entries: Record<string, unknown>, known: string[]): { defs: Defs; errors: string[] } {
  const errors: string[] = [];
  const defs: Defs = { order: [], vars: {}, fns: {} };
  for (const [k, v] of Object.entries(entries ?? {})) {
    const m = k.match(DEF_KEY);
    if (!m) { errors.push(`"${k}" is not a name or a name(params)`); continue; }
    if (BUILTINS[m[1]] || known.includes(m[1])) { errors.push(`"${m[1]}" is already a control or a built-in function`); continue; }
    let ast: Ast;
    try { ast = parse(String(v)); } catch (e) { errors.push(`${k}: ${(e as Error).message}`); continue; }
    if (m[2] !== undefined || k.includes("(")) defs.fns[m[1]] = { params: (m[2] ?? "").split(",").map((s) => s.trim()).filter(Boolean), body: ast };
    else { defs.vars[m[1]] = ast; defs.order.push(m[1]); }
  }
  // every name must resolve; no cycles among vars
  const visiting = new Set<string>(), done = new Set<string>();
  const order: string[] = [];
  const visit = (n: string, path: string[]) => {
    if (done.has(n)) return;
    if (visiting.has(n)) { errors.push(`"${[...path, n].join(" → ")}" refers to itself`); return; }
    visiting.add(n);
    const { vars, fns } = namesOf(defs.vars[n]);
    for (const f of fns) if (defs.fns[f]) for (const x of namesOf(defs.fns[f].body).vars) if (defs.vars[x] && !defs.fns[f].params.includes(x)) visit(x, [...path, n]);
    for (const x of vars) if (defs.vars[x]) visit(x, [...path, n]);
    visiting.delete(n); done.add(n); order.push(n);
  };
  for (const n of defs.order) visit(n, []);
  defs.order = order;
  const scope = new Set([...known, ...Object.keys(defs.vars)]);
  const checkNames = (ast: Ast, where: string, params: string[] = []) => {
    const { vars, fns } = namesOf(ast);
    for (const x of vars) if (!scope.has(x) && !params.includes(x)) errors.push(`${where}: unknown name "${x}"`);
    for (const f of fns) if (!BUILTINS[f] && !defs.fns[f]) errors.push(`${where}: unknown function "${f}"`);
  };
  for (const n of Object.keys(defs.vars)) checkNames(defs.vars[n], n);
  for (const [n, f] of Object.entries(defs.fns)) checkNames(f.body, `${n}()`, f.params);
  return { defs, errors };
}

// evaluate every definition with the given control values, in dependency order
export function evalDefs(defs: Defs, controls: Record<string, Val>): Record<string, Val> {
  const vars: Record<string, Val> = { ...controls };
  for (const n of defs.order) vars[n] = evaluate(defs.vars[n], { vars, fns: defs.fns });
  return vars;
}

export function checkExpr(src: string, scope: string[], fns: string[] = []): string | null {
  try {
    const { vars, fns: fs } = namesOf(parse(src));
    for (const x of vars) if (!scope.includes(x)) return `unknown name "${x}"`;
    for (const f of fs) if (!BUILTINS[f] && !fns.includes(f)) return `unknown function "${f}"`;
    return null;
  } catch (e) { return (e as Error).message; }
}

// fill `{expr}` holes in a text
export function fillHoles(text: string, vars: Record<string, Val>): string {
  return text.replace(/\{([^{}]+)\}/g, (_, e) => {
    const v = evaluate(parse(e), { vars });
    return Array.isArray(v) ? v.join(", ") : String(v);
  });
}
