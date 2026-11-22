// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
import { yamlParse, chargeYaml } from "../host/yaml";
// dh-lib: the Durian Hypermedia parser and writers, shared by dh (parse and write) and doccheck (checks).
// Format version 3: plain Markdown first.
//   - a part with data is a fenced code block whose info string names it: ```terminal, ```filetree, ```editor,
//     ```codewalk, ```chart, ```mermaid, ```animation <kind>
//   - a part that holds prose is one of four containers, `:::tabs`, `:::accordion`, `:::human`, `:::llm`,
//     closed by a line `:::`; inside tabs and accordions every heading starts one tab or row
//   - steps are an attachment: a line `@step <title>` inside a fenced part (`%% @step <title>` in mermaid)
//   - `:::llm` right after a part or a `:::human` segment replaces it in the LLM view
import { createHash } from "../host/crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "../host/fs";
import { dirname, extname, join, resolve } from "../host/path";
import { spawnSync } from "../host/child_process";
import { chartControls, evalChart } from "./chart";
import { chartTable } from "./chart-llm";
import { currentBudget, BudgetError } from "./budget";
import { unmetered } from "./work";
import { compileScene, sceneLlm, KINDS as SCENE_KINDS, type Compiled } from "./scene";
import { parseTier, tierLlm } from "./tier";
import { parseAlign, alignLlm } from "./align";

// ---------- part registry ----------
// fenced: a code block with this info word. llm: how the LLM view shows it when no :::llm follows.
//   as-is  the fence and its lines, as written (only #id and title= dropped from the info string)
//   data   a chart: its data as a table; with controls, its source as it is
//   steps  an animation: its step captions as a numbered list
// container: holds Markdown and fenced parts; containers do not nest.
export interface PartDef { form: "fenced" | "container"; llm: "as-is" | "data" | "steps" | "lines" | "unwrap" | "drop" | "replace"; steps: boolean }
export const PARTS: Record<string, PartDef> = {
  terminal: { form: "fenced", llm: "as-is", steps: true },
  filetree: { form: "fenced", llm: "as-is", steps: true },
  editor: { form: "fenced", llm: "as-is", steps: true },
  codewalk: { form: "fenced", llm: "as-is", steps: true },
  mermaid: { form: "fenced", llm: "as-is", steps: true },
  chart: { form: "fenced", llm: "data", steps: false },
  animation: { form: "fenced", llm: "steps", steps: true },
  tierlist: { form: "fenced", llm: "lines", steps: false },
  alignment: { form: "fenced", llm: "data", steps: false },
  tabs: { form: "container", llm: "unwrap", steps: false },
  accordion: { form: "container", llm: "unwrap", steps: false },
  human: { form: "container", llm: "drop", steps: false },
  llm: { form: "container", llm: "replace", steps: false },
};
// other names people already use for a shell session
export const ALIASES: Record<string, string> = { console: "terminal", shellsession: "terminal" };
export const FENCED = Object.keys(PARTS).filter((k) => PARTS[k].form === "fenced");
export const CONTAINERS = Object.keys(PARTS).filter((k) => PARTS[k].form === "container");
// a fenced part whose LLM form is over this many tokens needs a :::llm after it
export const LLM_LIMIT = 400;
export const BADGES = ["new", "changed", "removed", "generated", "conflict"];
export const FOLDER_FLAGS = ["closed", "open"];
export const CALLOUTS = ["Note", "Tip", "Important", "Watch out", "Security finding"];
export const MOUSE_WORDS = ["click", "double-click", "right-click", "middle-click", "drag", "drop", "scroll", "hover", "select"];
export const TEXT_KEYS = ["label", "caption", "text", "title", "note", "name", "button"]; // translatable keys inside chart YAML
const LANG_BY_EXT: Record<string, string> = { ".rs": "rust", ".go": "go", ".ts": "ts", ".tsx": "tsx", ".js": "js", ".py": "python", ".cs": "csharp", ".yaml": "yaml", ".yml": "yaml", ".json": "json", ".md": "markdown", ".sh": "bash", ".toml": "toml" };
export const langOf = (file: string) => LANG_BY_EXT[extname(file)] ?? "text";

// ---------- types ----------
export type Attrs = Record<string, string>;
export interface MdNode { kind: "md"; text: string; line: number }
export interface TocNode { kind: "toc"; line: number; attrs: Attrs; src: string }
export interface Step { title: string; attrs: Attrs; raw: string; line: number; header: string }
export interface Item { title: string; level: number; nodes: Node[]; line: number; heading: string }
export interface PartNode {
  kind: "part"; name: string; attrs: Attrs; line: number; endLine: number; source: string; open: string;
  body: string; bodyLine: number;   // fenced: the lines inside the fence; container: the lines inside
  head: string; steps: Step[];       // fenced: text before the first @step, and the steps
  nodes: Node[]; items: Item[];      // container: its content, and (tabs, accordion) one item per heading
  llm?: PartNode;                    // a :::llm right after this part
  defs?: Defs;                       // the page's and the site's own marks and prefixes (format version 10), set by parseDoc
}
export type Node = MdNode | TocNode | PartNode;
export interface Doc { path: string; fmRaw: string; fm: any; body: Node[]; bodyText: string; bodyStart: number; defErrors?: string[] }
export interface Issue { file: string; line: number; msg: string; level: "error" | "warn" }

// ---------- parsing ----------
const FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*([^\s`{]*)(.*)$/;
const OPEN_RE = /^:::\s*([a-z][a-z0-9-]*)(.*)$/;
const CLOSE_RE = /^:::\s*$/;
const TOC_RE = /^::toc(.*)$/;
// a heading line: /^(#{2,6})\s+(.*?)\s*#*\s*$/, read in one pass (that pattern backtracks quadratically on a long line)
const WS1 = /\s/;
const LINE_END = /[\n\r\u2028\u2029]/;
function headOf(line: string): [string, string, string] | null {
  const m = /^(#{2,6})\s+/.exec(line);
  if (!m) return null;
  const rest = line.slice(m[0].length);
  // the shortest text = the longest tail that is spaces, then #s, then spaces
  let j = rest.length;
  while (j > 0 && WS1.test(rest[j - 1])) j--;
  while (j > 0 && rest[j - 1] === "#") j--;
  while (j > 0 && WS1.test(rest[j - 1])) j--;
  const text = rest.slice(0, j);
  if (LINE_END.test(text)) return null; // "." matches no line end
  return [line, m[1], text];
}

// attributes: #id, key=value, key="two words", bare words (flags; an animation's first bare word is its kind)
export function parseAttrs(s: string | undefined): { attrs: Attrs; words: string[] } {
  const attrs: Attrs = {}, words: string[] = [];
  if (!s) return { attrs, words };
  const inner = s.trim().replace(/^\{/, "").replace(/\}$/, "");
  const re = /#([\w-]+)|([\w-]+)=("([^"]*)"|'([^']*)'|[^\s}]+)|([^\s{}=]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner))) {
    if (m[1]) attrs.id = m[1];
    else if (m[2]) attrs[m[2]] = m[4] ?? m[5] ?? m[3];
    else if (m[6]) words.push(m[6]);
  }
  return { attrs, words };
}

export class ParseError extends Error { constructor(public line: number, msg: string) { super(msg); } }

function closeFence(lines: string[], from: number, end: number, ticks: string): number {
  for (let i = from + 1; i < end; i++) { const t = lines[i].trim(); if (t.startsWith(ticks[0].repeat(ticks.length)) && /^[`~]+$/.test(t) && t.length >= ticks.length) return i; }
  return -1;
}

function parseNodes(lines: string[], start: number, end: number, base: number, inContainer: string | null): Node[] {
  const out: Node[] = [];
  let buf: string[] = [];
  let bufLine = start;
  const flush = () => {
    if (buf.length && buf.some((l) => l.trim() !== "")) out.push({ kind: "md", text: buf.join("\n"), line: base + bufLine + 1 });
    buf = [];
  };
  const attachLlm = (llm: PartNode, at: number) => {
    // :::llm belongs to the part or segment right before it (blank lines between are fine)
    const prev = out[out.length - 1];
    if (!prev || prev.kind !== "part" || prev.name === "llm") throw new ParseError(base + at + 1, "a :::llm block must come right after the part or :::human segment it replaces");
    if (prev.llm) throw new ParseError(base + at + 1, `the ${prev.name} before this :::llm already has one`);
    prev.llm = llm;
  };
  for (let i = start; i < end; i++) {
    const l = lines[i];
    const f = l.match(FENCE_RE);
    if (f) {
      const close = closeFence(lines, i, end, f[2]);
      if (close < 0) throw new ParseError(base + i + 1, "a code fence is never closed");
      const word = ALIASES[f[3]] ?? f[3];
      if (PARTS[word]?.form === "fenced") {
        flush();
        out.push(fencedPart(lines, i, close, base, word, f[4]));
      } else {
        if (!buf.length) bufLine = i;
        buf.push(...lines.slice(i, close + 1));
      }
      i = close;
      bufLine = i + 1;
      continue;
    }
    const o = l.match(OPEN_RE);
    if (o) {
      const name = o[1];
      if (inContainer) throw new ParseError(base + i + 1, `:::${name} inside :::${inContainer}: containers do not nest; close the :::${inContainer} first`);
      let close = -1;
      for (let j = i + 1; j < end; j++) {
        const fj = lines[j].match(FENCE_RE);
        if (fj) { const c = closeFence(lines, j, end, fj[2]); if (c > 0) { j = c; continue; } }
        if (CLOSE_RE.test(lines[j])) { close = j; break; }
        if (OPEN_RE.test(lines[j])) throw new ParseError(base + j + 1, `:::${lines[j].match(OPEN_RE)![1]} inside :::${name}: containers do not nest; close the :::${name} first`);
      }
      if (close < 0) throw new ParseError(base + i + 1, `:::${name} is never closed (a line ::: closes it)`);
      flush();
      const p = containerPart(lines, i, close, base, name, o[2]);
      if (name === "llm") attachLlm(p, i); else out.push(p);
      i = close;
      bufLine = i + 1;
      continue;
    }
    if (CLOSE_RE.test(l)) throw new ParseError(base + i + 1, `a closing ::: with no open container`);
    const t = l.match(TOC_RE);
    if (t && !inContainer) { flush(); out.push({ kind: "toc", line: base + i + 1, attrs: parseAttrs(t[1]).attrs, src: l.trim() }); bufLine = i + 1; continue; }
    if (!buf.length) bufLine = i;
    buf.push(l);
  }
  flush();
  return out;
}

function emptyPart(name: string, attrs: Attrs, line: number, endLine: number, source: string, open: string, body: string, bodyLine: number): PartNode {
  return { kind: "part", name, attrs, line, endLine, source, open, body, bodyLine, head: "", steps: [], nodes: [], items: [] };
}

function fencedPart(lines: string[], open: number, close: number, base: number, name: string, rest: string): PartNode {
  const { attrs, words } = parseAttrs(rest);
  // an animation's first bare word: 3d or 2d is the view it opens in (format version 5); any other word was a version 3 kind
  if (name === "animation" && words.length) { if (/^[23]d$/i.test(words[0])) attrs.view = words[0].toLowerCase(); else if (words[0] === "only") attrs.only = "?"; else attrs.kind = words[0]; }
  // format version 10: ```animation 3d only: the scene has no flat form (tools/depth.ts)
  if (name === "animation" && words[1] === "only") attrs.only = attrs.view ?? "?";
  const bodyLines = lines.slice(open + 1, close);
  const p = emptyPart(name, attrs, base + open + 1, base + close + 1, lines.slice(open, close + 1).join("\n"), lines[open], bodyLines.join("\n"), base + open + 2);
  // steps: "@step title" (in mermaid "%% @step title", a mermaid comment, so the diagram still draws on any Markdown viewer)
  const stepRe = name === "mermaid" ? /^\s*%%\s*@step\b\s*(.*)$/ : /^@step\b\s*(.*)$/;
  let cur: Step | null = null;
  const head: string[] = [];
  const raw: string[] = [];
  bodyLines.forEach((l, k) => {
    const m = l.match(stepRe);
    if (m) {
      if (cur) { cur.raw = raw.join("\n"); p.steps.push(cur); raw.length = 0; }
      const { title, attrs: sa } = splitStepArg(m[1], name === "codewalk");
      cur = { title, attrs: sa, raw: "", line: base + open + 2 + k, header: l };
      return;
    }
    (cur ? raw : head).push(l);
  });
  if (cur) { (cur as Step).raw = raw.join("\n"); p.steps.push(cur); }
  p.head = head.join("\n");
  return p;
}
// a code walk step line is a code reference then key=value words; any other step line is a title
function splitStepArg(s: string, withAttrs: boolean): { title: string; attrs: Attrs } {
  if (!withAttrs) return { title: s.trim(), attrs: {} };
  const parts = s.trim().split(/\s+/);
  const title = parts[0] ?? "";
  return { title, attrs: parseAttrs(parts.slice(1).join(" ")).attrs };
}

function containerPart(lines: string[], open: number, close: number, base: number, name: string, rest: string): PartNode {
  const { attrs, words } = parseAttrs(rest);
  for (const w of words) attrs[w] = "true";
  const p = emptyPart(name, attrs, base + open + 1, base + close + 1, lines.slice(open, close + 1).join("\n"), lines[open], lines.slice(open + 1, close).join("\n"), base + open + 2);
  if (!PARTS[name]) return p; // unknown: doccheck names it
  p.nodes = parseNodes(lines, open + 1, close, base, name);
  if (name === "tabs" || name === "accordion") p.items = splitItems(lines, open + 1, close, base, name);
  return p;
}
// tabs and accordions: every heading at the highest level used inside starts one item
function splitItems(lines: string[], start: number, end: number, base: number, inName: string): Item[] {
  let level = 7;
  const heads: number[] = [];
  for (let i = start; i < end; i++) {
    const f = lines[i].match(FENCE_RE);
    if (f) { const c = closeFence(lines, i, end, f[2]); if (c > 0) { i = c; continue; } }
    const h = headOf(lines[i]);
    if (h) { level = Math.min(level, h[1].length); heads.push(i); }
  }
  const at = heads.filter((i) => headOf(lines[i])![1].length === level);
  const items: Item[] = [];
  if (at.length && lines.slice(start, at[0]).some((l) => l.trim())) throw new ParseError(base + start + 1, `text before the first heading in :::${inName}: every ${inName === "tabs" ? "tab" : "row"} starts with a heading`);
  at.forEach((h, k) => {
    const m = headOf(lines[h])!;
    items.push({ title: m[2], level, heading: lines[h], line: base + h + 1, nodes: parseNodes(lines, h + 1, at[k + 1] ?? end, base, inName) });
  });
  return items;
}

// frontMatter: false reads a leading "---" block as Markdown (a rule, then text), not as front matter
export function parseDoc(path: string, text?: string, opts: { frontMatter?: boolean; site?: { marks?: unknown; prefixes?: unknown } } = {}): Doc {
  const src = text ?? readFileSync(path, "utf8");
  const m = opts.frontMatter === false ? null : src.match(/^---\n([\s\S]*?)\n---\n/);
  const fmRaw = m ? m[1] : "";
  let fm: any = {};
  // what the front matter's aliases add beyond its text is charged to the page (parse()'s budget), as for every part
  if (m) { fm = yamlParse(fmRaw) ?? {}; chargeYaml(fm, currentBudget()); }
  const bodyText = m ? src.slice(m[0].length) : src;
  const bodyStart = m ? m[0].split("\n").length - 1 : 0;
  const lines = bodyText.split("\n");
  const body = parseNodes(lines, 0, lines.length, bodyStart, null);
  const defs = defsOf(path, fm, opts.site);
  for (const p of allParts(body)) p.defs = defs.defs;
  return { path, fmRaw, fm, body, bodyText, bodyStart, defErrors: defs.errors };
}
// every part of a page, in order, including parts inside containers and :::llm blocks
export function allParts(nodes: Node[]): PartNode[] {
  const out: PartNode[] = [];
  for (const n of nodes) if (n.kind === "part") { out.push(n, ...allParts(n.nodes)); if (n.llm) out.push(n.llm, ...allParts(n.llm.nodes)); }
  return out;
}

// ---------- inline parts ----------
// :kbd[Ctrl+K]  a key or a combination;  :kbd[Ctrl+K, Ctrl+S]  a sequence;  key names are typed words: Left, Right, Up, Down, Enter ...
// :mouse[double-click index.ts]  an action word, then what it acts on
// ":kbd[" or ":mouse[", then at least one character that is not "]", then "]": what /:kbd\[([^\]]+)\]/g matched, found in one
// pass (the regular expression read to the end of the text again for every opener without a closer)
function replaceBracketed(t: string, open: string, f: (all: string, inner: string) => string): string {
  let out = "", from = 0, close = -2;   // close: the first "]" at or after the last place looked (-1: none is left)
  for (let i = t.indexOf(open); i >= 0;) {
    const s = i + open.length;
    if (close !== -1 && close < s) close = t.indexOf("]", s);
    if (close === -1) break;
    if (close === s) { i = t.indexOf(open, i + 1); continue; }
    out += t.slice(from, i) + f(t.slice(i, close + 1), t.slice(s, close));
    from = close + 1;
    i = t.indexOf(open, from);
  }
  return from === 0 ? t : out + t.slice(from);
}
export const KEY_GLYPHS: Record<string, string> = { left: "←", right: "→", up: "↑", down: "↓", enter: "↵ Enter", return: "↵ Return", tab: "⇥ Tab", backspace: "⌫", cmd: "⌘", command: "⌘", shift: "⇧ Shift", option: "⌥", alt: "Alt", ctrl: "Ctrl", esc: "Esc", space: "Space", pageup: "PgUp", pagedown: "PgDn" };
const KEY_NAMES: Record<string, string> = { left: "Left arrow", right: "Right arrow", up: "Up arrow", down: "Down arrow" };
const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function mouseParts(inner: string): { act: string; target: string } {
  const m = inner.trim().match(/^(\S+)\s*(.*)$/);
  return { act: m?.[1] ?? inner, target: (m?.[2] ?? "").replace(/^"|"$/g, "") };
}
const chords = (k: string) => k.split(/\s*,\s*/);
const keysOf = (chord: string) => chord.split(/\+(?!$)/);
export function inlineToLlm(md: string): string {
  return mapOutsideCode(md, (t) => replaceBracketed(replaceBracketed(t, ":kbd[", (_, k: string) => chords(k).map((c) => keysOf(c).map((x) => KEY_NAMES[x.toLowerCase()] ?? x).join("+")).join(", then ")), ":mouse[", (_, inner) => inner));
}
// The mouse icon: the button the action presses is filled. A double click adds a "2", a scroll arrows by the wheel,
// a drag a move arrow, a drop a down arrow, a hover motion lines; so single and double click differ at a glance.
const MOUSE_BODY = `<path class="mb" d="M3 11a8 8 0 0 1 16 0v10a8 8 0 0 1-16 0z"/>`;
const MOUSE_L = `M3 11a8 8 0 0 1 7.2-7.96V13H3z`, MOUSE_R = `M11.8 3.04A8 8 0 0 1 19 11v2h-7.2z`;
export const MOUSE_PRESS: Record<string, { press: "l" | "r" | "w" | ""; badge: string }> = {
  click: { press: "l", badge: "" }, "double-click": { press: "l", badge: "2" }, "right-click": { press: "r", badge: "" },
  "middle-click": { press: "w", badge: "" }, scroll: { press: "w", badge: "scroll" }, drag: { press: "l", badge: "drag" },
  drop: { press: "", badge: "drop" }, hover: { press: "", badge: "hover" }, select: { press: "l", badge: "select" },
};
export function mouseSvg(act: string): string {
  const m = MOUSE_PRESS[act] ?? { press: "", badge: "" };
  const btn = (d: string, on: boolean) => `<path class="${on ? "mp" : "mo"}" d="${d}"/>`;
  const wheel = `<rect class="${m.press === "w" ? "mw mp" : "mw"}" x="9.6" y="6" width="2.8" height="5.4" rx="1.4"/>`;
  const badge = m.badge === "2" ? `<circle class="mbadge" cx="25" cy="7.5" r="6.5"/><text class="mbadge-t" x="25" y="11" text-anchor="middle">2</text>`
    : m.badge === "scroll" ? `<path class="ma" d="M25 2.5l3.5 4h-7zM25 23.5l3.5-4h-7z"/>`
    : m.badge === "drag" ? `<path class="ma" d="M21.5 18h6M25.5 15l3 3-3 3" fill="none"/>`
    : m.badge === "drop" ? `<path class="ma" d="M25 13v8M22 18l3 3 3-3" fill="none"/>`
    : m.badge === "hover" ? `<path class="ma" d="M22 5q3 2.5 0 5M25.5 3q4.5 4.5 0 9" fill="none"/>`
    : m.badge === "select" ? `<path class="ma" d="M23 14h4M25 14v9M23 23h4" fill="none"/>` : "";
  return `<svg class="dh-mouse-icon" data-act="${act}" viewBox="0 0 31 30" width="31" height="30" aria-hidden="true">${btn(MOUSE_L, m.press === "l")}${btn(MOUSE_R, m.press === "r")}${MOUSE_BODY}<line class="ml" x1="11" y1="3" x2="11" y2="13"/><line class="ml" x1="3" y1="13" x2="19" y2="13"/>${wheel}${badge}</svg>`;
}
export function inlineToHtml(md: string): string {
  return mapOutsideCode(md, (t) => replaceBracketed(replaceBracketed(t, ":kbd[", (_, k: string) => `<span class="dh-keys" aria-label="${escHtml(chords(k).map((c) => keysOf(c).map((x) => KEY_NAMES[x.toLowerCase()] ?? x).join("+")).join(", then "))}">${chords(k).map((chord) => `<span class="dh-chord">${keysOf(chord).map((key) => `<kbd>${escHtml(KEY_GLYPHS[key.toLowerCase()] ?? key)}</kbd>`).join('<span class="dh-plus">+</span>')}</span>`).join('<span class="dh-then">then</span>')}</span>`), ":mouse[", (_, inner: string) => { const { act, target } = mouseParts(inner); return `<span class="dh-mouse">${mouseSvg(act)}<span class="dh-mouse-act">${escHtml(act)}</span>${target ? ` <b>${escHtml(target)}</b>` : ""}</span>`; }));
}
/** f on the text outside code: what md.split(/(```[\s\S]*?```|`[^`\n]*`)/g) separated, found in one pass (the regular expression
 *  read to the end of the text again from every backtick of a run that had no closer). */
export function mapOutsideCode(md: string, f: (s: string) => string): string {
  let out = "", from = 0, noTriple = false;
  for (let i = md.indexOf("`"); i >= 0;) {
    let end = -1;
    if (!noTriple && md.startsWith("```", i)) { const j = md.indexOf("```", i + 3); if (j < 0) noTriple = true; else end = j + 3; }
    if (end < 0) { let k = i + 1; while (k < md.length && md.charCodeAt(k) !== 96 && md.charCodeAt(k) !== 10) k++; if (md.charCodeAt(k) === 96) end = k + 1; }
    if (end < 0) { i = md.indexOf("`", i + 1); continue; }
    out += f(md.slice(from, i)) + md.slice(i, end);
    from = end;
    i = md.indexOf("`", end);
  }
  return out + f(md.slice(from));
}
// a link to another page of the docs, "](x.dh.md)" or "](x.dh.md#a)", becomes the LLM file's "](x.md)": what
// /\]\((?![a-z]+:)([^)\s#]+)\.dh\.md(#[^)\s]*)?\)/g did, in one pass (the regular expression read the rest of a run again
// from every "](" inside it)
const SPACE = /\s/;
function llmLinks(s: string): string {
  let out = "", from = 0, runFrom = -1, runEnd = -1, fragAt = -1, fragEnd = -1;
  for (let i = s.indexOf("]("); i >= 0; i = s.indexOf("](", i + 1)) {
    const p = i + 2;
    let q = p; while (q < s.length && s.charCodeAt(q) >= 97 && s.charCodeAt(q) <= 122) q++;
    if (q > p && s.charCodeAt(q) === 58) continue;
    // the run of characters other than ")", "#" and white space from p: one end for every "](" inside the same run
    if (!(runFrom >= 0 && p >= runFrom && p <= runEnd)) { runFrom = p; runEnd = p; while (runEnd < s.length && s[runEnd] !== ")" && s[runEnd] !== "#" && !SPACE.test(s[runEnd])) runEnd++; }
    if (runEnd - p < 7 || !s.startsWith(".dh.md", runEnd - 6)) continue;
    let end = -1, frag = "";
    if (s[runEnd] === ")") end = runEnd + 1;
    else if (s[runEnd] === "#") {
      if (fragAt !== runEnd) { fragAt = runEnd; let k = runEnd + 1; while (k < s.length && s[k] !== ")" && !SPACE.test(s[k])) k++; fragEnd = s[k] === ")" ? k : -1; }
      if (fragEnd >= 0) { end = fragEnd + 1; frag = s.slice(runEnd, fragEnd); }
    }
    if (end < 0) continue;
    out += s.slice(from, p) + s.slice(p, runEnd - 6) + ".md" + frag + ")";
    from = end;
    i = end - 1;
  }
  return from === 0 ? s : out + s.slice(from);
}

// ---------- the page's and the site's own marks and prefixes (format version 10) ----------
// A page (front matter) or a site (docs/outline.yaml) may define marks for a file tree and prefixes for a terminal:
//   marks:
//     deprecated: { label: deprecated, colour: warn, means: still works, will be removed }
//   prefixes:
//     ">>>": { label: Python, colour: c4, means: a line typed at the Python prompt }
// A mark's name is lower-case letters (and hyphens); a prefix is 1 to 8 characters with no space. A page's own entry beats the site's.
export interface MarkDef { label: string; colour: string; means: string }
export interface Defs { marks: Record<string, MarkDef>; prefixes: Record<string, MarkDef> }
const MARK_COLOURS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "good", "warn", "bad"];
const MARK_KEYS = ["label", "colour", "means"];
export const MARK_NAME = /^[a-z]+(-[a-z]+)*$/;
const BUILT_IN_PREFIXES = ["$", "%", "#"];
function readDefs(raw: any, where: string, into: Defs, errors: string[]) {
  for (const kind of ["marks", "prefixes"] as const) {
    const m = raw?.[kind];
    if (m === undefined || m === null) continue;
    if (typeof m !== "object" || Array.isArray(m)) { errors.push(`${where}: ${kind} must be a list of names, each with a label and a colour (${kind}: { name: { label: ..., colour: warn } })`); continue; }
    for (const [k, v] of Object.entries<any>(m)) {
      const at = `${where}: ${kind === "marks" ? "mark" : "prefix"} "${k}"`;
      if (kind === "marks") {
        if (!MARK_NAME.test(k)) { errors.push(`${at} is not a name: use lower-case letters and hyphens, like "deprecated" or "needs-review"`); continue; }
        if (BADGES.includes(k) || FOLDER_FLAGS.includes(k)) { errors.push(`${at} is built in (built-in marks: ${[...BADGES, ...FOLDER_FLAGS].join(", ")}); pick another name`); continue; }
      } else {
        if (!k || /\s/.test(k) || k.length > 8) { errors.push(`${at} must be 1 to 8 characters with no space, like ">" or ">>>"`); continue; }
        if (BUILT_IN_PREFIXES.includes(k)) { errors.push(`${at} is built in (built-in prompts: ${BUILT_IN_PREFIXES.join(" ")}); pick another prefix`); continue; }
      }
      if (v === null || typeof v !== "object" || Array.isArray(v)) { errors.push(`${at} needs { label: ..., colour: ... }`); continue; }
      for (const key of Object.keys(v)) if (!MARK_KEYS.includes(key)) errors.push(`${at}: unknown key "${key}" (keys: ${MARK_KEYS.join(", ")})`);
      const label = v.label === undefined ? k : String(v.label).trim();
      if (!label) errors.push(`${at}: the label is empty; write the word the reader sees, or leave the label out to use "${k}"`);
      else if (/[()#\n]/.test(label) || label.length > 24) errors.push(`${at}: the label "${label}" must be at most 24 characters with no ( ) or #`);
      const colour = v.colour === undefined ? "" : String(v.colour);
      if (!colour) errors.push(`${at} needs a colour: ${MARK_COLOURS.join(", ")} (theme names, never a hex value)`);
      else if (!MARK_COLOURS.includes(colour)) errors.push(`${at}: unknown colour "${colour}"; colours are ${MARK_COLOURS.join(", ")} (theme names, never a hex value)`);
      if (v.means !== undefined && (typeof v.means !== "string" || !v.means.trim())) errors.push(`${at}: means is a short sentence, or leave it out`);
      if (label && MARK_COLOURS.includes(colour)) (into[kind] as Record<string, MarkDef>)[k] = { label, colour, means: v.means ? String(v.means).trim() : "" };
    }
  }
}
// the host's definitions (the marks and prefixes options of parse()) under the page's own (front matter)
export function defsOf(path: string, fm: any, site?: { marks?: unknown; prefixes?: unknown }): { defs: Defs; errors: string[] } {
  const defs: Defs = { marks: {}, prefixes: {} }, errors: string[] = [];
  // the package reads no files: a host-wide set arrives as the `marks` and `prefixes` options of parse()
  if (site) readDefs(site, "the host's marks and prefixes", defs, errors);
  readDefs(fm, "front matter", defs, errors);
  return { defs, errors };
}
// the defined marks a list of mark names uses, for the renderer (only what the part uses is shown)
export function usedMarks(defs: Defs | undefined, names: string[]): Record<string, MarkDef> {
  const out: Record<string, MarkDef> = {};
  for (const n of names) if (defs?.marks[n]) out[n] = defs.marks[n];
  return out;
}

// ---------- the parts' own syntaxes ----------
// filetree:  one entry per line, two spaces per level; a name ending in / is a folder;
//            (new) (changed) (removed) (generated) (conflict) are badges, (closed) starts a folder closed,
//            "# text" is a note, and a line "..." stands for entries left out.
export interface TreeRow { depth: number; name: string; folder: boolean; badges: string[]; closed: boolean; note: string; gap: boolean; path: string; line: number }
export function parseTree(text: string, base = 0, defs?: Defs): { rows: TreeRow[]; errors: { line: number; msg: string }[] } {
  const own = (f: string) => !!defs?.marks[f];
  const rows: TreeRow[] = [], errors: { line: number; msg: string }[] = [];
  const stack: string[] = [];
  text.split("\n").forEach((raw, i) => {
    if (!raw.trim()) return;
    const ind = raw.match(/^ */)![0].length;
    if (ind % 2) errors.push({ line: base + i, msg: `filetree: indent by 2 spaces per level ("${raw.trim()}")` });
    const depth = Math.floor(ind / 2);
    let t = raw.trim(), note = "";
    const n = t.match(/\s+#\s+(.*)$/) ?? t.match(/^#\s+(.*)$/);
    if (n) { note = n[1].trim(); t = t.slice(0, n.index).trim(); }
    const flags: string[] = [];
    t = t.replace(/\s*\(([a-z]+(?:-[a-z]+)*)\)/g, (_, f) => { flags.push(f); return ""; }).trim();
    if (t === "..." || t === "…") { rows.push({ depth, name: "...", folder: false, badges: [], closed: false, note, gap: true, path: `${stack.slice(0, depth).join("")}...`, line: base + i }); return; }
    for (const f of flags) if (!BADGES.includes(f) && !FOLDER_FLAGS.includes(f) && !own(f)) errors.push({ line: base + i, msg: `filetree: unknown mark "(${f})": built-in marks are ${[...BADGES, ...FOLDER_FLAGS].join(", ")}${defs && Object.keys(defs.marks).length ? `; defined here: ${Object.keys(defs.marks).join(", ")}` : ""}; to use your own, define it in the page's front matter (marks: { ${f}: { label: ${f}, colour: warn } }) or for every page with the marks option of parse()` });
    if (!t || t.startsWith("/") || t.includes("\\")) errors.push({ line: base + i, msg: `filetree: "${raw.trim()}" needs a relative name using /` });
    if (depth > stack.length) errors.push({ line: base + i, msg: `filetree: "${t}" is indented deeper than a folder above it` });
    const folder = t.endsWith("/");
    if (!folder && flags.includes("closed")) errors.push({ line: base + i, msg: `filetree: only a folder (ending in /) can be (closed)` });
    stack.length = Math.min(depth, stack.length);
    const path = stack.join("") + t;
    if (folder) stack[depth] = t;
    rows.push({ depth, name: t, folder, badges: flags.filter((f) => BADGES.includes(f) || own(f)), closed: flags.includes("closed"), note, gap: false, path, line: base + i });
  });
  return { rows, errors };
}
export function treeSteps(p: PartNode): { title: string | null; text: string; line: number }[] {
  return p.steps.length ? p.steps.map((s) => ({ title: s.title, text: s.raw, line: s.line + 1 })) : [{ title: null, text: p.head, line: p.bodyLine }];
}

// terminal: the shell-session convention every docs site uses (```console, ```shellsession):
//            a line that starts with "$ " (or "% ", or "# " for root) is a command typed at that prompt; every other line
//            is output, shown as it is, including a program's own prompts and the answers typed into them.
//            Each command starts a new step unless @step lines are used.
export const TERM_PROMPTS = ["$", "%", "#"];
export interface TermLine { k: "cmd" | "out"; text: string; prompt?: string }
export function parseTermLines(text: string, defs?: Defs): TermLine[] {
  const out: TermLine[] = [];
  // the page's own prefixes first, the longest first, then $ % #
  const own = Object.keys(defs?.prefixes ?? {}).sort((a, b) => b.length - a.length);
  for (const l of text.split("\n")) {
    if (!l.trim()) continue;
    const mine = own.find((p) => l === p || l.startsWith(p + " "));
    if (mine) { out.push({ k: "cmd", prompt: mine, text: l.slice(mine.length + 1) }); continue; }
    const m = l.match(/^([$%#])(?: (.*)|$)/);
    if (m) out.push({ k: "cmd", prompt: m[1], text: m[2] ?? "" });
    else out.push({ k: "out", text: l });
  }
  return out;
}
export function terminalSteps(p: PartNode): { title: string; lines: TermLine[] }[] {
  if (p.steps.length) return p.steps.map((s) => ({ title: s.title, lines: parseTermLines(s.raw, p.defs) }));
  const steps: { title: string; lines: TermLine[] }[] = [];
  const cur = () => steps[steps.length - 1];
  for (const l of parseTermLines(p.head, p.defs)) {
    if (!steps.length || (l.k === "cmd" && cur().lines.some((x) => x.k === "cmd"))) steps.push({ title: "", lines: [] });
    cur().lines.push(l);
  }
  return steps;
}

// code walk steps:  @step <path>#L24-L30 focus=27 mark=25,29
//   <path> is <repo>/<file> when its first segment is a pinned repo (or this repo), else a file in the part's repo=;
//   "#L39-L43" alone keeps the file of the step before.
export interface CodeRef { repo: string; file: string; lines: [number, number] | null; focus: [number, number] | null; marks: number[]; err?: string; made?: string }
// made-up files, the same in an editor and a code walk: before the first @step, "@file <path>" starts a file whose lines follow.
// Lines before the first @file are returned as "rest" (an editor reads them as repo files; a code walk allows none).
export interface MadeFile { path: string; open: boolean; text: string; line: number }
export function madeUpFiles(head: string, bodyLine: number): { files: MadeFile[]; rest: { text: string; line: number }[] } {
  const files: MadeFile[] = [], rest: { text: string; line: number }[] = [];
  let cur: MadeFile | null = null; let buf: string[] = [];
  const end = () => { if (cur) { while (buf.length && !buf[buf.length - 1].trim()) buf.pop(); cur.text = buf.join("\n"); files.push(cur); cur = null; buf = []; } };
  head.split("\n").forEach((l, i) => {
    const fm = l.match(/^@file\s+(\S+)(.*)$/);
    if (fm) { end(); cur = { path: fm[1], open: /\(open\)/.test(fm[2]), text: "", line: bodyLine + i }; return; }
    if (cur) buf.push(l); else rest.push({ text: l, line: bodyLine + i });
  });
  end();
  return { files, rest };
}
export function parseLines(s: string | undefined): [number, number] | null {
  if (!s) return null;
  const m = s.replace(/L/g, "").match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const a = +m[1], b = m[2] ? +m[2] : a;
  return a >= 1 && b >= a ? [a, b] : null;
}
export function splitRef(doc: Doc, path: string, defRepo: string | undefined): { repo: string; file: string } {
  const first = path.split("/")[0];
  const known = new Set([...Object.keys(doc.fm?.pins ?? {}), selfRepo(doc) ?? ""]);
  if (known.has(first) && path.includes("/")) return { repo: first, file: path.slice(first.length + 1) };
  return { repo: defRepo ?? "", file: path };
}
export function codewalkRefs(doc: Doc, p: PartNode): CodeRef[] {
  let repo = p.attrs.repo, file = p.attrs.file ?? "";
  const made = new Map(madeUpFiles(p.head, p.bodyLine).files.map((f) => [f.path, f.text]));
  let cur: string | undefined;
  return p.steps.map((s) => {
    const m = s.title.match(/^(\S*?)(?:#(L?\d+(?:-L?\d+)?))?$/);
    if (!m || !s.title) return { repo: repo ?? "", file, lines: null, focus: null, marks: [], err: `a code walk step needs a code reference like \`@step src/a.ts#L10-L20\`, got "${s.title}"` };
    // a made-up file (@file) wins over a repo file of the same path
    if (m[1]) { if (made.has(m[1])) { file = m[1]; cur = made.get(m[1]); } else { const r = splitRef(doc, m[1], repo); repo = r.repo; file = r.file; cur = undefined; } }
    // a made-up file may leave out the range: the whole file
    const lines = parseLines(m[2]) ?? (cur != null ? [1, Math.max(1, cur.split("\n").length)] as [number, number] : null);
    return { repo: cur != null ? "" : repo ?? "", file, lines, focus: parseLines(s.attrs.focus), marks: (s.attrs.mark ?? "").split(",").map((x) => +x.replace(/L/g, "")).filter((x) => x > 0), err: lines ? undefined : `step "${s.title}" has no line range (#L10-L20)`, made: cur };
  });
}

// ---------- code walk: animated or still (format version 7) ----------
// animate=on|off|auto on the fence (every step) or on a @step line (the move INTO that step); default auto.
// auto: a move animates only when the same code changes: the same file and a line range that shares a line with the
// step before (a function growing, shrinking or sliding). A move to another file, or to lines that do not touch the
// step before, is still: the focused lines open and marked, the rest of the file folded.
export const ANIMATE_WORDS = ["on", "off", "auto"];
export type AnimateWord = "on" | "off" | "auto";
export function codewalkAnimate(p: PartNode): { block: AnimateWord; steps: AnimateWord[]; errors: { line: number; msg: string }[] } {
  const errors: { line: number; msg: string }[] = [];
  const read = (v: string | undefined, line: number, where: string): AnimateWord => {
    if (v == null) return "auto";
    if (!ANIMATE_WORDS.includes(v)) { errors.push({ line, msg: `codewalk: animate= on ${where} must be on, off or auto, got "${v}"` }); return "auto"; }
    return v as AnimateWord;
  };
  const block = read(p.attrs.animate, p.line, "the fence");
  const steps = p.steps.map((s, k) => {
    const w = read(s.attrs.animate, s.line, `step ${k + 1}`);
    if (k === 0 && s.attrs.animate != null) errors.push({ line: s.line, msg: `codewalk: animate= on step 1 has nothing to move from; put it on a later step or on the fence` });
    return w;
  });
  return { block, steps, errors };
}
// for each step, whether the move into it is animated (step 0: false)
export function codewalkModes(p: PartNode, refs: CodeRef[]): boolean[] {
  const { block, steps } = codewalkAnimate(p);
  return refs.map((r, k) => {
    if (k === 0) return false;
    const w = p.steps[k].attrs.animate != null ? steps[k] : block;   // a step line beats the fence; its auto means the default rule
    if (w === "on") return true;
    if (w === "off") return false;
    const q = refs[k - 1];
    return !!(r.lines && q.lines && r.file === q.file && r.repo === q.repo && r.lines[0] <= q.lines[1] && q.lines[0] <= r.lines[1]);
  });
}
// the whole file a step is in (still mode folds what is outside the step's range)
export function readWhole(doc: Doc, r: CodeRef, src: string | undefined): string | null {
  const text = r.made != null ? r.made : readCode(doc, r.repo, r.file, src).text;
  if (text == null) return null;
  return text.replace(/(?<!\n)\n+$/, "");
}
// the LLM view says nothing about animation: drop animate= from the fence and the @step lines
const dropAnimate = (s: string) => s.replace(/(?<!\s)\s+animate=\S+/g, "");

// editor:  lines before any @file or @step are files of a repo, one code reference per line ("(open)" marks the one shown first);
//          "@file <path>" starts a made-up file, whose lines follow; "@step <title>" is an edit, as diff lines
//          (+ added, - removed, a space for a line kept), on the file named by a first line "@@ <path>", else the file shown.
export interface EdFileSpec { path: string; repo: string; file: string; open: boolean; line: number; made: boolean; text?: string }
export interface EditorSpec { repo: string; files: EdFileSpec[]; steps: { title: string; file: string; diff: string[]; line: number }[] }
export function editorSpec(doc: Doc, p: PartNode): EditorSpec {
  const files: EdFileSpec[] = [];
  const mu = madeUpFiles(p.head, p.bodyLine);
  for (const { text: l, line } of mu.rest) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const open = /\(open\)/.test(t);
    const path = t.replace(/\(open\)/, "").trim();
    files.push({ path, ...splitRef(doc, path, p.attrs.repo), open, line, made: false });
  }
  for (const f of mu.files) files.push({ path: f.path, repo: "", file: f.path, open: f.open, line: f.line, made: true, text: f.text });
  let shown = files.find((f) => f.open)?.path ?? files[0]?.path ?? "";
  const steps = p.steps.map((s) => {
    const lines = s.raw.split("\n");
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    const at = lines[0]?.match(/^@@\s+(\S+)/);
    if (at) { shown = at[1]; lines.shift(); }
    return { title: s.title, file: shown, diff: lines, line: s.line };
  });
  return { repo: p.attrs.repo ?? "", files, steps };
}
export function applyDiff(before: string[], diff: string[]): { after: string[]; added: number[]; removed: number[]; err?: string } {
  let at = 0; const next: string[] = []; const added: number[] = []; const removed: number[] = [];
  for (const dl of diff) {
    const tag = dl[0] ?? " ", body = dl.slice(1);
    if (tag === "+") { next.push(body); added.push(next.length); continue; }
    if (tag !== "-" && tag !== " ") return { after: before, added, removed, err: `an edit line must start with -, + or a space: "${dl.slice(0, 40)}"` };
    const k = before.indexOf(body, at);
    if (k < 0) return { after: before, added, removed, err: `line not in the file: ${body.trim().slice(0, 60)}` };
    next.push(...before.slice(at, k)); at = k + 1;
    if (tag === " ") next.push(body); else removed.push(k + 1);
  }
  next.push(...before.slice(at));
  return { after: next, added, removed };
}
// the editor's files with their text: repo files read at their pins, made-up files as written
export function editorFiles(doc: Doc, p: PartNode, src: string | undefined) {
  const e = editorSpec(doc, p);
  return { spec: e, files: e.files.map((f) => { if (f.made) return { ...f, text: f.text ?? "", commit: null as string | null, err: null as string | null }; const c = readCode(doc, f.repo, f.file, src); return { ...f, text: c.text == null ? null : c.text.replace(/\n$/, ""), commit: c.commit, err: c.err ?? null }; }) };
}

// mermaid steps: each "%% @step" line ends a step; step k draws every line up to its end (the diagram builds up)
export function mermaidSteps(p: PartNode): { title: string; src: string }[] {
  if (!p.steps.length) return [{ title: "", src: p.head }];
  const out: { title: string; src: string }[] = [];
  let acc = p.head;
  for (const s of p.steps) { acc = acc + "\n" + s.raw; out.push({ title: s.title, src: acc.replace(/(?<!\n)\n+$/, "") }); }
  return out;
}

// chart: see tools/chart.ts (pure, shared with the browser)
export { chartControls, evalChart, chartMeta, chartCheck, CHART_KINDS, CHART_KEYS, SERIES_KEYS, type ChartControl } from "./chart";
// animation: see tools/scene.ts (pure, shared with the browser)
export function animSrc(p: PartNode) {
  const info: Record<string, string> = {};
  for (const k of ["layout", "dir", "kind", "view", "size", "fill", "pace", "only", "labels"]) if (p.attrs[k]) info[k] = p.attrs[k];
  return { head: p.head, steps: p.steps.map((s) => ({ title: s.title, raw: s.raw, line: s.line })), base: p.bodyLine, info };
}
// one compile per part: the page, its JSON, its LLM view and its checks share it (a part over its work budget keeps
// the BudgetError and throws it again, without compiling again)
const compiled = new WeakMap<PartNode, Compiled | { over: BudgetError }>();
export function animOf(p: PartNode): Compiled {
  const hit = compiled.get(p);
  if (hit) { if ("over" in hit) throw hit.over; return hit; }
  const s = animSrc(p);
  try { const c = compileScene(s.head, s.steps, s.base, s.info); compiled.set(p, c); return c; }
  catch (e) { if (e instanceof BudgetError) compiled.set(p, { over: e }); throw e; }
}
export { SCENE_KINDS };

// ---------- LLM view ----------
const tok = (s: string) => Math.round(s.length / 4);
const DISPLAY_ATTRS = ["id", "title"];
// the info string an LLM needs: the part name, its kind and the attributes that change meaning (repo=)
function llmOpen(p: PartNode): string {
  const fence = p.open.match(FENCE_RE)![2];
  const keep = Object.entries(p.attrs).filter(([k]) => !DISPLAY_ATTRS.includes(k) && k !== "kind").map(([k, v]) => `${k}=${/\s/.test(v) ? `"${v}"` : v}`);
  return [fence + p.open.match(FENCE_RE)![3], p.attrs.kind ?? "", ...keep].filter(Boolean).join(" ");
}
// a file tree with marks of its own reads them as their labels; a terminal with prompts of its own lists them under it
function ownAsIs(p: PartNode): string | null {
  const defs = p.defs!;
  const fence = p.open.match(FENCE_RE)![2];
  if (p.name === "filetree") {
    const used = Object.keys(defs.marks);
    if (!used.length) return null;
    let hit = false;
    const body = p.body.replace(/\(([a-z]+(?:-[a-z]+)*)\)/g, (all, k) => { if (!defs.marks[k]) return all; hit = true; return `(${defs.marks[k].label})`; });
    return hit ? `${llmOpen(p)}\n${body.replace(/(?<!\n)\n+$/, "")}\n${fence}` : null;
  }
  const used = Object.keys(defs.prefixes).filter((k) => terminalSteps(p).some((st) => st.lines.some((l) => l.prompt === k)));
  if (!used.length) return null;
  const note = used.map((k) => `${k} is ${defs.prefixes[k].label}${defs.prefixes[k].means ? ` (${defs.prefixes[k].means})` : ""}`).join("; ");
  return `${llmOpen(p)}\n${p.body.replace(/(?<!\n)\n+$/, "")}\n${fence}\n\nPrompts: ${note}.`;
}
// what an LLM reads in place of a part, without a :::llm block
export function llmFormOf(p: PartNode, publicView: boolean): string {
  const def = PARTS[p.name];
  if (!def) return "";
  switch (def.llm) {
    case "as-is": if (p.defs && (p.name === "filetree" || p.name === "terminal")) { const t = ownAsIs(p); if (t) return t; } { const fence = p.open.match(FENCE_RE)![2]; const text = `${llmOpen(p)}\n${p.body.replace(/(?<!\n)\n+$/, "")}\n${fence}`; return p.name === "codewalk" ? text.split("\n").map((l, i) => (i === 0 || /^@step\b/.test(l) ? dropAnimate(l) : l)).join("\n") : text; }
    case "data": return p.name === "alignment" ? alignLlm(parseAlign(p.body, p.bodyLine, p.attrs.title ?? "")) : chartLlm(p);
    case "lines": return tierLlm(parseTier(p.body, p.bodyLine, p.attrs.title ?? ""));
    case "steps": return animLlm(p);
    case "unwrap": return p.items.map((it) => `${it.heading.trim()}\n\n${llmOfNodes(it.nodes, publicView)}`).join("\n\n");
    default: return "";
  }
}
// the LLM view of a chart: its data as a table; a chart with controls or formulas goes as its source
function chartLlm(p: PartNode): string {
  const d = chartYaml(p);
  if (!d || d.controls || d.let) return `${llmOpen(p)}\n${p.body.replace(/(?<!\n)\n+$/, "")}\n\`\`\``;
  return chartTable(d, chartInitial(p, d)) ?? `${llmOpen(p)}\n${p.body.replace(/(?<!\n)\n+$/, "")}\n\`\`\``; // tools/chart-llm.ts
}
// the LLM view of an animation: the entities it starts with, short, then its step captions as a numbered list
// (made once per compile; it plays the story again, which the compile already paid for: not charged twice)
const llmText = new WeakMap<Compiled, string>();
function animLlm(p: PartNode): string { const c = animOf(p); let t = llmText.get(c); if (t == null) { t = unmetered(() => sceneLlm(c)); llmText.set(c, t); } return t; }
function llmOfNodes(nodes: Node[], publicView: boolean): string {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.kind === "md") out.push(llmOfMd(n.text, publicView));
    else if (n.kind === "toc") continue;
    else out.push(llmOfPart(n, publicView));
  }
  return out.filter((s) => s.trim() !== "").join("\n\n");
}
function llmOfMd(md: string, publicView: boolean): string {
  let t = mapOutsideCode(inlineToLlm(md), llmLinks);
  if (publicView) t = dropSecurityBlocks(t);
  return t.replace(/^\n+|(?<!\n)\n+$/g, "");
}
// a short note (a code walk step): escaped, then keys, mouse actions, `code` and **bold** (format version 8)
export function noteHtml(raw: string): string {
  return mapOutsideCode(inlineToHtml(escHtml(raw)), (t) => t.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")).replace(/`([^`\n]+)`/g, "<code>$1</code>");
}
export function dropSecurityBlocks(t: string): string {
  const lines = t.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^>\s*\*\*Security finding:\*\*/.test(lines[i])) { while (i + 1 < lines.length && lines[i + 1].startsWith(">")) i++; continue; }
    out.push(lines[i]);
  }
  return out.join("\n");
}
export function llmOfPart(p: PartNode, publicView: boolean): string {
  if (p.llm) return llmOfNodes(p.llm.nodes, publicView);
  if (p.attrs.llm === "none") return "";
  return llmFormOf(p, publicView);
}
// how the LLM view shows a part: "text" (a :::llm block), "none", or the part's own rule
export function llmKindOf(p: PartNode): "text" | "none" | PartDef["llm"] {
  if (p.llm) return "text";
  if (p.attrs.llm === "none" || p.name === "human") return "none";
  return PARTS[p.name]?.llm ?? "none";
}
const LLM_FM_KEYS = ["title", "concept", "description", "namespaces", "type", "pins", "marks", "prefixes"];
export function llmView(doc: Doc, sourceRel: string, publicView = false): string {
  const fm = keepTopKeys(doc.fmRaw, LLM_FM_KEYS);
  const body = llmOfNodes(doc.body, publicView).replace(/\n{3,}/g, "\n\n");
  return `---\n${fm}\nsource: ${sourceRel}\n---\n<!-- Made by dh llm from the source; nobody edits this file. -->\n\n${body}\n`;
}
function keepTopKeys(raw: string, keys: string[]): string {
  const out: string[] = [];
  let keep = false;
  for (const l of raw.split("\n")) {
    const m = l.match(/^([A-Za-z][\w-]*):/);
    if (m) keep = keys.includes(m[1]);
    if (keep) out.push(l);
  }
  return out.join("\n");
}

// ---------- human text (what a person reads on the rich page) ----------
export function humanText(doc: Doc, src?: string): string {
  const out: string[] = [];
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.kind === "md") out.push(inlineToLlm(n.text));
      else if (n.kind === "part") {
        if (n.name === "llm") continue;
        if (n.name === "animation") out.push(...animOf(n).scene.texts);
        else if (n.name === "chart") out.push(yamlTexts(chartYaml(n)).join("\n"));
        else if (n.name === "codewalk") { out.push(...n.steps.map((s) => s.raw)); if (src) codewalkRefs(doc, n).forEach((r) => { const t = readRange(doc, r, src); if (t.text) out.push(t.text); }); }
        else if (PARTS[n.name]?.form === "fenced") out.push(n.body);
        else walk(n.nodes);
      }
    }
  };
  walk(doc.body);
  return out.join("\n\n");
}
export function safeYaml(raw: string): any { try { return yamlParse(raw); } catch { return null; } }
export function yamlTexts(v: any, key = ""): string[] {
  if (v == null) return [];
  if (typeof v === "string") return TEXT_KEYS.includes(key) ? [v] : [];
  if (Array.isArray(v)) return v.flatMap((x) => yamlTexts(x, key));
  if (typeof v === "object") return Object.entries(v).flatMap(([k, x]) => yamlTexts(x, k));
  return [];
}

// ---------- code access ----------
const fileCache = new Map<string, string | null>();
export function readAtPin(src: string, repo: string, pin: string, file: string): string | null {
  const k = `${repo}@${pin}:${file}`;
  if (fileCache.has(k)) return fileCache.get(k)!;
  const r = spawnSync("git", ["-C", join(src, repo), "show", `${pin}:${file}`], { encoding: "utf8", maxBuffer: 64 << 20 });
  const v = r.status === 0 ? r.stdout : null;
  fileCache.set(k, v);
  return v;
}
// this repo's name: docs/outline.yaml `repoName`, else the last part of the origin remote
export function selfRepo(doc: Doc): string | null {
  const root = rootOf(doc.path);
  if (!root) return null;
  const op = join(root, "docs", "outline.yaml");
  if (existsSync(op)) { const n = safeYaml(readFileSync(op, "utf8"))?.repoName; if (n) return String(n); }
  const r = spawnSync("git", ["-C", root, "remote", "get-url", "origin"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim().split("/").pop()!.replace(/\.git$/, "") : null;
}
export function readCode(doc: Doc, repo: string, file: string, src: string | undefined): { text: string | null; commit: string | null; err?: string } {
  const pin = doc.fm?.pins?.[repo];
  if (pin) {
    if (!src) return { text: null, commit: pin };
    const t = readAtPin(src, repo, pin, file);
    return t == null ? { text: null, commit: pin, err: `file ${repo}/${file} does not exist at pin ${pin.slice(0, 8)}` } : { text: t, commit: pin };
  }
  if (repo && repo === selfRepo(doc)) {
    const f = join(rootOf(doc.path), file);
    return existsSync(f) ? { text: readFileSync(f, "utf8"), commit: null } : { text: null, commit: null, err: `file ${repo}/${file} does not exist in this repo` };
  }
  return { text: null, commit: null, err: repo ? `no pins entry for repo ${repo}` : "no repo: give the part repo=<repo>, start the path with a pinned repo, or make the file up with @file" };
}
export function readRange(doc: Doc, r: CodeRef, src: string | undefined) {
  const c = r.made != null ? { text: r.made, commit: null, err: undefined } : readCode(doc, r.repo, r.file, src);
  let text: string | null = null, err = r.err ?? c.err ?? null, total = 0;
  if (!err && c.text != null && r.lines) {
    const all = c.text.split("\n");
    if (all[all.length - 1] === "") all.pop();
    total = all.length;
    if (r.lines[1] > all.length) err = `lines ${r.lines.join("-")} run past the end of ${r.file} (${all.length} lines)`;
    else text = all.slice(r.lines[0] - 1, r.lines[1]).join("\n");
  }
  if (!err && r.focus && r.lines && (r.focus[0] < r.lines[0] || r.focus[1] > r.lines[1])) err = `focus ${r.focus.join("-")} is outside lines ${r.lines.join("-")}`;
  if (!err && r.lines) for (const m of r.marks) if (m < r.lines[0] || m > r.lines[1]) err = `mark ${m} is outside lines ${r.lines.join("-")}`;
  return { text, err, total, commit: c.commit, lang: langOf(r.file) };
}
export function checkCodeRef(doc: Doc, ref: string, src: string | undefined): string | null {
  const [path, sym] = ref.split("#");
  const repo = path.split("/")[0];
  const file = path.slice(repo.length + 1);
  const pin = doc.fm?.pins?.[repo];
  const self = selfRepo(doc);
  if (!pin && repo !== self) return `code reference ${ref}: no pins entry for repo ${repo}`;
  if (!src && pin) return null;
  const c = readCode(doc, repo, file, src);
  if (c.text == null) return `code reference ${ref}: ${c.err ?? "file not found"}`;
  const content = c.text;
  if (sym) {
    const segs = sym.split(/::|\./).filter(Boolean);
    for (const seg of segs) if (!new RegExp(`\\b${seg.replace(/[^\w]/g, "\\$&")}\\b`).test(content)) return `code reference ${ref}: symbol "${seg}" is not defined in ${file}`;
    const last = segs[segs.length - 1];
    const def = new RegExp(`(fn|func|def|class|struct|enum|trait|impl|interface|type|const|let|var|async|private|public|protected|static|readonly)\\s+[^\\n]*\\b${last}\\b|\\b${last}\\s*\\(|\\b${last}\\s*[:=]`);
    if (!def.test(content)) return `code reference ${ref}: "${last}" appears in ${file} but not as a definition`;
  }
  return null;
}
export function mapCodeRefs(t: string): string[] { return [...t.matchAll(/\]\(code:([^)\s]+)\)/g)].map((m) => m[1]); }

// ---------- translations ----------
export function sectionsOf(bodyText: string): string[] {
  const out: string[] = []; let cur: string[] = []; let fence: string | null = null;
  for (const l of bodyText.split("\n")) {
    const f = l.match(FENCE_RE);
    if (f) { if (!fence) fence = f[2]; else if (l.trim().startsWith(fence[0].repeat(3)) && /^[`~]+$/.test(l.trim())) fence = null; }
    if (!fence && /^## /.test(l)) { out.push(cur.join("\n")); cur = []; }
    cur.push(l);
  }
  out.push(cur.join("\n"));
  return out;
}
export const h10 = (s: string) => createHash("sha256").update(s.trim()).digest("hex").slice(0, 10);
// what a translation must keep from its source: parts, attributes, data, code and code references; texts may change
export function structureOf(doc: Doc) {
  const parts: string[] = []; const codes: string[] = []; const inline: string[] = []; const refs: string[] = [];
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.kind === "md") {
        for (const m of n.text.matchAll(/```[\s\S]*?```/g)) codes.push(m[0]);
        for (const m of n.text.replace(/```[\s\S]*?```/g, "").matchAll(/`[^`\n]+`/g)) inline.push(m[0]);
        refs.push(...mapCodeRefs(n.text));
      } else if (n.kind === "part") {
        const a = { ...n.attrs }; delete a.title;
        let data = "";
        if (n.name === "chart") data = JSON.stringify(stripTexts(chartYaml(n)));
        if (n.name === "mermaid") data = `${n.body.split("\n").length} lines, ${n.steps.length} steps`;
        if (n.name === "animation") data = `${n.head.split("\n").filter((l) => l.trim()).length} setup lines, ${n.steps.length} steps: ${n.steps.map((s) => s.raw.split("\n").filter((l) => l.trim()).length).join(",")}`;
        if (n.name === "terminal") data = JSON.stringify([n.head, ...n.steps.map((s) => s.raw)].map((t) => t.trim()));
        if (n.name === "filetree") data = JSON.stringify([n.head, ...n.steps.map((s) => s.raw)].map((t) => parseTree(t, 0, n.defs).rows.map((r) => `${r.depth}${r.name}${r.badges}${r.closed}`)));
        if (n.name === "editor") data = JSON.stringify([n.head.trim(), ...n.steps.map((s) => s.raw.trim())]);
        if (n.name === "codewalk") data = JSON.stringify(n.steps.map((s) => `${s.title}${JSON.stringify(s.attrs)}`));
        if (n.name === "tierlist") data = JSON.stringify(parseTier(n.body).tiers.map((t) => [t.colour, t.items.length]));
        if (n.name === "alignment") { const a = parseAlign(n.body); data = JSON.stringify([a.xs.length, a.ys.length, a.cells.map((c) => [c.col, c.row, c.items.length, !!c.label, c.colour]), a.regions.map((r) => [r.c0, r.c1, r.r0, r.r1, !!r.label, r.colour]), a.arrows, a.points.map((p) => [p.x, p.y])]); }
        if (n.name === "tabs" || n.name === "accordion") data = `${n.items.length} items`;
        parts.push(`${n.name}${JSON.stringify(a)}${data}${n.llm ? "+llm" : ""}`);
        walk(n.nodes);
        if (n.llm) walk(n.llm.nodes);
      }
    }
  };
  walk(doc.body);
  return { parts, codes, inline: inline.sort(), refs };
}
function stripTexts(v: any, key = ""): any {
  if (v == null) return v;
  if (typeof v === "string") return TEXT_KEYS.includes(key) ? "<text>" : v;
  if (Array.isArray(v)) return v.map((x) => stripTexts(x, key));
  if (typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stripTexts(x, k)]));
  return v;
}

// a chart's first evaluation, once per part and page budget: the JSON and the LLM view of one parse() call share it
// (so the LLM view never pays again for what the page already drew)
const initials = new WeakMap<object, WeakMap<PartNode, ReturnType<typeof evalChart>>>();
// a chart's YAML, read once per part node (the JSON and each LLM view of it read the same data)
const yamls = new WeakMap<PartNode, { d: any; err: string | null }>();
function chartYamlOf(p: PartNode): { d: any; err: string | null } {
  let r = yamls.get(p);
  // what the chart's aliases add beyond its text is charged to the page once, here (the first read of this part)
  if (!r) { try { const d = yamlParse(p.body); chargeYaml(d, currentBudget()); r = { d, err: null }; } catch (e) { r = { d: null, err: (e as Error).message }; } yamls.set(p, r); }
  return r;
}
function chartYaml(p: PartNode): any { return chartYamlOf(p).d; }
/** Why a chart's YAML could not be read (too many anchors and aliases, not YAML at all), or null. */
export function chartYamlError(p: PartNode): string | null { return chartYamlOf(p).err; }
function chartInitial(p: PartNode, d: any): ReturnType<typeof evalChart> {
  const b = currentBudget();
  if (!b) return evalChart(d);
  let m = initials.get(b);
  if (!m) { m = new WeakMap(); initials.set(b, m); }
  let r = m.get(p);
  if (!r) { r = evalChart(d); m.set(p, r); }
  return r;
}
// ---------- JSON for the renderer ----------
export function jsonOf(doc: Doc, src?: string, publicView = false): any {
  const conv = (nodes: Node[]): any[] => nodes.map((n) => {
    // the public view drops "Security finding" callouts here too, as the LLM view does (format version 8)
    if (n.kind === "md") return { type: "markdown", line: n.line, md: inlineToHtml(publicView ? dropSecurityBlocks(n.text) : n.text) };
    if (n.kind === "toc") return { type: "toc", line: n.line, depth: +(n.attrs.depth ?? 3), scope: n.attrs.section ? "section" : "page", source: n.src };
    const base: any = { type: n.name, id: n.attrs.id ?? null, attrs: n.attrs, line: n.line, source: n.source + (n.llm ? "\n\n" + n.llm.source : ""), llm: llmOfPart(n, publicView) || null, llmKind: llmKindOf(n), size: tok(llmOfPart(n, publicView)) };
    switch (n.name) {
      case "animation": base.anim = animSrc(n); break;
      case "chart": { const d = chartYaml(n); base.chart = d; base.controls = chartControls(d).controls; base.initial = chartInitial(n, d); break; }
      case "tierlist": base.tier = parseTier(n.body, n.bodyLine, n.attrs.title ?? ""); break;
      case "alignment": base.align = parseAlign(n.body, n.bodyLine, n.attrs.title ?? ""); break;
      case "mermaid": base.steps = mermaidSteps(n); break;
      case "filetree": base.trees = treeSteps(n).map((s) => ({ title: s.title, rows: parseTree(s.text, 0, n.defs).rows })); base.marks = usedMarks(n.defs, base.trees.flatMap((t: any) => t.rows.flatMap((r: any) => r.badges))); break;
      case "terminal": base.steps = terminalSteps(n); base.prompt = n.attrs.prompt ?? "$"; base.prefixes = Object.fromEntries(Object.entries(n.defs?.prefixes ?? {}).filter(([k]) => base.steps.some((st: any) => st.lines.some((l: any) => l.prompt === k)))); base.title = n.attrs.title ?? null; break;
      case "codewalk": { const refs = codewalkRefs(doc, n); const modes = codewalkModes(n, refs); base.walkFiles = {}; base.steps = refs.map((r, i) => { const t = readRange(doc, r, src); const key = `${r.repo}/${r.file}`; if (!(key in base.walkFiles)) base.walkFiles[key] = readWhole(doc, r, src); return { animated: modes[i], key, repo: r.repo, file: r.file, commit: t.commit, lines: r.lines, focus: r.focus, marks: r.marks, lang: t.lang, code: t.text, error: t.err, note: noteHtml(n.steps[i].raw.trim()) }; }); break; }
      case "editor": {
        const { spec, files } = editorFiles(doc, n, src);
        const now = new Map<string, string[]>();
        base.files = files.map((f) => { if (f.text != null) now.set(f.path, f.text.split("\n")); return { path: f.path, repo: f.repo, made: f.made, commit: f.commit, lang: langOf(f.path), code: f.text, open: f.open, error: f.err }; });
        base.steps = spec.steps.map((s) => { const before = now.get(s.file) ?? []; const r = applyDiff(before, s.diff); now.set(s.file, r.after); return { title: s.title, file: s.file, before: before.join("\n"), after: r.after.join("\n"), added: r.added, removed: r.removed, error: r.err ?? null }; });
        break;
      }
      case "tabs": case "accordion": base.items = n.items.map((it) => ({ title: it.title, body: conv(it.nodes) })); break;
      case "human": base.body = conv(n.nodes); break;
    }
    return base;
  });
  return { path: doc.path, lang: doc.fm?.translation?.lang ?? "en", frontMatter: doc.fm, blocks: conv(doc.body), llmView: llmView(doc, doc.path, publicView) };
}

// ---------- tokens ----------
export { tok };
export const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

// ---------- files ----------
const GENERATED = ["README.md", "UL.md"];
export function listDh(p: string, withMd = false): string[] {
  if (statSync(p).isFile()) return [p];
  const out: string[] = [];
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const f = join(p, e.name);
    if (e.isDirectory()) out.push(...listDh(f, withMd));
    else if (e.name.endsWith(".dh.md") || (withMd && e.name.endsWith(".md") && !GENERATED.includes(e.name))) out.push(f);
  }
  return out.sort();
}
export function llmPathFor(file: string): string | null {
  const abs = resolve(file);
  const i = abs.lastIndexOf("/docs/");
  if (i < 0 || abs.includes("/docs/i18n/")) return null;
  if (GENERATED.includes(abs.split("/").pop()!)) return null;
  return abs.slice(0, i) + "/docs-llm/" + abs.slice(i + 6).replace(/\.dh\.md$/, ".md");
}
export function rootOf(file: string): string { const abs = resolve(file); const i = abs.lastIndexOf("/docs/"); return i < 0 ? dirname(abs) : abs.slice(0, i); }
