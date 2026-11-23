// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
import { yamlParse, chargeYaml } from "../host/yaml";
// doccheck, Durian Hypermedia part: the rich-doc checks of design section 4.1 and 11.4, run on .md and .dh.md pages.
// Usage: bun tools/doccheck.ts check <docs-dir|file...> [--src <code-root>]
// Each error names its check, as in the design's check table. Exit codes: 0 ok, 1 a check refused, 2 usage error.
// Format version 3: parts are fenced blocks (```terminal ...) or containers (:::tabs ...); see SPEC.md.
import { existsSync, readFileSync, readdirSync, statSync } from "../host/fs";
import { dirname, join, relative, resolve } from "../host/path";
import { PARTS, LLM_LIMIT, CALLOUTS, MOUSE_WORDS, CHART_KINDS, CHART_KEYS, ParseError, parseDoc, llmView, llmFormOf, safeYaml, checkCodeRef, mapCodeRefs, sectionsOf, h10, structureOf, listDh, llmPathFor, rootOf, tok, codewalkRefs, codewalkAnimate, readRange, editorFiles, applyDiff, parseTree, treeSteps, terminalSteps, chartControls, evalChart, chartCheck, animOf, mouseParts, madeUpFiles } from "./dh-lib";
import { parseDefs } from "./expr";
import { BudgetError, partBudget } from "./budget";
import { chartRoom, briefJson } from "./chart";
import { chart11Check } from "./chart11";
import { animOverMessage } from "./work";
import { parseTier, splitAround } from "./tier";
import { parseAlign } from "./align";
import type { Doc, Issue, MdNode, Node, PartNode } from "./dh-lib";
import { folderPart, folderCheck, folderLlmExempt } from "../parts/runtime";

type Ctx = "page" | "part" | "segment" | "llm";
const SEC_RE = /\*\*Security finding:\*\*/g;
const WATCH_RE = /\*\*Watch out:\*\*/g;
const where: Record<Exclude<Ctx, "page">, string> = { part: "inside a part", segment: "inside a human-only segment (the LLM view drops it)", llm: "in an LLM text" };

// the matches of /<open>([^<close>]*)<close>(\{[^}]*\})?/g in s, in one pass (the pattern scanned to the end of the
// text from every opener with no closer): [the match, inner, the {...} after it or undefined], as matchAll gives them
function enclosed(s: string, open: string, close: string, braces = false): [string, string, string | undefined][] {
  const out: [string, string, string | undefined][] = [];
  const lastBrace = braces ? s.lastIndexOf("}") : -1;
  for (let from = 0; ;) {
    const i = s.indexOf(open, from);
    if (i < 0) break;
    const j = s.indexOf(close, i + open.length);
    if (j < 0) break;
    let attrs: string | undefined, end = j + 1;
    if (braces && s[j + 1] === "{" && j + 2 <= lastBrace) { const k = s.indexOf("}", j + 2); attrs = s.slice(j + 1, k + 1); end = k + 1; }
    out.push([s.slice(i, end), s.slice(i + open.length, j), attrs]);
    from = end;
  }
  return out;
}
// the first match of /\b[\w./-]+\.(rs|go|ts|py|cs|js):\d+/ in s, in one pass (the pattern tried every word boundary
// of a long run of those characters, each scan to the run's end): the match, or null
const WORDCH = /\w/, PATHCH = /[\w./-]/, DIGIT = /\d/;
function fileLineRef(s: string): string | null {
  for (let c = s.indexOf(":"); c >= 0; c = s.indexOf(":", c + 1)) {
    if (!DIGIT.test(s[c + 1] ?? "") || c < 4 || !/^\.(rs|go|ts|py|cs|js)$/.test(s.slice(c - 3, c))) continue;
    let r0 = c - 3;
    while (r0 > 0 && PATHCH.test(s[r0 - 1])) r0--;
    for (let p = r0; p <= c - 4; p++) {
      if ((p > 0 && WORDCH.test(s[p - 1])) === WORDCH.test(s[p])) continue; // \b
      let e = c + 1;
      while (e < s.length && DIGIT.test(s[e])) e++;
      return s.slice(p, e);
    }
  }
  return null;
}
// blockquotes of a Markdown text, outside code fences: [first line offset, lines]
function blockquotes(text: string): [number, string[]][] {
  const out: [number, string[]][] = []; let cur: string[] | null = null; let fence = false;
  text.split("\n").forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (!fence && l.startsWith(">")) { if (!cur) { cur = []; out.push([i, cur]); } cur.push(l); } else cur = null;
  });
  return out;
}

function checkDoc(doc: Doc, src: string | undefined, issues: Issue[]) {
  const err = (line: number, check: string, msg: string) => issues.push({ file: doc.path, line, msg: `[${check}] ${msg}`, level: "error" });
  const warn = (line: number, check: string, msg: string) => issues.push({ file: doc.path, line, msg: `[${check}] ${msg}`, level: "warn" });
  const ids = new Map<string, number>();
  let inSummary = true; // the summary is the text before the first ## heading
  let partsSeen = 0;
  for (const e of doc.defErrors ?? []) err(1, "part data", e);
  if (doc.fm && "banner" in doc.fm) err(1, "part data", `banner was removed in format version 10: put the note in a callout under the title (> **Note:** ...), or drop it`);
  const visit = (nodes: Node[], ctx: Ctx) => {
    for (const n of nodes) {
      if (n.kind === "md") checkMd(n, ctx);
      else if (n.kind === "part") checkPart(n, ctx);
      else if (n.kind === "toc") { for (const k of Object.keys(n.attrs)) if (!["depth", "section"].includes(k)) err(n.line, "part data", `::toc takes depth=2..4 and section, not "${k}"`); if (n.attrs.depth && !/^[234]$/.test(n.attrs.depth)) err(n.line, "part data", `::toc depth is 2, 3 or 4`); }
    }
  };
  const checkMd = (n: MdNode, ctx: Ctx) => {
    for (const m of mapCodeRefs(n.text)) { const e = checkCodeRef(doc, m, src); if (e) err(n.line, "code references", e); }
    const noCode = n.text.replace(/```[\s\S]*?```/g, "");
    for (const m of noCode.matchAll(/^>\s*\*\*([^*]+?):\*\*/gm)) if (!CALLOUTS.includes(m[1])) err(n.line, "part data", `"**${m[1]}:**" is not a callout marker (markers: ${CALLOUTS.join(", ")})`);
    if (/^:::\s*banner/m.test(noCode)) err(n.line, "part data", `:::banner was removed in format version 10: put the note in a callout under the title (> **Note:** ...), or drop it`);
    const inl = noCode.replace(/`[^`\n]*`/g, "");
    for (const m of enclosed(inl, ":kbd[", "]")) {
      if (!m[1].trim() || splitAround(m[1], ",").some((c) => !c || /^\+|\+\+\+/.test(c))) err(n.line, "part data", `:kbd[${m[1]}] needs keys joined by + and chords separated by commas, like :kbd[Ctrl+K, Ctrl+S]`);
      if (/[←→↑↓⌘⇧⌥↵⇥⌫]/.test(m[1])) err(n.line, "part data", `:kbd[${m[1]}]: write the key's name as typed (Left, Right, Up, Down, Cmd, Shift, Enter); the page draws the symbol`);
    }
    for (const m of enclosed(inl, ":mouse[", "]", true)) { if (m[2]) err(n.line, "part data", `:mouse takes no {attributes}: write the action and its target inside, like :mouse[click Cancel]`); const { act } = mouseParts(m[1]); if (!MOUSE_WORDS.includes(act)) err(n.line, "part data", `:mouse[${m[1]}]: "${act}" is not a mouse action (${MOUSE_WORDS.join(", ")})`); }
    const ln = fileLineRef(noCode);
    if (ln) err(n.line, "line numbers in prose", `"${ln}"; use a code reference`);
    const lines = n.text.split("\n");
    const headingAt = ctx === "page" ? lines.findIndex((l) => /^## /.test(l)) : -1;
    for (const [at, bq] of blockquotes(n.text)) {
      const t = bq.join("\n");
      const sec = (t.match(SEC_RE) ?? []).length, wo = (t.match(WATCH_RE) ?? []).length;
      if (!sec && !wo) continue;
      const line = n.line + at;
      const check = sec ? "security blocks" : "watch-out blocks";
      if (ctx !== "page") { err(line, check, `a ${sec ? "security" : "watch-out"} block may not sit ${where[ctx]}; put it in the prose next to it`); continue; }
      if (inSummary && (headingAt < 0 || at < headingAt)) err(line, check, `a ${sec ? "security" : "watch-out"} block may not sit in the summary`);
      if (sec > 1) err(line, "security blocks", `two security findings in one block; give each its own block`);
      if (wo > 1) err(line, "watch-out blocks", `two watch-out markers in one block; give each its own block`);
      if (sec && wo) err(line, check, `a security finding and a watch-out in one block`);
      if (wo && !sec) {
        if (bq.length > 5) err(line, "watch-out blocks", `a watch-out block is ${bq.length} lines; at most 5`);
        if (!t.replace(WATCH_RE, "").replace(/^>\s*/gm, "").trim()) err(line, "watch-out blocks", `a watch-out marker with no text`);
      }
    }
    if (ctx === "page" && headingAt >= 0) inSummary = false;
  };
  const checkPart = (p: PartNode, ctx: Ctx) => {
    partsSeen++;
    const def = PARTS[p.name];
    if (!def) { err(p.line, "parts known", `unknown container ":::${p.name}" (containers: tabs, accordion, human, llm; data parts are fenced blocks: \`\`\`terminal, \`\`\`filetree, \`\`\`editor, \`\`\`codewalk, \`\`\`chart, \`\`\`tierlist, \`\`\`alignment, \`\`\`mermaid, \`\`\`animation)`); return; }
    if (p.attrs.id) { if (ids.has(p.attrs.id)) err(p.line, "part data", `id "${p.attrs.id}" is used twice (first at line ${ids.get(p.attrs.id)})`); else ids.set(p.attrs.id, p.line); }
    if (p.steps.length && !def.steps) err(p.steps[0].line, "part data", `${p.name} takes no @step lines`);
    // an editor shows the files as they are before its first edit, so one edit is two states; any other part needs 2 steps or none
    if (p.steps.length === 1 && p.name !== "editor") err(p.steps[0].line, "part data", `${p.name} has one @step; steps need at least 2 (or none; an editor may have one edit)`);
    // an animation over its layout budget is said once and not checked further (core/work.ts)
    if (p.name === "animation") { let over: string | null = null; try { animOf(p); } catch (e) { over = animOverMessage(e); if (over == null) throw e; } if (over) { err(p.line, "part data", `animation: ${over}`); return; } }
    const none = p.attrs.llm === "none";
    if (p.name === "human") {
      if (p.llm && none) err(p.line, "fence partner", `human-only segment has both llm=none and a :::llm after it`);
      if (!p.llm && !none) err(p.line, "fence partner", `human-only segment has no :::llm after it and no llm=none mark (write :::human llm=none when LLMs need nothing)`);
    } else if (none) err(p.line, "LLM text present", `${p.name} may not use llm=none: only a human-only segment may; wrap it in :::human llm=none if LLMs need nothing`);
    else if (def.form === "fenced" && !p.llm && ctx !== "segment" && !folderLlmExempt(p)) {
      const t = tok(llmFormOf(p, false));
      if (t > LLM_LIMIT) err(p.line, "LLM text present", `${p.name}${p.attrs.id ? ` #${p.attrs.id}` : ""} reads as ${t} tokens in the LLM view, over the ${LLM_LIMIT}-token limit; add a :::llm block after it, or make it smaller`);
    }
    if (p.llm) {
      if (!p.llm.body.trim()) err(p.llm.line, "LLM text placed", `empty :::llm block`);
      const w = p.llm.body.split(/\s+/).filter(Boolean).length;
      if (w > 160) warn(p.llm.line, "LLM text placed", `:::llm text is ${w} words; keep it concise (at most 160)`);
      visit(p.llm.nodes, "llm");
    }
    checkPartData(doc, p, (l, m) => err(l, "part data", m), src, (l, m) => warn(l, "part data", m));
    // an animation's warnings (format version 6): a token's label too long for its small chip
    if (p.name === "animation") for (const w of animOf(p).warnings) warn(w.line, "part data", `animation: ${w.msg}`);
    if (def.form === "container") visit(p.nodes, p.name === "human" || ctx === "segment" ? "segment" : "part");
    if (p.name === "codewalk") codewalkRefs(doc, p).forEach((r, i) => {
      const s = p.steps[i];
      if (!s.raw.trim()) err(s.line, "code walk ranges", `codewalk step has no note`);
      if (r.err) { err(s.line, "code walk ranges", r.err); return; }
      if (r.lines && r.lines[1] - r.lines[0] + 1 > 25) warn(s.line, "code walk ranges", `step shows ${r.lines[1] - r.lines[0] + 1} lines; keep a step to about 25`);
      const t = readRange(doc, r, src);
      if (t.err && (src || !doc.fm?.pins?.[r.repo])) err(s.line, "code walk ranges", t.err);
    });
  };
  for (const ref of (doc.fm?.code ?? []) as string[]) { const e = checkCodeRef(doc, ref, src); if (e) err(1, "code references", `front matter code: ${e}`); }
  visit(doc.body, "page");
  const isDh = doc.path.endsWith(".dh.md");
  if (isDh && !partsSeen) err(1, "parts known", `a .dh.md page with no part and no human-only segment; name it .md`);
  if (!isDh && partsSeen) err(1, "parts known", `a .md page holds a part; name it .dh.md`);
}
function checkChart(p: PartNode, err: (l: number, m: string) => void, warn: (l: number, m: string) => void): void {
  let d: any;
  try { d = yamlParse(p.body); } catch (e: any) { err(p.bodyLine, `chart data is not valid YAML: ${e.message}`); return; }
  if (!d || typeof d !== "object") { err(p.line, "chart has no data"); return; }
  // a spent check budget is not the chart's fault: it says that not every control value was checked
  const spent = (e: BudgetError) => (e.page ? warn(p.line, `chart: not every control value was checked (the checks' budget for this page is spent)`) : err(p.line, `chart: ${e.message}`));
  try { const pb = partBudget(); chargeYaml(d, pb); chartRoom(d, pb); }
  catch (e) { if (e instanceof BudgetError) { spent(e); return; } if (/anchors and aliases/.test((e as Error).message)) { err(p.line, `chart: ${(e as Error).message}`); return; } throw e; }
  // steps, a time axis, annotations, formats, heatmaps and the page-chart words are checked first (core/chart11.ts); what is left is
  // the plain chart the evaluator's own checks understand
  { const c11 = chart11Check(d); for (const e of c11.errors) err(p.line, `chart: ${e.length > 300 ? e.slice(0, 299) + "…" : e}`); for (const w of c11.warnings) warn(p.line, `chart: ${w}`); if (c11.errors.length) return; d = c11.base; }
  for (const k of Object.keys(d)) if (!CHART_KEYS.includes(k)) err(p.line, `chart: unknown key "${briefJson(k).slice(1, -1)}" (keys: ${CHART_KEYS.join(", ")})`);
  if (!CHART_KINDS.includes(d.kind)) err(p.line, `chart kind must be one of ${CHART_KINDS.join(", ")}, heatmap`);
  for (const e of chartCheck(d)) err(p.line, `chart: ${e.length > 300 ? e.slice(0, 299) + "…" : e}`);
  const { controls, errors } = chartControls(d);
  for (const e of errors) err(p.line, `chart: ${e}`);
  const names = controls.filter((c) => c.kind !== "button").map((c) => c.name);
  if (new Set(names).size !== names.length) err(p.line, "chart: two controls share a name");
  let defs: ReturnType<typeof parseDefs>;
  try { defs = parseDefs(d.let ?? {}, names); }
  catch (e) { if (!(e instanceof BudgetError)) throw e; spent(e); return; }
  for (const e of defs.errors) err(p.line, `chart let: ${e}`);
  const known = new Set(names);
  for (const c of controls) if (c.kind === "button") for (const k of Object.keys(c.set ?? {})) if (!known.has(k)) err(p.line, `chart: button ${c.name} sets unknown control "${briefJson(k).slice(1, -1)}"`);
  if (!(d.series ?? []).length) err(p.line, `chart has no series`);
  // evaluate at the start values, every slider's ends and every select option, so a reader can never break it
  const cases: Record<string, any>[] = [{}];
  for (const c of controls) { if (c.kind === "slider") cases.push({ [c.name]: c.min }, { [c.name]: c.max }); if (c.kind === "select") for (const o of c.options ?? []) cases.push({ [c.name]: o }); if (c.kind === "toggle") cases.push({ [c.name]: !c.value }); if (c.kind === "button") cases.push({ ...c.set }); }
  for (const v of cases) { const r = evalChart(d, v); if (r.limit === "page") { warn(p.line, `chart: not every control value was checked (the checks' budget for this page is spent)`); return; } if (r.error) { err(p.line, `chart${Object.keys(v).length ? ` with ${briefJson(v, 80)}` : ""}: ${r.error}`); return; } }
}
function checkPartData(doc: Doc, p: PartNode, err: (l: number, m: string) => void, src?: string, warn: (l: number, m: string) => void = err) {
  // a part in its own folder (src/parts/<name>/, format version 11) has its checks there
  if (folderPart(p.name)) { folderCheck(p, err, warn); return; }
  switch (p.name) {
    case "animation": for (const e of animOf(p).errors) err(e.line < p.line ? p.line : e.line, `animation: ${e.msg}`); break;
    case "codewalk": if (!p.steps.length) err(p.line, `codewalk has no @step`); for (const e of codewalkAnimate(p).errors) err(e.line, e.msg); { const mu = madeUpFiles(p.head, p.bodyLine); const stray = mu.rest.find((r) => r.text.trim()); if (stray) err(stray.line, `codewalk: before the first @step only @file blocks (made-up files) may come; put "${stray.text.trim().slice(0, 40)}" under a @step <code reference> or a @file <path>`); } break;
    case "chart": {
      // at most 20 problems per chart (each at most 300 characters), then a count of the rest
      let n = 0;
      checkChart(p, (l, m) => { if (++n <= 20) err(l, m.length > 300 ? m.slice(0, 299) + "…" : m); }, (l, m) => { if (++n <= 20) warn(l, m); });
      if (n > 20) err(p.line, `chart: and ${n - 20} more problems`);
      break;
    }
    case "tierlist": case "alignment": {
      const name = p.name === "tierlist" ? "tier list" : "alignment grid";
      for (const k of Object.keys(p.attrs)) if (!["id", "title"].includes(k)) err(p.line, `${name}: unknown attribute "${k}" (a ${name} takes #id and title="...")`);
      if (!p.body.trim()) { err(p.line, `empty ${name}: ${p.name === "tierlist" ? 'write one line per tier, like "S: Postgres (does everything), SQLite"' : 'name the axes ("x: lawful .. chaotic", "y: good .. evil") and place items, like "lawful / good: Paladin"'}`); break; }
      const r = p.name === "tierlist" ? parseTier(p.body, p.bodyLine, p.attrs.title ?? "") : parseAlign(p.body, p.bodyLine, p.attrs.title ?? "");
      for (const e of r.errors) err(e.line, `${name}: ${e.msg}`);
      break;
    }
    case "mermaid": if (!p.body.trim()) err(p.line, `empty mermaid block`); break;
    case "filetree": {
      if (p.steps.length && p.head.trim()) err(p.line, "filetree: with @step lines, put every tree under a step");
      for (const s of treeSteps(p)) { const t = parseTree(s.text, s.line, p.defs); for (const e of t.errors) err(e.line, e.msg); if (!t.rows.length) err(s.line, "filetree has no entries"); }
      break;
    }
    case "editor": {
      const { spec, files } = editorFiles(doc, p, src);
      if (!files.length) err(p.line, `editor has no file: list a repo file per line (sdks/node/src/a.ts), or make one up with @file <path>`);
      const contents = new Map<string, string[]>();
      for (const f of files) { if (f.err && (src || !doc.fm?.pins?.[f.repo])) err(f.line, `editor: ${f.err}`); if (f.text != null) contents.set(f.path, f.text.split("\n")); }
      if (files.filter((f) => f.open).length > 1) err(p.line, "editor: only one file can be (open)");
      if (new Set(files.map((f) => f.path)).size !== files.length) err(p.line, "editor: a file is listed twice");
      for (const s of spec.steps) {
        if (!s.title) err(s.line, "editor @step needs a title");
        if (!files.some((f) => f.path === s.file)) { err(s.line, `editor step edits ${s.file || "no file"}, which the editor does not list`); continue; }
        if (!s.diff.length) { err(s.line, `editor step "${s.title}" has no edit lines (+ added, - removed)`); continue; }
        const before = contents.get(s.file); if (!before) continue;
        const r = applyDiff(before, s.diff); if (r.err) err(s.line, `editor step "${s.title}": ${r.err}`); else contents.set(s.file, r.after);
      }
      break;
    }
    case "terminal": { const st = terminalSteps(p); if (!st.length || !st.some((x) => x.lines.length)) err(p.line, `terminal is empty`); if (p.steps.length && p.head.trim()) err(p.line, "terminal: with @step lines, put every line under a step"); break; }
    case "tabs": if (p.items.length < 2) err(p.line, `tabs needs at least 2 headings inside (one per tab)`); break;
    case "accordion": if (!p.items.length) err(p.line, `accordion needs at least 1 heading inside (one per row)`); break;
  }
}
function checkTranslation(doc: Doc, issues: Issue[]) {
  const tr = doc.fm.translation;
  const err = (check: string, msg: string, line = 1) => issues.push({ file: doc.path, line, msg: `[${check}] ${msg}`, level: "error" });
  if (!doc.path.includes("/i18n/")) { err("front matter valid", "a translation field outside docs/i18n/"); return; }
  if (!tr?.lang || !tr?.source) { err("front matter valid", "translation needs translation.lang and translation.source"); return; }
  const srcPath = resolve(dirname(doc.path), tr.source);
  if (!existsSync(srcPath)) { err("front matter valid", `translation source ${tr.source} does not exist`); return; }
  const src = parseDoc(srcPath);
  const secs = sectionsOf(src.bodyText);
  const now = secs.map(h10);
  const was: string[] = (tr.sourceHashes ?? []).map((x: unknown) => String(x));
  const behind: number[] = [];
  now.forEach((h, i) => { if (was[i] !== h) behind.push(i); });
  if (was.length !== now.length || behind.length) {
    const names = behind.map((i) => (i === 0 ? "summary" : `"${secs[i].split("\n")[0].replace(/^## /, "")}"`));
    err("translation behind", `translation (${tr.lang}) is behind its source: ${names.length ? "changed sections " + names.join(", ") : "section count differs"}; update it, then run dh stamp`);
  }
  const a = structureOf(src), b = structureOf(doc);
  for (let i = 0; i < Math.max(a.parts.length, b.parts.length); i++) if (a.parts[i] !== b.parts[i]) { err("translation shape", `part ${i + 1} differs from the source: expected ${a.parts[i]?.slice(0, 120)}, found ${b.parts[i]?.slice(0, 120)}`); break; }
  if (a.codes.join("\n") !== b.codes.join("\n")) err("translation shape", `code blocks differ from the source (code is never translated)`);
  const missing = a.inline.filter((x) => !b.inline.includes(x));
  if (missing.length) err("translation shape", `inline code missing or changed (code is never translated): ${[...new Set(missing)].slice(0, 6).join(" ")}`);
  if (a.refs.join() !== b.refs.join()) err("translation shape", `code references differ from the source`);
}

// LLM view in step: each page's docs-llm/ file is what dh llm makes now; no docs-llm/ file without a page.
function checkLlmViews(pages: string[], issues: Issue[], orphans = true) {
  const roots = new Set<string>();
  for (const f of pages) {
    const lp = llmPathFor(f);
    if (!lp) continue;
    roots.add(rootOf(f));
    let want: string;
    try { want = llmView(parseDoc(f), relative(rootOf(f), f)); } catch { continue; }
    const at = relative(process.cwd(), lp);
    if (!existsSync(lp)) issues.push({ file: f, line: 1, msg: `[LLM view in step] no LLM view at ${at}; run dh llm docs/`, level: "error" });
    else if (readFileSync(lp, "utf8") !== want) issues.push({ file: f, line: 1, msg: `[LLM view in step] ${at} differs from what dh llm makes from this page now; run dh llm docs/ and commit both`, level: "error" });
  }
  const want = new Set(pages.map((f) => llmPathFor(f)).filter(Boolean).map((p) => resolve(p!)));
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  for (const r of orphans ? roots : []) {
    const d = join(r, "docs-llm");
    if (!existsSync(d)) continue;
    for (const f of walk(d)) if (f.endsWith(".md") && !f.endsWith("/docs-llm/index.md") && !want.has(resolve(f))) issues.push({ file: f, line: 1, msg: `[LLM view in step] an LLM view with no source page; run dh llm docs/`, level: "error" });
  }
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = (k: string) => { const i = rest.indexOf(k); return i >= 0 ? rest.splice(i, 2)[1] : undefined; };
  const src = opt("--src");
  if (cmd !== "check" || !rest.length) { console.error("usage: doccheck check <docs-dir|page...> [--src <code-root>]"); process.exit(2); }
  const issues: Issue[] = [];
  const pages = rest.flatMap((t) => listDh(t, true));
  for (const f of pages) {
    let doc: Doc;
    (globalThis as any).__docPath = f;
    try { doc = parseDoc(f); } catch (e: any) { issues.push({ file: f, line: e.line ?? 1, msg: `[docs parse] ${e.message}`, level: "error" }); continue; }
    checkDoc(doc, src, issues);
    if (doc.fm.translation) checkTranslation(doc, issues);
  }
  checkLlmViews(pages, issues, rest.some((t) => statSync(t).isDirectory()));
  for (const i of issues) console.log(`${i.level === "error" ? "ERROR" : "warn "} ${relative(process.cwd(), i.file)}:${i.line}: ${i.msg}`);
  const n = issues.filter((i) => i.level === "error").length;
  console.log(n ? `${n} error(s)` : `ok: ${pages.length} page(s), ${issues.length} warning(s)${src ? "" : "; code not read: pass --src to check code references and code walk ranges"}`);
  process.exit(n ? 1 : 0);
}
if (import.meta.main) main();
export { checkDoc, checkTranslation, checkLlmViews };
