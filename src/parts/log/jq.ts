// The "jq subset": our own small jq, written for Durian Hypermedia's data explorer (pass 11, helper "data").
// It runs at parse time (the author's `query=`) and in the browser (the reader's query box). jq-in-the-browser and jq
// compiled to WebAssembly were not used: their evaluators cannot be metered, so `range(1e9)` would hang a tab. Here
// every step charges a Budget (tools/budget.ts): a bad query ends with "too much work: make it smaller" and the tab stays live.
//
// What it is: queries only (it reads data, never changes it). A form or a function outside the subset is refused by name,
// "jq subset: `limit/2` is not supported", never answered wrongly. See JQ_SUBSET for the list a page shows.
//
// Supported:
//   paths and values   .  ..  .a  .a.b  ."a b"  .["a"]  .[0]  .[-1]  .[2:4]  .[]  .a[]?  expr?  literals (numbers, strings, true, false, null)
//   building           [ ... ]   { a: ., "b": 1, (expr): 2, c, $v, "x\(.y)": 3 }   string interpolation "a \(.b)"   @text @json @csv @tsv @html @uri @sh
//   operators          | , // + - * / %  == != < <= > >=  and or not  - (unary)   if/elif/else/end   try/catch   as $x |   $x
//   functions          empty error not length keys keys_unsorted values has map map_values select add add(f) any all flatten range(1-3 args, bounded)
//                      to_entries from_entries with_entries sort sort_by group_by unique unique_by min max min_by max_by reverse first last first(f) last(f) nth
//                      limit(n; f) isempty contains inside test(re) test(re; flags) startswith endswith ltrimstr rtrimstr trim ltrim rtrim ascii_downcase ascii_upcase
//                      split join tostring tonumber tojson fromjson type floor ceil round sqrt fabs abs pow log exp infinite isinfinite isnan
//                      transpose getpath recurse (as `..`) objects arrays strings numbers booleans nulls iterables scalars splits-less string tools: explode implode
// Not supported (said by name): assignment (= |= += ...), reduce, foreach, def, import, label, paths, path, del, to_stream, walk, until, while, repeat,
//   env, input, sub, gsub, match, capture, scan, splits, limit-less recursion `recurse(f)`, destructuring `as [$a]`, `?//`, `$__loc__`, `@base64d`, comments.
import { BudgetError, Budget } from "../../core/budget";
import { compileRegex, RegexError } from "./re";

export type J = null | boolean | number | string | J[] | { [k: string]: J };
export class JqError extends Error { constructor(msg: string, public value?: J) { super(msg); } }
export class JqUnsupported extends JqError {}

/** what a page shows under the query box: the forms and functions the subset has, and what it lacks */
export const JQ_SUBSET = {
  has: "paths and [] and slices, pipes, comma, select, map, map_values, keys, values, length, sort_by, group_by, unique_by, min_by, max_by, to_entries, from_entries, with_entries, add, has, contains, inside, any, all, flatten, test, startswith, endswith, split, join, first, last, nth, limit, range (bounded), if, try, //, as $x, string interpolation, @csv @tsv @json @text @html @uri @sh, array and object building, comparisons, and, or, not, arithmetic",
  lacks: "assignment (|=, =, +=), reduce, foreach, def, import, paths, path, del, walk, sub, gsub, match, capture, scan, recurse(f), until, while, repeat, env, input, destructuring, and any function not listed",
};
/** per-query work and memory of a reader's query in the browser (a host may lower them) */
import { DEFAULT_CAPS, type QueryCaps } from "./query";

// ---------------------------------------------------------------- lexer and parser
type Node =
  | { t: "id" } | { t: "rec" } | { t: "lit"; v: J } | { t: "var"; n: string }
  | { t: "idx"; base: Node; key: Node; opt: boolean } | { t: "slice"; base: Node; from: Node | null; to: Node | null; opt: boolean } | { t: "iter"; base: Node; opt: boolean }
  | { t: "str"; parts: (string | Node)[]; fmt: string | null } | { t: "fmt"; name: string }
  | { t: "arr"; e: Node | null } | { t: "obj"; ents: { k: Node; v: Node }[] }
  | { t: "neg"; e: Node } | { t: "pipe"; a: Node; b: Node } | { t: "comma"; a: Node; b: Node }
  | { t: "bin"; op: string; a: Node; b: Node } | { t: "and"; a: Node; b: Node } | { t: "or"; a: Node; b: Node } | { t: "alt"; a: Node; b: Node }
  | { t: "if"; c: Node; th: Node; el: Node | null } | { t: "try"; e: Node; h: Node | null }
  | { t: "as"; src: Node; name: string; body: Node } | { t: "call"; name: string; args: Node[] };
type Tok = { k: "num" | "str" | "id" | "field" | "var" | "fmt" | "op" | "kw" | "end"; v: any; at: number };

const KEYWORDS = new Set(["if", "then", "elif", "else", "end", "as", "and", "or", "try", "catch", "true", "false", "null", "def", "reduce", "foreach", "import", "include", "label", "__loc__"]);
const unsup = (what: string): never => { throw new JqUnsupported(`jq subset: ${what} is not supported`); };

class Parser {
  pos = 0; tok: Tok; depth = 0;
  constructor(public src: string, pos = 0, public caps: QueryCaps = DEFAULT_CAPS, public budget?: Budget) { this.pos = pos; this.tok = this.lex(); }
  err(msg: string): never { throw new JqError(`jq subset: ${msg} (at character ${(this.tok?.at ?? this.pos) + 1})`); }
  lex(): Tok {
    this.budget?.charge(1);
    const s = this.src;
    for (;;) { // blanks, and a # comment is refused by name
      while (this.pos < s.length && /\s/.test(s[this.pos])) this.pos++;
      if (s[this.pos] === "#") unsup("a `#` comment");
      break;
    }
    const at = this.pos;
    if (this.pos >= s.length) return { k: "end", v: "", at };
    const c = s[this.pos];
    let m: RegExpMatchArray | null;
    const rest = () => s.slice(this.pos);
    if ((m = rest().match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/)) && !(c === "." && !/\d/.test(s[this.pos + 1] ?? ""))) { this.pos += m[0].length; return { k: "num", v: Number(m[0]), at }; }
    if (c === '"') return { k: "str", v: this.lexString(), at };
    if (c === "." && s[this.pos + 1] === '"') { this.pos++; return { k: "field", v: { str: this.lexString() }, at }; }
    if ((m = rest().match(/^\.([A-Za-z_][A-Za-z0-9_]*)/))) { this.pos += m[0].length; return { k: "field", v: m[1], at }; }
    if ((m = rest().match(/^\$__loc__/))) return unsup("`$__loc__`");
    if ((m = rest().match(/^\$([A-Za-z_][A-Za-z0-9_]*)/))) { this.pos += m[0].length; return { k: "var", v: m[1], at }; }
    if ((m = rest().match(/^@([A-Za-z0-9_]+)/))) { this.pos += m[0].length; return { k: "fmt", v: m[1], at }; }
    if ((m = rest().match(/^[A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*/))) { this.pos += m[0].length; return { k: KEYWORDS.has(m[0]) ? "kw" : "id", v: m[0], at }; }
    for (const op of ["?//", "|=", "+=", "-=", "*=", "/=", "%=", "//=", "//", "==", "!=", "<=", ">=", "..", "?", "|", ",", ".", "[", "]", "(", ")", "{", "}", ":", ";", "=", "<", ">", "+", "-", "*", "/", "%"]) if (s.startsWith(op, this.pos)) { this.pos += op.length; return { k: "op", v: op, at }; }
    return this.err(`unexpected character "${c}"`);
  }
  // a string literal; "\(expr)" parts are parsed by a nested parser, so interpolation may hold any query
  lexString(): { parts: (string | Node)[] } {
    const s = this.src; this.pos++;
    const parts: (string | Node)[] = []; let cur = "";
    for (;;) {
      if (this.pos >= s.length) this.err("a string is never closed");
      const c = s[this.pos++];
      if (c === '"') break;
      if (c !== "\\") { cur += c; continue; }
      const e = s[this.pos++];
      if (e === "(") {
        if (cur) { parts.push(cur); cur = ""; }
        const sub = new Parser(s, this.pos, this.caps, this.budget); sub.depth = this.depth + 1;
        if (sub.depth > this.caps.maxDepth) sub.err("the query nests too deep");
        const node = sub.pipe();
        if (!(sub.tok.k === "op" && sub.tok.v === ")")) sub.err('expected ")" to close "\\("');
        this.pos = sub.pos; parts.push(node); continue;
      }
      const map: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", "/": "/", "\\": "\\", '"': '"' };
      if (e in map) cur += map[e];
      else if (e === "u") { const h = s.slice(this.pos, this.pos + 4); if (!/^[0-9a-fA-F]{4}$/.test(h)) this.err("\\u needs four hex digits"); cur += String.fromCharCode(parseInt(h, 16)); this.pos += 4; }
      else this.err(`unknown escape "\\${e}" in a string`);
    }
    if (cur || !parts.length) parts.push(cur);
    return { parts };
  }
  next() { const t = this.tok; this.tok = this.lex(); return t; }
  isOp(v: string) { return this.tok.k === "op" && this.tok.v === v; }
  isKw(v: string) { return this.tok.k === "kw" && this.tok.v === v; }
  expectOp(v: string) { if (!this.isOp(v)) this.err(`expected "${v}" but found ${this.describe()}`); this.next(); }
  expectKw(v: string) { if (!this.isKw(v)) this.err(`expected "${v}" but found ${this.describe()}`); this.next(); }
  describe() { return this.tok.k === "end" ? "the end of the query" : `"${typeof this.tok.v === "string" ? this.tok.v : this.src.slice(this.tok.at, this.pos).trim()}"`; }
  enter() { if (++this.depth > this.caps.maxDepth) this.err("the query nests too deep"); }
  leave() { this.depth--; }

  parse(): Node {
    const n = this.pipe();
    if (this.tok.k !== "end") this.err(`unexpected ${this.describe()}`);
    return n;
  }
  pipe(): Node {
    this.enter();
    let n: Node;
    if (this.isKw("def")) unsup("`def` (defining a function)");
    if (this.isKw("reduce")) unsup("`reduce`");
    if (this.isKw("foreach")) unsup("`foreach`");
    if (this.isKw("import") || this.isKw("include")) unsup("`import`");
    if (this.isKw("label")) unsup("`label`");
    const a = this.comma();
    if (this.isKw("as")) {
      this.next();
      if (this.tok.k === "op" && (this.tok.v === "[" || this.tok.v === "{")) unsup("destructuring (`as [$a, $b]` or `as {a: $x}`)");
      if (this.tok.k !== "var") this.err("expected a variable like $x after `as`");
      const name = this.tok.v as string; this.next();
      if (this.isOp("?//")) unsup("`?//` (alternative destructuring)");
      this.expectOp("|");
      n = { t: "as", src: a, name, body: this.pipe() };
    } else if (this.isOp("|")) { this.next(); n = { t: "pipe", a, b: this.pipe() }; }
    else n = a;
    this.leave();
    return n;
  }
  comma(): Node { let a = this.alt(); while (this.isOp(",")) { this.next(); a = { t: "comma", a, b: this.alt() }; } return a; }
  // `//` binds looser than `or`, and is right associative; assignment operators sit just above it and are refused
  alt(): Node {
    const a = this.or();
    if (this.isOp("//")) { this.next(); return { t: "alt", a, b: this.alt() }; }
    if (this.tok.k === "op" && ["=", "|=", "+=", "-=", "*=", "/=", "%=", "//="].includes(this.tok.v)) unsup(`assignment \`${this.tok.v}\` (a query only reads the data)`);
    return a;
  }
  or(): Node { let a = this.and(); while (this.isKw("or")) { this.next(); a = { t: "or", a, b: this.and() }; } return a; }
  and(): Node { let a = this.cmp(); while (this.isKw("and")) { this.next(); a = { t: "and", a, b: this.cmp() }; } return a; }
  cmp(): Node {
    const a = this.add();
    if (this.tok.k === "op" && ["==", "!=", "<", "<=", ">", ">="].includes(this.tok.v)) { const op = this.next().v; return { t: "bin", op, a, b: this.add() }; }
    return a;
  }
  add(): Node { let a = this.mul(); while (this.tok.k === "op" && (this.tok.v === "+" || this.tok.v === "-")) { const op = this.next().v; a = { t: "bin", op, a, b: this.mul() }; } return a; }
  mul(): Node { let a = this.unary(); while (this.tok.k === "op" && (this.tok.v === "*" || this.tok.v === "/" || this.tok.v === "%")) { const op = this.next().v; a = { t: "bin", op, a, b: this.unary() }; } return a; }
  unary(): Node { if (this.isOp("-")) { this.next(); return { t: "neg", e: this.unary() }; } return this.postfix(); }
  postfix(): Node {
    let n = this.term();
    for (;;) {
      if (this.tok.k === "field") { const f = this.next().v; n = { t: "idx", base: n, key: typeof f === "string" ? { t: "lit", v: f } : this.strNode(f.str, null), opt: false }; }
      else if (this.isOp(".") ) {
        // `.[` after a term, or `."str"`
        this.next();
        if (this.isOp("[")) { n = this.bracket(n); }
        else if (this.tok.k === "str") { const s = this.next().v; n = { t: "idx", base: n, key: this.strNode(s, null), opt: false }; }
        else this.err(`expected a name or [ after "."`);
      }
      else if (this.isOp("[")) n = this.bracket(n);
      else if (this.isOp("?")) { this.next(); n = this.optional(n); }
      else if (this.isOp("?//")) unsup("`?//` (alternative destructuring)");
      else return n;
    }
  }
  optional(n: Node): Node { if (n.t === "idx" || n.t === "slice" || n.t === "iter") return { ...n, opt: true }; return { t: "try", e: n, h: null }; }
  bracket(base: Node): Node {
    this.expectOp("[");
    if (this.isOp("]")) { this.next(); return { t: "iter", base, opt: false }; }
    if (this.isOp(":")) { this.next(); const to = this.pipe(); this.expectOp("]"); return { t: "slice", base, from: null, to, opt: false }; }
    const k = this.pipe();
    if (this.isOp(":")) { this.next(); if (this.isOp("]")) { this.next(); return { t: "slice", base, from: k, to: null, opt: false }; } const to = this.pipe(); this.expectOp("]"); return { t: "slice", base, from: k, to, opt: false }; }
    this.expectOp("]");
    return { t: "idx", base, key: k, opt: false };
  }
  strNode(s: { parts: (string | Node)[] }, fmt: string | null): Node {
    if (s.parts.length === 1 && typeof s.parts[0] === "string") return { t: "lit", v: s.parts[0] };
    return { t: "str", parts: s.parts, fmt };
  }
  term(): Node {
    const t = this.tok;
    if (t.k === "num") { this.next(); return { t: "lit", v: t.v }; }
    if (t.k === "str") { this.next(); return this.strNode(t.v, null); }
    if (t.k === "fmt") {
      this.next();
      if (!FORMATS.includes(t.v)) unsup(`the format \`@${t.v}\``);
      if (this.tok.k === "str") { const s = this.next().v; const n = this.strNode(s, t.v); return n.t === "lit" ? n : { ...n, fmt: t.v } as Node; }
      return { t: "fmt", name: t.v };
    }
    if (t.k === "field") { this.next(); return { t: "idx", base: { t: "id" }, key: typeof t.v === "string" ? { t: "lit", v: t.v } : this.strNode(t.v.str, null), opt: false }; }
    if (t.k === "var") { this.next(); if (t.v === "ENV" || t.v === "__prog_args") unsup(`\`$${t.v}\``); return { t: "var", n: t.v }; }
    if (t.k === "kw") {
      if (t.v === "true") { this.next(); return { t: "lit", v: true }; }
      if (t.v === "false") { this.next(); return { t: "lit", v: false }; }
      if (t.v === "null") { this.next(); return { t: "lit", v: null }; }
      if (t.v === "if") return this.ifExpr();
      if (t.v === "try") { this.next(); const e = this.postfixNoTry(); let h: Node | null = null; if (this.isKw("catch")) { this.next(); h = this.postfixNoTry(); } return { t: "try", e, h }; }
      if (t.v === "def") return unsup("`def` (defining a function)");
      if (t.v === "reduce") return unsup("`reduce`");
      if (t.v === "foreach") return unsup("`foreach`");
      if (t.v === "label") return unsup("`label`");
      if (t.v === "import" || t.v === "include") return unsup("`import`");
      return this.err(`unexpected "${t.v}"`);
    }
    if (t.k === "op") {
      if (t.v === "..") { this.next(); return { t: "rec" }; }
      if (t.v === ".") {
        this.next();
        if (this.isOp("[")) return this.bracket({ t: "id" });
        if (this.tok.k === "str") { const s = this.next().v; return { t: "idx", base: { t: "id" }, key: this.strNode(s, null), opt: false }; }
        return { t: "id" };
      }
      if (t.v === "(") { this.next(); const e = this.pipe(); this.expectOp(")"); return e; }
      if (t.v === "[") { this.next(); if (this.isOp("]")) { this.next(); return { t: "arr", e: null }; } const e = this.pipe(); this.expectOp("]"); return { t: "arr", e }; }
      if (t.v === "{") return this.object();
    }
    if (t.k === "id") {
      this.next();
      const args: Node[] = [];
      if (this.isOp("(")) { this.next(); args.push(this.pipe()); while (this.isOp(";")) { this.next(); args.push(this.pipe()); } this.expectOp(")"); }
      const key = `${t.v}/${args.length}`;
      if (!BUILTINS[key]) {
        if (NAMES.has(t.v)) unsup(`\`${key}\` (this function takes ${[...ARITIES[t.v]].join(" or ")} argument${ARITIES[t.v].size === 1 && [...ARITIES[t.v]][0] === 1 ? "" : "s"})`);
        unsup(`\`${key}\``);
      }
      return { t: "call", name: t.v, args };
    }
    return this.err(t.k === "end" ? "the query ends too soon" : `unexpected ${this.describe()}`);
  }
  postfixNoTry(): Node { return this.postfix(); }
  ifExpr(): Node {
    this.expectKw("if"); const c = this.pipe(); this.expectKw("then"); const th = this.pipe();
    let el: Node | null = null;
    if (this.isKw("elif")) { this.tok = { k: "kw", v: "if", at: this.tok.at }; el = this.ifExpr(); return { t: "if", c, th, el }; }
    if (this.isKw("else")) { this.next(); el = this.pipe(); }
    this.expectKw("end");
    return { t: "if", c, th, el };
  }
  object(): Node {
    this.expectOp("{");
    const ents: { k: Node; v: Node }[] = [];
    while (!this.isOp("}")) {
      let k: Node, v: Node | null = null;
      const t = this.tok;
      if (t.k === "var") { this.next(); k = { t: "lit", v: t.v }; v = { t: "var", n: t.v }; ents.push({ k, v }); }
      else {
        if (t.k === "id" || t.k === "kw") { this.next(); k = { t: "lit", v: t.v }; }
        else if (t.k === "num") { this.next(); k = { t: "lit", v: String(t.v) }; }
        else if (t.k === "str") { this.next(); k = this.strNode(t.v, null); }
        else if (t.k === "fmt") { this.next(); if (this.tok.k !== "str") this.err("a format in a key must be followed by a string"); k = this.strNode(this.next().v, t.v); if (k.t === "str") k = { ...k, fmt: t.v }; }
        else if (this.isOp("(")) { this.next(); k = this.pipe(); this.expectOp(")"); }
        else return this.err(`expected an object key but found ${this.describe()}`);
        if (this.isOp(":")) {
          this.next();
          // a value is a term, optionally with | between terms (jq's ExpD); we also take a full `//`-level expression
          v = this.alt();
          while (this.isOp("|")) { this.next(); v = { t: "pipe", a: v, b: this.alt() }; }
        } else v = { t: "idx", base: { t: "id" }, key: k, opt: false };
        ents.push({ k, v });
      }
      if (this.isOp(",")) this.next(); else if (!this.isOp("}")) this.err(`expected "," or "}" in an object but found ${this.describe()}`);
    }
    this.expectOp("}");
    return { t: "obj", ents };
  }
}

// ---------------------------------------------------------------- values
const typeOf = (v: J): string => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const order = (v: J): number => (v === null ? 0 : v === false ? 1 : v === true ? 2 : typeof v === "number" ? 3 : typeof v === "string" ? 4 : Array.isArray(v) ? 5 : 6);
const strCmp = (a: string, b: string, budget?: Budget) => { // jq compares strings by code point
  budget?.charge(a.length + b.length);
  const x = [...a], y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) { const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!; if (d) return d < 0 ? -1 : 1; }
  return x.length === y.length ? 0 : x.length < y.length ? -1 : 1;
};
export function compare(a: J, b: J, budget?: Budget): number {
  budget?.charge(1);
  const oa = order(a), ob = order(b);
  if (oa !== ob) return oa < ob ? -1 : 1;
  if (typeof a === "number") return a < (b as number) ? -1 : a > (b as number) ? 1 : 0;
  if (typeof a === "string") return strCmp(a, b as string, budget);
  if (Array.isArray(a)) { const y = b as J[]; for (let i = 0; i < Math.min(a.length, y.length); i++) { const c = compare(a[i], y[i], budget); if (c) return c; } return a.length === y.length ? 0 : a.length < y.length ? -1 : 1; }
  if (a && typeof a === "object") {
    const ka = Object.keys(a), kb = Object.keys(b as object); budget?.charge(ka.length + kb.length);
    ka.sort((x,y)=>strCmp(x,y,budget)); kb.sort((x,y)=>strCmp(x,y,budget));
    const c = compare(ka, kb, budget); if (c) return c;
    for (const k of ka) { const d = compare((a as any)[k], (b as any)[k], budget); if (d) return d; }
  }
  return 0;
}
const truthy = (v: J) => v !== null && v !== false;
const tojson = (v: J): string => JSON.stringify(v, (_, x) => (typeof x === "number" && !isFinite(x) ? null : x));
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
// the budget of the query running now, for error messages made where no context is passed (a query runs synchronously)
let meter: Budget | null = null;
/** jq's short form of a value in a message: the first characters of its JSON, made without writing the rest */
const show = (v: J): string => { const s = preview(v, 12); return s.length > 11 ? s.slice(0, 10) + "..." : s; };
function preview(v: J, max: number): string {
  let out = "";
  const put = (s: string) => { out += s; return out.length >= max; };
  const go = (x: J): boolean => {
    if (typeof x === "string") return put(JSON.stringify(x.length > max ? x.slice(0, max) : x));
    if (x === null || typeof x !== "object") return put(tojson(x));
    if (Array.isArray(x)) { if (put("[")) return true; for (let i = 0; i < x.length; i++) if ((i && put(",")) || go(x[i])) return true; return put("]"); }
    const ks = Object.keys(x); meter?.charge(ks.length);
    if (put("{")) return true;
    for (let i = 0; i < ks.length; i++) if ((i && put(",")) || go(ks[i]) || put(":") || go(x[ks[i]])) return true;
    return put("}");
  };
  go(v);
  return out;
}
/** Charge reading s and making its escaped form (`extra` more characters for each code unit, `fixed` around it), before it is made. */
function chargeEscape(c: Ctx, s: string, extra: (u: number) => number, fixed = 0): void {
  c.b.charge(1 + s.length);
  let n = s.length + fixed;
  for (let i = 0; i < s.length; i++) n += extra(s.charCodeAt(i));
  c.b.charge(0, 0, n);
}
const jsonExtra = (u: number) => (u === 34 || u === 92 || u === 8 || u === 9 || u === 10 || u === 12 || u === 13 ? 1 : u < 32 ? 5 : 0);
/** Charge tojson(v) before it is made: one step for each value and character it would write, and each character it would make.
 *  A value held in several places is paid for each time it would be written, so the charge follows the text's real size. */
function chargeJson(c: Ctx, v: J): void {
  const todo: J[] = [v];
  while (todo.length) {
    const x = todo.pop()!;
    if (typeof x === "string") { chargeEscape(c, x, jsonExtra, 2); continue; }
    if (x === null || typeof x !== "object") { c.b.charge(1, 0, typeof x === "number" && isFinite(x) ? String(x).length : 5); continue; }
    if (Array.isArray(x)) { c.b.charge(1 + x.length, 0, 1 + x.length); for (let i = x.length - 1; i >= 0; i--) todo.push(x[i]); continue; }
    const ks = Object.keys(x); c.b.charge(1 + ks.length, 0, 1 + 2 * ks.length);
    for (let i = ks.length - 1; i >= 0; i--) { todo.push(x[ks[i]]); todo.push(ks[i]); }
  }
}
const tojsonC = (c: Ctx, v: J): string => { chargeJson(c, v); return tojson(v); };
/** tostring: a string as it is, any other value as its JSON, charged before it is made */
const tostr = (c: Ctx, v: J): string => (typeof v === "string" ? v : tojsonC(c, v));

const FORMATS = ["text", "json", "csv", "tsv", "html", "uri", "sh"];
const HTML: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&#39;", '"': "&quot;" };
const htmlExtra = (u: number) => (u === 60 || u === 62 ? 3 : u === 38 || u === 39 ? 4 : u === 34 ? 5 : 0);
const URI = Array.from({ length: 256 }, (_, b) => (/[A-Za-z0-9\-_.~]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : "%" + b.toString(16).toUpperCase().padStart(2, "0")));
const shExtra = (u: number) => (u === 39 ? 3 : 0), csvExtra = (u: number) => (u === 34 ? 1 : 0), tsvExtra = (u: number) => (u === 92 || u === 9 || u === 10 || u === 13 ? 1 : 0);
function format(c: Ctx, name: string, v: J): string {
  switch (name) {
    case "text": return tostr(c, v);
    case "json": return tojsonC(c, v);
    case "html": { const s = tostr(c, v); chargeEscape(c, s, htmlExtra); return s.replace(/[<>&'"]/g, (x) => HTML[x]); }
    case "uri": {
      const s = tostr(c, v); c.b.charge(1 + s.length);
      const bytes = new TextEncoder().encode(s); let n = 0;
      for (const b of bytes) n += URI[b].length;
      c.b.charge(bytes.length, 0, n);
      const out: string[] = new Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) out[i] = URI[bytes[i]];
      return out.join("");
    }
    case "sh": {
      const q = (x: J) => { if (Array.isArray(x) || (x && typeof x === "object")) throw new JqError(`${typeOf(x)} (${show(x)}) can not be escaped for shell`); if (typeof x !== "string") return tojsonC(c, x); chargeEscape(c, x, shExtra, 2); return `'${x.replace(/'/g, `'\\''`)}'`; };
      if (!Array.isArray(v)) return q(v);
      c.b.charge(v.length, 0, v.length); return v.map(q).join(" ");
    }
    case "csv": case "tsv": {
      if (!Array.isArray(v)) throw new JqError(`${typeOf(v)} (${show(v)}) cannot be ${name}-formatted, only an array can be`);
      c.b.charge(v.length, 0, v.length);
      return v.map((x) => {
        if (x === null) return ""; if (x === true) return "true"; if (x === false) return "false";
        if (typeof x === "number") return tojsonC(c, x);
        if (typeof x === "string") { if (name === "csv") { chargeEscape(c, x, csvExtra, 2); return `"${x.replace(/"/g, '""')}"`; } chargeEscape(c, x, tsvExtra); return x.replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r"); }
        throw new JqError(`${typeOf(x)} (${show(x)}) is not valid in a csv row`);
      }).join(name === "csv" ? "," : "\t");
    }
  }
  return "";
}

// ---------------------------------------------------------------- evaluator
type Env = { v: Map<string, J> | null; up: Env | null };
interface Ctx { b: Budget; results: number; caps: QueryCaps }
/** Meter the expanded result before retaining it or handing it to a browser tree. */
function meterResult(c: Ctx, value: J): void {
  const todo: { value: J; depth: number }[] = [{ value, depth: 0 }];
  while (todo.length) {
    c.b.charge(1, 1);
    const { value: v, depth } = todo.pop()!;
    if (depth > c.caps.maxDepth) throw new JqError("the result is nested too deep; make the query smaller");
    if (typeof v === "string") c.b.charge(v.length, 0, v.length);
    else if (v && typeof v === "object") {
      const keys = Object.keys(v); c.b.charge(keys.length, keys.length);
      for (const k of keys) { c.b.charge(k.length, 0, k.length); todo.push({ value: (v as any)[k], depth: depth + 1 }); }
    }
  }
}
type Gen = Generator<J, void, undefined>;
type Fn = (c: Ctx, args: Node[], v: J, env: Env) => Gen;

const lookup = (env: Env | null, n: string): J | undefined => { for (let e = env; e; e = e.up) if (e.v!.has(n)) return e.v!.get(n); return undefined; };
const tick = (c: Ctx, n = 1, mem = 0) => c.b.charge(n, mem);

function* ev(c: Ctx, n: Node, v: J, env: Env): Gen {
  tick(c);
  switch (n.t) {
    case "id": yield v; return;
    case "lit": yield n.v; return;
    case "var": { const x = lookup(env, n.n); if (x === undefined) throw new JqError(`$${n.n} is not defined`); yield x; return; }
    case "rec": yield* recurse(c, v, 0); return;
    case "fmt": yield format(c, n.name, v); return;
    case "pipe": for (const x of ev(c, n.a, v, env)) yield* ev(c, n.b, x, env); return;
    case "comma": yield* ev(c, n.a, v, env); yield* ev(c, n.b, v, env); return;
    case "neg": for (const x of ev(c, n.e, v, env)) { if (typeof x !== "number") throw new JqError(`${typeOf(x)} (${show(x)}) cannot be negated`); yield -x; } return;
    case "bin": for (const r of ev(c, n.b, v, env)) for (const l of ev(c, n.a, v, env)) yield binop(c, n.op, l, r); return;
    case "and": for (const l of ev(c, n.a, v, env)) { if (!truthy(l)) { yield false; continue; } for (const r of ev(c, n.b, v, env)) yield truthy(r); } return;
    case "or": for (const l of ev(c, n.a, v, env)) { if (truthy(l)) { yield true; continue; } for (const r of ev(c, n.b, v, env)) yield truthy(r); } return;
    case "alt": { let any = false; try { for (const x of ev(c, n.a, v, env)) if (truthy(x)) { any = true; yield x; } } catch (e) { if (!(e instanceof JqError) || e instanceof JqUnsupported) throw e; } if (!any) yield* ev(c, n.b, v, env); return; }
    case "if": for (const cond of ev(c, n.c, v, env)) { if (truthy(cond)) yield* ev(c, n.th, v, env); else if (n.el) yield* ev(c, n.el, v, env); else yield v; } return;
    case "try": {
      try { for (const x of ev(c, n.e, v, env)) yield x; }
      catch (e) { if (!(e instanceof JqError) || e instanceof JqUnsupported) throw e; if (n.h) yield* ev(c, n.h, e.value !== undefined ? e.value : e.message, env); }
      return;
    }
    case "as": for (const x of ev(c, n.src, v, env)) yield* ev(c, n.body, v, { v: new Map([[n.name, x]]), up: env }); return;
    case "idx": {
      const run = function* (): Gen { for (const k of ev(c, n.key, v, env)) for (const b of ev(c, n.base, v, env)) yield index(b, k, c); };
      yield* guard(n.opt, run()); return;
    }
    case "slice": {
      const run = function* (): Gen {
        for (const to of n.to ? ev(c, n.to, v, env) : [null as J]) for (const from of n.from ? ev(c, n.from, v, env) : [null as J]) for (const b of ev(c, n.base, v, env)) yield slice(c, b, from, to);
      };
      yield* guard(n.opt, run()); return;
    }
    case "iter": {
      const run = function* (): Gen {
        for (const b of ev(c, n.base, v, env)) {
          if (Array.isArray(b)) { for (const x of b) { tick(c); yield x; } }
          else if (b && typeof b === "object") { for (const k of Object.keys(b)) { tick(c); yield b[k]; } }
          else throw new JqError(`Cannot iterate over ${typeOf(b)}${b === null ? "" : ` (${show(b)})`}`);
        }
      };
      yield* guard(n.opt, run()); return;
    }
    case "str": {
      // the first interpolation varies fastest, like jq
      const parts = n.parts;
      const go = function* (i: number, acc: string[]): Generator<string> {
        if (i < 0) { let len = 0; for (const s of acc) len += s.length; c.b.charge(1 + acc.length, 0, len); yield acc.join(""); return; }
        const p = parts[i];
        if (typeof p === "string") { acc[i] = p; yield* go(i - 1, acc); return; }
        for (const x of ev(c, p, v, env)) { acc[i] = n.fmt ? format(c, n.fmt, x) : tostr(c, x); yield* go(i - 1, acc); }
      };
      for (const s of go(parts.length - 1, new Array(parts.length))) { tick(c); yield s; }
      return;
    }
    case "arr": {
      const out: J[] = [];
      if (n.e) for (const x of ev(c, n.e, v, env)) { tick(c, 1, 1); out.push(x); }
      yield out; return;
    }
    case "obj": {
      // later entries are the outer loops, so the first varies fastest, like jq
      const ents = n.ents;
      const go = function* (i: number, acc: { [k: string]: J }[]): Generator<{ k: string; v: J }[]> {
        void acc;
        if (i < 0) { yield []; return; }
        for (const val of ev(c, ents[i].v, v, env)) for (const key of ev(c, ents[i].k, v, env)) {
          if (typeof key !== "string") throw new JqError(`Object keys must be strings`);
          for (const rest of go(i - 1, [])) yield [...rest, { k: key, v: val }];
        }
      };
      for (const list of go(ents.length - 1, [])) { tick(c, 1, list.length); const o: { [k: string]: J } = Object.create(null); for (const e of list) o[e.k] = e.v; yield o; }
      return;
    }
    case "call": yield* BUILTINS[`${n.name}/${n.args.length}`](c, n.args, v, env); return;
  }
}
function* guard(opt: boolean, g: Gen): Gen { if (!opt) { yield* g; return; } try { yield* g; } catch (e) { if (!(e instanceof JqError) || e instanceof JqUnsupported) throw e; } }
function* recurse(c: Ctx, v: J, depth: number): Gen {
  tick(c);
  if (depth > c.caps.maxDepth) throw new JqError("the data is nested too deep for `..`");
  yield v;
  if (Array.isArray(v)) for (const x of v) yield* recurse(c, x, depth + 1);
  else if (v && typeof v === "object") for (const k of Object.keys(v)) yield* recurse(c, v[k], depth + 1);
}
function index(b: J, k: J, c: Ctx): J {
  if (typeof k === "string") {
    if (b === null) return null;
    if (b && typeof b === "object" && !Array.isArray(b)) return own(b, k) ? b[k] : null;
    throw new JqError(`Cannot index ${typeOf(b)} with "${k}"`);
  }
  if (typeof k === "number") {
    if (b === null) return null;
    if (Array.isArray(b)) { let i = Math.floor(k); if (i < 0) i += b.length; return i >= 0 && i < b.length ? b[i] : null; }
    throw new JqError(`Cannot index ${typeOf(b)} with number`);
  }
  if (k && typeof k === "object" && !Array.isArray(k) && (b === null || Array.isArray(b))) return slice(c, b, k.start ?? null, k.end ?? null);
  throw new JqError(`Cannot index ${typeOf(b)} with ${typeOf(k)}`);
}
// a string is cut by code point (read whole, charged by its length); an array slice is charged by what it copies
function slice(c: Ctx, b: J, from: J, to: J): J {
  if (b === null) return null;
  if (typeof b !== "string" && !Array.isArray(b)) throw new JqError(`Cannot index ${typeOf(b)} with object`);
  if ((from !== null && typeof from !== "number") || (to !== null && typeof to !== "number")) throw new JqError("Start and end indices of an array slice must be numbers");
  if (typeof b === "string") c.b.charge(1 + b.length, b.length);
  const chars = typeof b === "string" ? [...b] : b;
  const len = chars.length;
  let s = from === null ? 0 : Math.floor(from), e = to === null ? len : Math.ceil(to);
  if (s < 0) s += len; if (e < 0) e += len;
  s = Math.max(0, Math.min(len, s)); e = Math.max(s, Math.min(len, e));
  if (typeof b === "string") { c.b.charge(e - s, 0, 2 * (e - s)); return (chars as string[]).slice(s, e).join(""); }
  c.b.charge(1 + e - s, e - s);
  return (chars as J[]).slice(s, e);
}
function binop(c: Ctx, op: string, a: J, b: J): J {
  switch (op) {
    case "==": return compare(a, b, c.b) === 0;
    case "!=": return compare(a, b, c.b) !== 0;
    case "<": return compare(a, b, c.b) < 0;
    case "<=": return compare(a, b, c.b) <= 0;
    case ">": return compare(a, b, c.b) > 0;
    case ">=": return compare(a, b, c.b) >= 0;
    case "+":
      if (a === null) return b; if (b === null) return a;
      if (typeof a === "number" && typeof b === "number") return a + b;
      if (typeof a === "string" && typeof b === "string") { tick(c, 1, a.length + b.length); return a + b; }
      if (Array.isArray(a) && Array.isArray(b)) { tick(c, 1 + a.length + b.length, a.length + b.length); return [...a, ...b]; }
      if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) { const n = Object.keys(a).length + Object.keys(b).length; tick(c, 1 + n, n); return { ...a, ...b }; }
      break;
    case "-":
      if (typeof a === "number" && typeof b === "number") return a - b;
      if (Array.isArray(a) && Array.isArray(b)) { tick(c, a.length * Math.max(1, b.length)); return a.filter((x) => !b.some((y) => compare(x, y, c.b) === 0)); }
      break;
    case "*":
      if (typeof a === "number" && typeof b === "number") return a * b;
      if ((typeof a === "string" && typeof b === "number") || (typeof a === "number" && typeof b === "string")) {
        const s = (typeof a === "string" ? a : b) as string, n = (typeof a === "number" ? a : b) as number;
        if (n <= 0) return null;
        const times = n < 1 ? 1 : Math.floor(n);
        tick(c, 1, s.length * times);
        return s.repeat(times);
      }
      if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) return deepMerge(c, a, b, 0);
      break;
    case "/":
      if (typeof a === "number" && typeof b === "number") { if (b === 0) throw new JqError(`${show(a)} and ${show(b)} cannot be divided because the divisor is zero`); return a / b; }
      if (typeof a === "string" && typeof b === "string") return splitStr(c, a, b);
      break;
    case "%":
      if (typeof a === "number" && typeof b === "number") { const x = Math.trunc(a), y = Math.trunc(b); if (y === 0) throw new JqError(`${show(a)} and ${show(b)} cannot be divided because the divisor is zero`); return x % y; }
      break;
  }
  const verb: Record<string, string> = { "+": "added", "-": "subtracted", "*": "multiplied", "/": "divided", "%": "divided" };
  throw new JqError(`${typeOf(a)} (${show(a)}) and ${typeOf(b)} (${show(b)}) cannot be ${verb[op]}`);
}
function deepMerge(c: Ctx, a: { [k: string]: J }, b: { [k: string]: J }, depth: number): J {
  if (depth > c.caps.maxDepth) throw new JqError("objects are nested too deep to merge");
  const keys=Object.keys(a); tick(c, keys.length, keys.length);
  const out: { [k: string]: J } = Object.assign(Object.create(null),a);
  for (const k of Object.keys(b)) { tick(c); const x = out[k], y = b[k]; out[k] = x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x) && !Array.isArray(y) ? deepMerge(c, x, y, depth + 1) : y; }
  return out;
}
function splitStr(c: Ctx, s: string, sep: string): J[] {
  tick(c, s.length, s.length);
  if (s === "") return [];
  if (sep === "") return [...s];
  return s.split(sep);
}
const need = (v: J, t: string, what: string) => { if (typeOf(v) !== t) throw new JqError(`${typeOf(v)} (${show(v)}) cannot be used with ${what}: ${t} expected`); return v; };
function keysOf(v: J, sorted = true, budget?: Budget): string[] | number[] {
  budget?.charge(v && typeof v==="object" ? Object.keys(v).length : 1);
  if (Array.isArray(v)) return v.map((_, i) => i);
  if (v && typeof v === "object") return sorted ? Object.keys(v).sort((a,b)=>strCmp(a,b,budget)) : Object.keys(v);
  throw new JqError(`${typeOf(v)} (${show(v)}) has no keys`);
}
// evaluate argument nodes to every combination (later ones outer), then call f
function* withArgs(c: Ctx, args: Node[], v: J, env: Env, f: (a: J[]) => J | undefined): Gen {
  const go = function* (i: number, acc: J[]): Generator<J[]> {
    if (i < 0) { yield [...acc]; return; }
    for (const x of ev(c, args[i], v, env)) { acc[i] = x; yield* go(i - 1, acc); }
  };
  for (const a of go(args.length - 1, new Array(args.length))) { const r = f(a); if (r !== undefined) yield r; }
}
function sortBy(c: Ctx, f: Node, v: J, env: Env): [J, J][] {
  if (!Array.isArray(v)) throw new JqError(`${typeOf(v)} (${show(v)}) cannot be sorted, as it is not an array`);
  tick(c, v.length * Math.max(1, Math.ceil(Math.log2(v.length + 1))), v.length);
  const keyed: [J, J][] = v.map((x) => [[...ev(c, f, x, env)], x] as [J, J]);
  return keyed.map((e, i) => [e[0], e[1], i] as any).sort((a: any, b: any) => compare(a[0], b[0], c.b) || a[2] - b[2]).map((e: any) => [e[0], e[1]]);
}
const arr = (v: J, what: string): J[] => { if (!Array.isArray(v)) throw new JqError(`${typeOf(v)} (${show(v)}) cannot be used with ${what}: an array is needed`); return v; };
const addAll = (c: Ctx, xs: J[]): J => { let acc: J = null; for (const x of xs) { tick(c); acc = binop(c, "+", acc, x); }; return acc; };
function flatten(c: Ctx, v: J[], depth: number, out: J[]): J[] {
  for (const x of v) { tick(c, 1, 1); if (Array.isArray(x) && depth > 0) flatten(c, x, depth - 1, out); else out.push(x); }
  return out;
}
function contains(a: J, b: J, budget?: Budget): boolean {
  budget?.charge(1);
  if (typeof a === "string" && typeof b === "string") { budget?.charge(a.length + b.length); return a.includes(b); }
  if (Array.isArray(a) && Array.isArray(b)) return b.every((y) => { budget?.charge(1); return a.some((x) => contains(x, y, budget)); });
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) { const keys=Object.keys(b); budget?.charge(keys.length); return keys.every((k) => own(a, k) && contains(a[k], (b as any)[k], budget)); }
  if (typeOf(a) === typeOf(b)) return compare(a, b, budget) === 0;
  throw new JqError(`${typeOf(a)} (${show(a)}) and ${typeOf(b)} (${show(b)}) cannot have their containment checked`);
}
/** a string function that reads its whole input and makes at most as much text: charged by the length before it runs */
const strOp = (c: Ctx, v: J, what: string, f: (s: string) => string): string => { const s = need(v, "string", what) as string; c.b.charge(1 + s.length, 0, s.length); return f(s); };
const num = (v: J, what: string): number => { if (typeof v !== "number") throw new JqError(`${typeOf(v)} (${show(v)}) number required for ${what}`); return v; };
const mathFn = (f: (x: number) => number): Fn => function* (c, _a, v) { yield f(num(v, "this math function")); };
const selector = (p: (v: J) => boolean): Fn => function* (_c, _a, v) { if (p(v)) yield v; };

const BUILTINS: Record<string, Fn> = {
  "empty/0": function* () {},
  "error/0": function* (c, _a, v) { throw new JqError(typeof v === "string" ? v : `${tojsonC(c, v)} (not a string)`, v); },
  "error/1": function* (c, a, v, env) { for (const m of ev(c, a[0], v, env)) throw new JqError(typeof m === "string" ? m : `${tojsonC(c, m)} (not a string)`, m); },
  "not/0": function* (_c, _a, v) { yield !truthy(v); },
  "length/0": function* (c, _a, v) {
    if (v === null) yield 0; else if (typeof v === "boolean") throw new JqError("boolean (" + v + ") has no length");
    else if (typeof v === "number") yield Math.abs(v); else if (typeof v === "string") { tick(c, 1 + v.length); yield [...v].length; }
    else if (Array.isArray(v)) { tick(c); yield v.length; } else { const n = Object.keys(v).length; tick(c, 1 + n); yield n; }
  },
  "keys/0": function* (c, _a, v) { yield keysOf(v,true,c.b) as J[]; },
  "keys_unsorted/0": function* (c, _a, v) { yield keysOf(v, false, c.b) as J[]; },
  "values/0": selector((v) => v !== null),
  "nulls/0": selector((v) => v === null), "booleans/0": selector((v) => typeof v === "boolean"), "numbers/0": selector((v) => typeof v === "number"),
  "strings/0": selector((v) => typeof v === "string"), "arrays/0": selector((v) => Array.isArray(v)), "objects/0": selector((v) => !!v && typeof v === "object" && !Array.isArray(v)),
  "iterables/0": selector((v) => !!v && typeof v === "object"), "scalars/0": selector((v) => !v || typeof v !== "object"),
  "has/1": function* (c, a, v, env) {
    yield* withArgs(c, a, v, env, ([k]) => {
      if (Array.isArray(v) && typeof k === "number") return k >= 0 && k < v.length;
      if (v && typeof v === "object" && !Array.isArray(v) && typeof k === "string") return own(v, k);
      throw new JqError(`Cannot check whether ${typeOf(v)} has a ${typeOf(k)} key`);
    });
  },
  "map/1": function* (c, a, v, env) {
    const out: J[] = [];
    const src = Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : (() => { throw new JqError(`Cannot iterate over ${typeOf(v)}${v === null ? "" : ` (${show(v)})`}`); })();
    for (const x of src) for (const y of ev(c, a[0], x, env)) { tick(c, 1, 1); out.push(y); }
    yield out;
  },
  "map_values/1": function* (c, a, v, env) {
    if (Array.isArray(v)) { const out: J[] = []; for (const x of v) { for (const y of ev(c, a[0], x, env)) { tick(c, 1, 1); out.push(y); break; } } yield out; }
    else if (v && typeof v === "object") { const out: { [k: string]: J } = Object.create(null); for (const k of Object.keys(v)) for (const y of ev(c, a[0], v[k], env)) { tick(c, 1, 1); out[k] = y; break; } yield out; }
    else throw new JqError(`Cannot iterate over ${typeOf(v)}${v === null ? "" : ` (${show(v)})`}`);
  },
  "select/1": function* (c, a, v, env) { for (const x of ev(c, a[0], v, env)) if (truthy(x)) yield v; },
  "recurse/0": function* (c, _a, v) { yield* recurse(c, v, 0); },
  "add/0": function* (c, _a, v) { yield addAll(c, Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : arr(v, "add")); },
  "add/1": function* (c, a, v, env) { yield addAll(c, [...ev(c, a[0], v, env)]); },
  "any/0": function* (c, _a, v) { tick(c, arr(v, "any").length); yield (v as J[]).some(truthy); },
  "all/0": function* (c, _a, v) { tick(c, arr(v, "all").length); yield (v as J[]).every(truthy); },
  "any/1": function* (c, a, v, env) { for (const x of arr(v, "any")) for (const y of ev(c, a[0], x, env)) if (truthy(y)) { yield true; return; } yield false; },
  "all/1": function* (c, a, v, env) { for (const x of arr(v, "all")) for (const y of ev(c, a[0], x, env)) if (!truthy(y)) { yield false; return; } yield true; },
  "flatten/0": function* (c, _a, v) { yield flatten(c, arr(v, "flatten"), 1e9, []); },
  "flatten/1": function* (c, a, v, env) { yield* withArgs(c, a, v, env, ([d]) => { if (typeof d !== "number" || d < 0) throw new JqError("flatten depth must not be negative"); return flatten(c, arr(v, "flatten"), d, []); }); },
  "range/1": function* (c, a, v, env) { for (const n of ev(c, a[0], v, env)) { const hi = num(n, "range"); for (let i = 0; i < hi; i++) { tick(c); yield i; } } },
  "range/2": function* (c, a, v, env) { for (const to of ev(c, a[1], v, env)) for (const from of ev(c, a[0], v, env)) { const lo = num(from, "range"), hi = num(to, "range"); for (let i = lo; i < hi; i++) { tick(c); yield i; } } },
  "range/3": function* (c, a, v, env) { for (const by of ev(c, a[2], v, env)) for (const to of ev(c, a[1], v, env)) for (const from of ev(c, a[0], v, env)) {
    const lo = num(from, "range"), hi = num(to, "range"), st = num(by, "range");
    if (st > 0) for (let i = lo; i < hi; i += st) { tick(c); yield i; } else if (st < 0) for (let i = lo; i > hi; i += st) { tick(c); yield i; } else if (lo < hi) { for (;;) { tick(c); yield lo; } } } },
  "to_entries/0": function* (c, _a, v) { const ks = keysOf(v, false, c.b); tick(c, ks.length, ks.length); yield ks.map((k) => ({ key: k, value: (v as any)[k] })); },
  "from_entries/0": function* (c, _a, v) {
    const out: { [k: string]: J } = Object.create(null);
    for (const e of arr(v, "from_entries")) {
      tick(c);
      if (!e || typeof e !== "object" || Array.isArray(e)) throw new JqError(`Cannot index ${typeOf(e)} with "key"`);
      let k: J = null; for (const name of ["key", "k", "name", "Name", "Key", "K"]) if (own(e, name) && e[name] !== null && e[name] !== false) { k = e[name]; break; }
      let val: J = null; for (const name of ["value", "v", "Value", "V"]) if (own(e, name)) { val = e[name]; break; }
      if (typeof k === "number" || typeof k === "boolean") k = tojson(k);
      if (k === null) k = "null";
      if (typeof k !== "string") throw new JqError(`Cannot use ${typeOf(k)} (${show(k)}) as object key`);
      out[k] = val;
    }
    yield out;
  },
  "with_entries/1": function* (c, a, v, env) {
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new JqError(`${typeOf(v)} (${show(v)}) has no keys`);
    const entries: J[] = [];
    for (const k of Object.keys(v)) for (const y of ev(c, a[0], { key: k, value: v[k] }, env)) { tick(c, 1, 1); entries.push(y); }
    yield* BUILTINS["from_entries/0"](c, [], entries, env);
  },
  "sort/0": function* (c, _a, v) { const x = arr(v, "sort"); tick(c, x.length * Math.max(1, Math.ceil(Math.log2(x.length + 1))), x.length); yield [...x].sort((a,b)=>compare(a,b,c.b)); },
  "sort_by/1": function* (c, a, v, env) { yield sortBy(c, a[0], v, env).map((e) => e[1]); },
  "group_by/1": function* (c, a, v, env) {
    const out: J[][] = []; let last: J = undefined as any;
    for (const [k, x] of sortBy(c, a[0], v, env)) { if (out.length && compare(k, last, c.b) === 0) out[out.length - 1].push(x); else { out.push([x]); last = k; } }
    yield out;
  },
  "unique/0": function* (c, _a, v) { const x = arr(v, "unique"); tick(c, x.length * Math.max(1, Math.ceil(Math.log2(x.length + 1))), x.length); const s = [...x].sort((a,b)=>compare(a,b,c.b)); yield s.filter((e, i) => i === 0 || compare(e, s[i - 1], c.b) !== 0); },
  "unique_by/1": function* (c, a, v, env) {
    const out: J[] = []; let last: J = undefined as any;
    for (const [k, x] of sortBy(c, a[0], v, env)) { if (!out.length || compare(k, last, c.b) !== 0) { out.push(x); last = k; } }
    yield out;
  },
  "min/0": function* (c, _a, v) { const x = arr(v, "min"); tick(c, x.length); yield x.length ? x.reduce((m, e) => (compare(e, m, c.b) < 0 ? e : m)) : null; },
  "max/0": function* (c, _a, v) { const x = arr(v, "max"); tick(c, x.length); yield x.length ? x.reduce((m, e) => (compare(e, m, c.b) >= 0 ? e : m)) : null; },
  "min_by/1": function* (c, a, v, env) { const s = sortBy(c, a[0], v, env); yield s.length ? s[0][1] : null; },
  "max_by/1": function* (c, a, v, env) { const s = sortBy(c, a[0], v, env); if (!s.length) { yield null; return; } let m = s[0]; for (const e of s) if (compare(e[0], m[0], c.b) >= 0) m = e; yield m[1]; },
  "reverse/0": function* (c, _a, v) { if (typeof v === "string") { tick(c, 1 + v.length, v.length); c.b.charge(0, 0, v.length); yield [...v].reverse().join(""); } else if (v === null) yield []; else { const n = arr(v, "reverse").length; tick(c, 1 + n, n); yield [...(v as J[])].reverse(); } },
  "first/0": function* (c, _a, v) { yield index(v, 0, c); },
  "last/0": function* (c, _a, v) { yield index(v, -1, c); },
  "first/1": function* (c, a, v, env) { for (const x of ev(c, a[0], v, env)) { yield x; return; } },
  "last/1": function* (c, a, v, env) { let any = false, l: J = null; for (const x of ev(c, a[0], v, env)) { any = true; l = x; } if (any) yield l; },
  "nth/1": function* (c, a, v, env) { for (const n of ev(c, a[0], v, env)) yield index(v, n, c); },
  "nth/2": function* (c, a, v, env) { for (const n of ev(c, a[0], v, env)) { const k = num(n, "nth"); if (k < 0) throw new JqError("Out of bounds negative array index"); let i = 0; for (const x of ev(c, a[1], v, env)) { if (i++ === k) { yield x; break; } } } },
  "limit/2": function* (c, a, v, env) { for (const n of ev(c, a[0], v, env)) { const k = num(n, "limit"); if (k <= 0) continue; let i = 0; for (const x of ev(c, a[1], v, env)) { yield x; if (++i >= k) break; } } },
  "isempty/1": function* (c, a, v, env) { for (const _ of ev(c, a[0], v, env)) { yield false; return; } yield true; },
  "contains/1": function* (c, a, v, env) { yield* withArgs(c, a, v, env, ([b]) => contains(v, b, c.b)); },
  "inside/1": function* (c, a, v, env) { yield* withArgs(c, a, v, env, ([b]) => contains(b, v, c.b)); },
  "test/1": function* (c, a, v, env) { yield* withArgs(c, a, v, env, ([re]) => testRe(c, v, re, null)); },
  "test/2": function* (c, a, v, env) { yield* withArgs(c, a, v, env, ([re, fl]) => testRe(c, v, re, fl)); },
  "startswith/1": function* (c, a, v, env) { yield* withArgs(c, a, v, env, ([s]) => { if (typeof v !== "string" || typeof s !== "string") throw new JqError("startswith() requires string inputs"); tick(c, 1 + s.length); return v.startsWith(s); }); },
  "endswith/1": function* (c, a, v, env) { yield* withArgs(c, a, v, env, ([s]) => { if (typeof v !== "string" || typeof s !== "string") throw new JqError("endswith() requires string inputs"); tick(c, 1 + s.length); return v.endsWith(s); }); },
  "ltrimstr/1": function* (c, a, v, env) { yield* withArgs(c, a, v, env, ([s]) => { if (typeof v !== "string" || typeof s !== "string") return v; c.b.charge(1 + v.length, 0, v.length); return v.startsWith(s) ? v.slice(s.length) : v; }); },
  "rtrimstr/1": function* (c, a, v, env) { yield* withArgs(c, a, v, env, ([s]) => { if (typeof v !== "string" || typeof s !== "string") return v; c.b.charge(1 + v.length, 0, v.length); return s !== "" && v.endsWith(s) ? v.slice(0, v.length - s.length) : v; }); },
  "trim/0": function* (c, _a, v) { yield strOp(c, v, "trim", (s) => s.trim()); },
  "ltrim/0": function* (c, _a, v) { yield strOp(c, v, "ltrim", (s) => s.trimStart()); },
  "rtrim/0": function* (c, _a, v) { yield strOp(c, v, "rtrim", (s) => s.trimEnd()); },
  "ascii_downcase/0": function* (c, _a, v) { yield strOp(c, v, "ascii_downcase", (s) => s.replace(/[A-Z]/g, (x) => x.toLowerCase())); },
  "ascii_upcase/0": function* (c, _a, v) { yield strOp(c, v, "ascii_upcase", (s) => s.replace(/[a-z]/g, (x) => x.toUpperCase())); },
  "explode/0": function* (c, _a, v) { const s = need(v, "string", "explode") as string; tick(c, 1 + s.length, s.length); yield [...s].map((x) => x.codePointAt(0)!); },
  "implode/0": function* (c, _a, v) { const xs = arr(v, "implode"); c.b.charge(1 + xs.length, 0, 2 * xs.length); yield xs.map((x) => String.fromCodePoint(num(x, "implode"))).join(""); },
  "split/1": function* (c, a, v, env) { yield* withArgs(c, a, v, env, ([s]) => { if (typeof v !== "string" || typeof s !== "string") throw new JqError("split input and separator must be strings"); return splitStr(c, v, s); }); },
  "join/1": function* (c, a, v, env) {
    yield* withArgs(c, a, v, env, ([sep]) => {
      const xs = arr(v, "join"); if (!xs.length) return ""; if (typeof sep !== "string") throw new JqError("join separator must be a string");
      tick(c, xs.length, xs.length);
      const parts = xs.map((x) => { if (x === null) return ""; if (typeof x === "string") return x; if (typeof x === "number" || typeof x === "boolean") return tojson(x); throw new JqError(`Cannot join with ${typeOf(x)}`); });
      let len = sep.length * (parts.length - 1); for (const p of parts) len += p.length;
      c.b.charge(len, 0, len);
      return parts.join(sep);
    });
  },
  "indices/1": function* (c, a, v, env) { yield* withArgs(c, a, v, env, ([x]) => indices(c, v, x)); },
  "index/1": function* (c, a, v, env) { yield* withArgs(c, a, v, env, ([x]) => { const r = indices(c, v, x) as J[]; return r.length ? r[0] : null; }); },
  "rindex/1": function* (c, a, v, env) { yield* withArgs(c, a, v, env, ([x]) => { const r = indices(c, v, x) as J[]; return r.length ? r[r.length - 1] : null; }); },
  "tostring/0": function* (c, _a, v) { yield tostr(c, v); },
  "tonumber/0": function* (c, _a, v) { if (typeof v === "number") yield v; else if (typeof v === "string" && (tick(c, 1 + v.length), v.trim() !== "") && isFinite(Number(v))) yield Number(v); else throw new JqError(`Cannot parse ${typeOf(v)} (${show(v)}) as a number`); },
  "tojson/0": function* (c, _a, v) { yield tojsonC(c, v); },
  "fromjson/0": function* (c, _a, v) { const s = need(v, "string", "fromjson") as string; tick(c, s.length, s.length); if (s.length > c.caps.jsonChars) throw new JqError("the text is too long for fromjson"); try { yield JSON.parse(s); } catch { throw new JqError(`${show(s)} (while parsing '${s.slice(0, 20)}') is not valid JSON`); } },
  "type/0": function* (_c, _a, v) { yield typeOf(v); },
  "floor/0": mathFn(Math.floor), "ceil/0": mathFn(Math.ceil), "round/0": mathFn((x) => (x < 0 ? -Math.round(-x) : Math.round(x))), "sqrt/0": mathFn(Math.sqrt), "fabs/0": mathFn(Math.abs), "abs/0": mathFn(Math.abs),
  "log/0": mathFn(Math.log), "exp/0": mathFn(Math.exp),
  "pow/2": function* (c, a, v, env) { yield* withArgs(c, a, v, env, ([x, y]) => Math.pow(num(x, "pow"), num(y, "pow"))); },
  "infinite/0": function* () { yield Infinity; }, "nan/0": function* () { yield NaN; },
  "isinfinite/0": function* (_c, _a, v) { yield num(v, "isinfinite") === Infinity || v === -Infinity; }, "isnan/0": function* (_c, _a, v) { yield Number.isNaN(num(v, "isnan")); },
  "transpose/0": function* (c, _a, v) { const rows = arr(v, "transpose"); tick(c, 1 + rows.length); let w = 0; for (const r of rows) w = Math.max(w, arr(r, "transpose").length); tick(c, w * rows.length, w * rows.length); yield Array.from({ length: w }, (_, i) => rows.map((r) => (i < (r as J[]).length ? (r as J[])[i] : null))); },
  "getpath/1": function* (c, a, v, env) { yield* withArgs(c, a, v, env, ([p]) => { let x: J = v; tick(c, arr(p, "getpath").length); for (const k of arr(p, "getpath")) { if (x === null) return null; x = index(x, k, c); } return x; }); },
};
const NAMES = new Set(Object.keys(BUILTINS).map((k) => k.split("/")[0]));
const ARITIES: Record<string, Set<number>> = {};
for (const k of Object.keys(BUILTINS)) { const [n, a] = k.split("/"); (ARITIES[n] ??= new Set()).add(+a); }

function indices(c: Ctx, v: J, x: J): J {
  if (v === null) return null;
  if (typeof v === "string" && typeof x === "string") {
    if (x === "") return null;
    tick(c, v.length, v.length + 1);
    const positions = new Uint32Array(v.length + 1), out: J[] = []; let count = 0, from = 0;
    for (let i=0;i<v.length;) { tick(c); positions[i]=count; const step=v.codePointAt(i)!>0xffff?2:1; if(step===2)positions[i+1]=count; i+=step; count++; positions[i]=count; }
    for (;;) { tick(c); const at = v.indexOf(x, from); if (at < 0) break; tick(c,1,1); out.push(positions[at]); from = at + 1; }
    return out;
  }
  if (Array.isArray(v)) {
    const out: J[] = [];
    tick(c, v.length, 0);
    if (Array.isArray(x)) { if (!x.length) return null; for (let i = 0; i + x.length <= v.length; i++) if (x.every((e, j) => compare(v[i + j], e, c.b) === 0)) out.push(i); }
    else v.forEach((e, i) => { if (compare(e, x, c.b) === 0) out.push(i); });
    return out;
  }
  throw new JqError(`Cannot determine indices of ${typeOf(x)} in ${typeOf(v)}`);
}
function testRe(c: Ctx, v: J, re: J, flags: J): boolean {
  if (typeof v !== "string") throw new JqError(`${typeOf(v)} (${show(v)}) cannot be matched, as it is not a string`);
  if (typeof re !== "string") throw new JqError(`${typeOf(re)} (${show(re)}) cannot be matched, as it is not a string`);
  if (flags !== null && typeof flags !== "string") throw new JqError(`${typeOf(flags)} (${show(flags)}) is not a string`);
  try { return compileRegex(re, flags ?? "", c.caps, c.b).test(v, c.b); }
  catch (e) { if (e instanceof RegexError) throw new JqError(`${e.message} in test(${show(re)})`); throw e; }
}

// ---------------------------------------------------------------- the public API
export interface Compiled { run(input: J, budget: Budget): J[] }
export function compileJq(q: string, caps: QueryCaps = DEFAULT_CAPS, compileBudget?: Budget): Compiled {
  if (q.length > caps.maxQueryChars) throw new JqError(`jq subset: the query is too long (${caps.maxQueryChars} characters at most)`);
  compileBudget?.charge(q.length, q.length * 2, q.length);
  const ast = new Parser(q, 0, caps, compileBudget).parse();
  const root = ast;
  return {
    run(input, budget) {
      const c: Ctx = { b: budget, results: 0, caps };
      const out: J[] = [];
      const before = meter; meter = budget;
      try {
        for (const x of ev(c, root, input, { v: new Map(), up: null })) {
          if (out.length >= caps.maxResults) throw new BudgetError(`${budget.name ?? "the jq query"} makes too many results; make it smaller`);
          meterResult(c, x);
          out.push(x);
        }
      } finally { meter = before; }
      return out;
    },
  };
}
/** the outcome of a query: the results, or one plain-words problem */
export type JqResult = { ok: true; results: J[] } | { ok: false; kind: "work" | "memory" | "unsupported" | "error"; message: string };
export function runJq(q: string, input: J, budget: Budget, caps: QueryCaps = DEFAULT_CAPS): JqResult {
  try { return { ok: true, results: compileJq(q, caps, budget).run(input, budget) }; }
  catch (e: any) {
    if (e instanceof BudgetError) return { ok: false, kind: "work", message: "too much work: make it smaller" };
    if (e instanceof JqUnsupported) return { ok: false, kind: "unsupported", message: e.message };
    if (e instanceof JqError) return { ok: false, kind: "error", message: e.message.startsWith("jq subset") ? e.message : `jq error: ${e.message}` };
    if (e instanceof RangeError) return { ok: false, kind: "work", message: "too much work: make it smaller" };
    throw e;
  }
}
/** a reader's query in the browser: its own small budget, so a bad one never hangs the tab */
export const runReaderQuery = (q: string, input: J, caps: QueryCaps = DEFAULT_CAPS): JqResult => runJq(q, input, new Budget({steps:caps.steps,values:caps.values,chars:caps.chars},null,null,"the explore query"),caps);
/** An author query uses the existing page share. */
export const runAuthorQuery = (q:string,input:J,budget:Budget,caps:QueryCaps=DEFAULT_CAPS):J[] => compileJq(q,caps,budget).run(input,budget);
