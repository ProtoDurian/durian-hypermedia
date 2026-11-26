// The http part (format version 11): a request and, after it, its response, as text messages (what curl -v and the RFCs
// show). Pure.
//
//   ```http title="Create an order"
//   POST /v1/orders HTTP/1.1
//   Host: api.example.com
//   Authorization: Bearer <token>
//
//   { "sku": "tea", "qty": 2 }
//
//   HTTP/1.1 201 Created
//   ```
//
// A body that is not a message stays a plain code block (a warning). A secret-looking value in a sensitive header is
// refused (write a placeholder such as <token>). The body of a JSON message becomes a small tree a reader can fold.
// Everything is a hand scan: no regular expression runs over author text.
import { definePart } from "../types";
import { isSpace, type Err } from "../kit/text";
import type { Budget } from "../../core/budget";

export const HTTP_KEYS = ["id", "title", "static", "llm"];
export const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "CONNECT", "QUERY"];
export interface Header { name: string; value: string; line: number }
export interface Req { method: string; target: string; version: string; headers: Header[]; body: string; line: number }
export interface Res { version: string; status: number; reason: string; headers: Header[]; body: string; line: number }
export type JNode = { k: "obj" | "arr"; key: string | null; kids: JNode[]; n: number } | { k: "str" | "num" | "bool" | "null"; key: string | null; v: string };
export interface HttpData {
  title: string;
  req: Req | null;
  res: Res | null;
  /** "Copy as curl" for the request, or null when the host cannot be told */
  curl: string | null;
  /** a JSON body as a tree (null: not JSON, or too deep or large: it stays text) */
  reqTree: JNode | null;
  resTree: JNode | null;
  /** the body is not a message: it is drawn as a plain code block */
  plain: boolean;
  /** the text, kept only when the block is drawn plain and holds no secret */
  src: string;
  errors: Err[];
  warnings: Err[];
}
export interface Lim { httpLines: number; httpHeaders: number; httpJsonDepth: number; httpJsonNodes: number; httpChars: number }

const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
const isUpper = (c: string | undefined) => c !== undefined && c >= "A" && c <= "Z";
const isLetter = (c: string | undefined) => c !== undefined && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z"));
/** the white-space separated words of a line, at most `max` of them (one more than asked means "too many") */
function words(s: string, max: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length && out.length <= max) {
    while (i < s.length && isSpace(s[i])) i++;
    if (i >= s.length) break;
    let e = i;
    while (e < s.length && !isSpace(s[e])) e++;
    out.push(s.slice(i, e));
    i = e;
  }
  return out;
}
/** HTTP/1, HTTP/1.1, HTTP/2 */
const isVersion = (w: string) => w.startsWith("HTTP/") && isDigit(w[5]) && (w.length === 6 || (w.length === 8 && w[6] === "." && isDigit(w[7])));

/** a request line: METHOD target [HTTP/x]; null when the line is not one */
function requestLine(s: string): { method: string; target: string; version: string } | null {
  const w = words(s, 3);
  if (w.length < 2 || w.length > 3) return null;
  for (const c of w[0]) if (!isUpper(c)) return null;
  if (w.length === 3 && !isVersion(w[2])) return null;
  return METHODS.includes(w[0]) ? { method: w[0], target: w[1], version: w[2] ?? "HTTP/1.1" } : null;
}
/** a status line: HTTP/x NNN [reason]; null when the line is not one */
function statusLine(s: string): { version: string; status: number; reason: string } | null {
  if (!s.startsWith("HTTP/") || !isDigit(s[5])) return null;
  let i = 6;
  if (s[i] === "." && isDigit(s[i + 1])) i += 2;
  const vEnd = i;
  if (!isSpace(s[i])) return null;
  while (isSpace(s[i])) i++;
  if (!isDigit(s[i]) || !isDigit(s[i + 1]) || !isDigit(s[i + 2]) || (s[i + 3] !== undefined && !isSpace(s[i + 3]))) return null;
  return { version: s.slice(0, vEnd), status: +s.slice(i, i + 3), reason: s.slice(i + 3).trim() };
}
const TOKEN_PUNCT = "!#$%&'*+.^_`|~-";
/** a header line: Name: value; null when the line is not one */
function headerLine(s: string): { name: string; value: string } | null {
  let i = 0;
  while (i < s.length && (isLetter(s[i]) || isDigit(s[i]) || TOKEN_PUNCT.includes(s[i]))) i++;
  if (i === 0 || s[i] !== ":") return null;
  return { name: s.slice(0, i), value: s.slice(i + 1).trim() };
}
const firstLine = (body: string) => {
  let from = 0;
  while (from < body.length) {
    let to = body.indexOf("\n", from);
    if (to < 0) to = body.length;
    const l = body.slice(from, to).trimEnd();
    if (l.trim() !== "") return l;
    from = to + 1;
  }
  return "";
};
/** does the body start with a request line or a status line */
export function looksLikeHttp(body: string): boolean { const f = firstLine(body); return requestLine(f) !== null || statusLine(f) !== null; }

/** The class of a status: used for its colour word. */
export const statusClass = (s: number) => (s >= 500 ? "bad" : s >= 400 ? "warn" : s >= 300 ? "acc" : s >= 200 ? "good" : "muted");

// ---- secrets ----
const SENSITIVE_NAMES = ["authorization", "proxy-authorization", "cookie", "set-cookie", "x-api-key", "api-key", "apikey", "x-auth-token", "x-access-token", "x-csrf-token", "x-xsrf-token"];
const SENSITIVE_PARTS = ["token", "secret", "password", "passwd", "credential"];
const COOKIE_ATTRS = ["path", "domain", "expires", "max-age", "samesite", "secure", "httponly"];
/** a placeholder in a value: <token>, {{token}}, ${TOKEN}, $TOKEN, ..., ***, redacted, xxxx, your-key, example */
function isPlaceholder(v: string): boolean {
  const lv = v.toLowerCase();
  if (lv.includes("...") || lv.includes("***") || lv.includes("redacted") || lv.includes("xxxx") || lv.includes("example") || lv.includes("placeholder")) return true;
  for (let at = lv.indexOf("your"); at >= 0; at = lv.indexOf("your", at + 4)) {
    let i = at + 4;
    if (lv[i] === "-" || lv[i] === "_" || lv[i] === " ") i++;
    if (lv.startsWith("key", i) || lv.startsWith("token", i)) return true;
  }
  const open = v.indexOf("{{");
  if (open >= 0 && v.indexOf("}}", open + 2) >= 0) return true;
  for (let at = v.indexOf("$"); at >= 0; at = v.indexOf("$", at + 1)) { const i = v[at + 1] === "{" ? at + 2 : at + 1; if (isLetter(v[i]) || v[i] === "_") return true; }
  for (let lt = v.indexOf("<"); lt >= 0;) {
    const gt = v.indexOf(">", lt + 1);
    if (gt < 0) break;
    if (gt >= lt + 2) return true;
    lt = v.indexOf("<", gt + 1);
  }
  return false;
}
const SCHEMES = ["bearer ", "basic ", "token ", "digest ", "apikey "];
/** The headers whose value looks like a real secret: a sensitive name, not a placeholder, and a long value. */
export function secretHeaders(hs: Header[], budget?: Budget): Header[] {
  const out: Header[] = [];
  for (const h of hs) {
    budget?.charge(1 + (h.value.length >> 4));
    const n = h.name.toLowerCase();
    if (!SENSITIVE_NAMES.includes(n) && !SENSITIVE_PARTS.some((p) => n.includes(p))) continue;
    if (isPlaceholder(h.value)) continue;
    let v = h.value;
    const lv = v.toLowerCase();
    for (const s of SCHEMES) if (lv.startsWith(s)) { v = v.slice(s.length).trimStart(); break; }
    if (n === "cookie" || n === "set-cookie") {
      if (v.split(";").some((c) => { const e = c.indexOf("="); return e >= 0 && c.slice(e + 1).trim().length >= 8 && !COOKIE_ATTRS.includes(c.slice(0, e).trim().toLowerCase()); })) out.push(h);
    } else if (v.length >= 12) out.push(h);
  }
  return out;
}

// ---- Copy as curl ----
const shq = (s: string) => `'${s.split("'").join(`'\\''`)}'`;
/** `curl` for the request, or null when the host cannot be told. Correct for what a shell and curl do with it: every word
 *  single-quoted; -g when the address holds [ ] { } (curl would read them as a range); an empty header sent with "Name;";
 *  --head for HEAD; -X GET when a GET carries a body; --request-target for "OPTIONS *"; --http1.0 and --http2 when named. */
export function curlOf(r: Req): string | null {
  let url = r.target, star = false;
  if (!url.toLowerCase().startsWith("http://") && !url.toLowerCase().startsWith("https://")) {
    const host = r.headers.find((h) => h.name.toLowerCase() === "host")?.value;
    if (!host) return null;
    const local = ["localhost", "127.", "[::1]", "192.0.2.", "198.51.100.", "203.0.113."].some((p) => host.startsWith(p)) && !host.endsWith(":443");
    star = url === "*";
    url = `${local ? "http" : "https"}://${host}${star ? "" : url.startsWith("/") ? url : "/" + url}`;
  }
  const parts = ["curl"];
  if ([...url].some((c) => "[]{}".includes(c))) parts.push("-g");
  if (r.method === "HEAD") parts.push("--head");
  else if (r.method !== "GET" || (r.body && r.method === "GET")) parts.push("-X", r.method);
  if (r.version === "HTTP/1.0") parts.push("--http1.0"); else if (r.version === "HTTP/2" || r.version === "HTTP/2.0") parts.push("--http2");
  if (star) parts.push("--request-target", shq("*"));
  parts.push(shq(url));
  for (const h of r.headers) { const n = h.name.toLowerCase(); if (n !== "host" && n !== "content-length") parts.push("-H", shq(h.value === "" ? `${h.name};` : `${h.name}: ${h.value}`)); }
  if (r.body) parts.push("--data-raw", shq(r.body));
  return parts.join(" ");
}

// ---- a request the reader edits in place (a reading aid: nothing is sent) ----
export interface Param { name: string; value: string | null }
/** The address cut into what comes before "?" and its query parameters (a flag with no "=" has value null). */
export function splitTarget(target: string): { head: string; params: Param[] } {
  const at = target.indexOf("?");
  if (at < 0) return { head: target, params: [] };
  const params = target.slice(at + 1).split("&").map((kv) => { const e = kv.indexOf("="); return e < 0 ? { name: kv, value: null } : { name: kv.slice(0, e), value: kv.slice(e + 1) }; });
  return { head: target.slice(0, at), params };
}
const ENC: Record<string, string> = { " ": "%20", "&": "%26", "#": "%23", "\n": "%0A", "\r": "%0D", "\t": "%09" };
/** What a reader typed as a parameter's value, with the characters that would cut the address (space & # and line ends) escaped. */
export function encodeParam(v: string): string { let o = ""; for (const c of v) o += ENC[c] ?? c; return o; }
/** The address with some parameter values replaced (index -> typed text); untouched parameters stay exactly as written. */
export function joinTarget(head: string, params: Param[], edits: Record<number, string> = {}): string {
  if (!params.length) return head;
  return head + "?" + params.map((p, i) => (p.value === null ? p.name : `${p.name}=${i in edits ? encodeParam(edits[i]) : p.value}`)).join("&");
}
/** The request with edited parameter values and header values (index -> typed text): what the card shows and curl copies. */
export function editedReq(r: Req, qEdit: Record<number, string>, hEdit: Record<number, string>): Req {
  const { head, params } = splitTarget(r.target);
  return { ...r, target: joinTarget(head, params, qEdit), headers: r.headers.map((h, i) => (i in hEdit ? { ...h, value: hEdit[i] } : h)) };
}
/** Sections that start open: a short list of headers, a short body. A long one starts closed (one tap opens it). */
export const OPEN_HEADERS = 6, OPEN_BODY_ROWS = 10;
const rowsOf = (n: JNode): number => ("kids" in n ? (n.kids.length ? 2 + n.kids.reduce((a, k) => a + rowsOf(k), 0) : 1) : 1);
/** How many rows a body takes when drawn (the tree's rows, or the lines of the text). */
export const bodyRows = (text: string, tree: JNode | null): number => (tree ? rowsOf(tree) : text.split("\n").length);

// ---- a JSON body as a tree the reader can fold ----
/** Pretty tree of a JSON body, or null when it is not JSON (or too deep or large: it stays text). Charges a step and a value a node. */
export function jsonTree(text: string, lim: Pick<Lim, "httpJsonDepth" | "httpJsonNodes">, budget?: Budget): JNode | null {
  const t = text.trim();
  if (!t || (t[0] !== "{" && t[0] !== "[")) return null;
  // the depth is counted by hand first, so JSON.parse (native, linear) never meets a deep nest
  let depth = 0, inStr = false;
  budget?.charge(1 + (t.length >> 4));
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (c === "\\") i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") { if (++depth > lim.httpJsonDepth) return null; }
    else if (c === "}" || c === "]") depth--;
  }
  let v: unknown;
  try { v = JSON.parse(t); } catch { return null; }
  let nodes = 0;
  const walk = (x: unknown, key: string | null, d: number): JNode | null => {
    if (++nodes > lim.httpJsonNodes || d > lim.httpJsonDepth) return null;
    budget?.charge(1, 1);
    if (x === null) return { k: "null", key, v: "null" };
    if (typeof x === "string") return { k: "str", key, v: JSON.stringify(x) };
    if (typeof x === "number") return { k: "num", key, v: String(x) };
    if (typeof x === "boolean") return { k: "bool", key, v: String(x) };
    if (Array.isArray(x)) { const kids: JNode[] = []; for (const e of x) { const c = walk(e, null, d + 1); if (!c) return null; kids.push(c); } return { k: "arr", key, kids, n: kids.length }; }
    if (typeof x === "object") { const kids: JNode[] = []; for (const [kk, e] of Object.entries(x as object)) { const c = walk(e, kk, d + 1); if (!c) return null; kids.push(c); } return { k: "obj", key, kids, n: kids.length }; }
    return null;
  };
  return walk(v, null, 0);
}

const warnText = `this http block does not start with a request line ("POST /path HTTP/1.1") or a status line ("HTTP/1.1 200 OK"), so it stays a plain code block`;

export function parseHttp(body: string, baseLine: number, attrs: Record<string, string>, lim: Lim, budget?: Budget): HttpData {
  const out: HttpData = { title: attrs.title ?? "", req: null, res: null, curl: null, reqTree: null, resTree: null, plain: false, src: "", errors: [], warnings: [], };
  for (const k of Object.keys(attrs)) if (!HTTP_KEYS.includes(k)) out.errors.push({ line: baseLine - 1, msg: `unknown key "${k.slice(0, 40)}" (keys: title, static)` });
  const fail = (line: number, msg: string) => { out.errors.push({ line: baseLine + line - 1, msg }); out.plain = true; out.src = body.length <= lim.httpChars ? body : ""; return out; };
  budget?.charge(1 + (body.length >> 4));
  if (body.length > lim.httpChars) return fail(1, `a message of ${body.length} characters; the most is ${lim.httpChars}`);
  if (!looksLikeHttp(body)) { out.plain = true; out.src = body; out.warnings.push({ line: baseLine - 1, msg: warnText }); return out; }
  // the lines (the text is at most httpChars long), with the line end and the trailing blank lines taken off
  const lines = body.trimEnd().split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  if (lines.length > lim.httpLines) return fail(1, `a message of ${lines.length} lines; the most is ${lim.httpLines}`);
  budget?.charge(lines.length * 2, lines.length);
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  const readHeaders = (): Header[] | null => {
    const hs: Header[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      budget?.charge(1 + (lines[i].length >> 4), 1);
      const m = headerLine(lines[i]);
      if (!m) { fail(i + 1, `line ${i + 1} is not a header ("Name: value"): "${lines[i].slice(0, 40)}"`); return null; }
      hs.push({ name: m.name, value: m.value, line: baseLine + i });
      if (hs.length > lim.httpHeaders) { fail(i + 1, `more than ${lim.httpHeaders} headers`); return null; }
      i++;
    }
    return hs;
  };
  // a body runs to the response's status line (after a blank line) or to the end
  const readBody = (stopAtResponse: boolean): string => {
    if (i < lines.length && lines[i].trim() === "") i++;
    const start = i;
    while (i < lines.length) {
      budget?.charge(1 + (lines[i].length >> 4));
      if (stopAtResponse && (i === start || lines[i - 1].trim() === "") && statusLine(lines[i]) !== null) break;
      i++;
    }
    budget?.charge(0, 0, lines.slice(start, i).reduce((n, l) => n + l.length, 0));
    let e = i;
    while (e > start && lines[e - 1].trim() === "") e--;
    return lines.slice(start, e).join("\n");
  };
  const rq = requestLine(lines[i] ?? "");
  if (rq) {
    const at = baseLine + i; i++;
    const headers = readHeaders();
    if (!headers) return out;
    out.req = { ...rq, headers, body: readBody(true), line: at };
  }
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i < lines.length) {
    const rs = statusLine(lines[i]);
    if (!rs) return fail(i + 1, out.req ? `line ${i + 1}: after the request comes its response ("HTTP/1.1 200 OK"), found "${lines[i].slice(0, 40)}"` : `line ${i + 1} is not a request line ("POST /path HTTP/1.1") or a status line ("HTTP/1.1 200 OK")`);
    const at = baseLine + i; i++;
    const headers = readHeaders();
    if (!headers) return out;
    out.res = { ...rs, headers, body: readBody(false), line: at };
  }
  if (!out.req && !out.res) return fail(1, "no request line or status line");
  for (const h of secretHeaders([...(out.req?.headers ?? []), ...(out.res?.headers ?? [])], budget)) out.errors.push({ line: h.line, msg: `the ${h.name} header holds a real-looking secret; write a placeholder such as <token> instead` });
  if (out.errors.length) { out.src = out.errors.some((e) => e.msg.includes("real-looking secret")) ? "" : body; out.plain = true; return out; }
  if (out.req) { out.curl = curlOf(out.req); if (out.curl) budget?.charge(1, 0, out.curl.length); out.reqTree = jsonTree(out.req.body, lim, budget); }
  if (out.res) out.resTree = jsonTree(out.res.body, lim, budget);
  return out;
}

export default definePart<HttpData>({
  name: "http",
  form: "fenced",
  steps: false,
  llmKind: "as-is",
  parse: (input, ctx) => parseHttp(input.body, input.bodyLine, input.attrs, ctx.limits, ctx.budget),
  check: (d) => [...d.errors.map((e) => ({ line: e.line, message: e.msg })), ...d.warnings.map((w) => ({ line: w.line, level: "warn" as const, message: w.msg }))],
});
