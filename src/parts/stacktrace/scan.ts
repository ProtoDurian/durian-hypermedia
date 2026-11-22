// Linear scans for printed stack traces. No matching engine runs over a frame.
import type { Budget } from "../../core/budget";
export const TRACE_LANGS = ["go", "dotnet", "js", "dart", "java", "python"] as const;
export type TraceLang = (typeof TRACE_LANGS)[number];
export const TRACE_KEYS = ["id", "title", "lang", "app", "repo", "strip", "llm", "static"];
export const LANG_ALIASES: Record<string, TraceLang> = { go: "go", golang: "go", dotnet: "dotnet", ".net": "dotnet", csharp: "dotnet", cs: "dotnet", js: "js", ts: "js", node: "js", bun: "js", javascript: "js", typescript: "js", dart: "dart", flutter: "dart", java: "java", kotlin: "java", python: "python", py: "python" };
export interface Frame { fn: string; file: string; line: number | null; col: number | null; pkg: string; lib: boolean; app: boolean; code?: string; raw: string }
export interface Block { kind: "error" | "cause" | "suppressed" | "thread"; head: string; type: string; message: string; frames: Frame[]; omitted: number; gaps: number[]; note?: string }
export interface Trace { lang: TraceLang; blocks: Block[]; lines: number }
export const hasLib = (s: string) => s.split(/[\\/]/).some((p) => ["node_modules", "vendor", "site-packages", "dist-packages", ".pub-cache"].includes(p)) || s.includes("/pkg/mod/");
const mk = (raw: string, fn: string, file: string, line: number | null, col: number | null, pkg: string, lib: boolean): Frame => ({ raw, fn, file, line, col, pkg, lib, app: false });
const block = (kind: Block["kind"], head: string): Block => { const i = head.indexOf(": "); return { kind, head, type: i < 0 ? head : head.slice(0, i), message: i < 0 ? "" : head.slice(i + 2), frames: [], gaps: [], omitted: 0 }; };
const digits = (s: string) => s.length > 0 && /^[0-9]+$/.test(s);
/** Split numeric location suffixes from the right, preserving drive letters and URI schemes. */
function location(text: string) {
  let file = text, line: number | null = null, col: number | null = null;
  const last = file.lastIndexOf(":");
  if (last >= 0 && digits(file.slice(last + 1))) { line = Number(file.slice(last + 1)); file = file.slice(0, last); const prev = file.lastIndexOf(":"); if (prev >= 0 && digits(file.slice(prev + 1))) { col = line; line = Number(file.slice(prev + 1)); file = file.slice(0, prev); } }
  return { file, line, col };
}
function frameParts(t: string) { const at = t.lastIndexOf(" ("); return at >= 0 && t.endsWith(")") ? { fn: t.slice(0, at), loc: t.slice(at + 2, -1) } : { fn: "<anonymous>", loc: t }; }
function dropArgs(s: string, b?: Budget) { if (!s.endsWith(")")) return s; let depth = 0; for (let i = s.length - 1; i >= 0; i--) { b?.charge(1); if (s[i] === ")") depth++; else if (s[i] === "(" && --depth === 0) return s.slice(0, i) || s; } return s; }
export function detectLang(text: string, b?: Budget): TraceLang | null {
  for (const line of text.split("\n")) { b?.charge(1 + line.length); const t = line.trim();
    if (t.startsWith("Traceback (most recent call last)") || t.startsWith("File \"")) return "python";
    if (t.startsWith("goroutine ") || t.startsWith("panic:") || (line.startsWith("\t") && t.includes(".go:"))) return "go";
    if (t[0] === "#" && digits(t.slice(1).split(/\s/, 1)[0])) return "dart";
    if (t.startsWith("at ")) { const rest = t.slice(3), paren = rest.indexOf("(");
      const p = paren >= 0 && rest.endsWith(")") ? { fn: rest.slice(0, paren).trim(), loc: rest.slice(paren + 1, -1) } : frameParts(rest), loc = location(p.loc);
      if ([".java", ".kt", ".scala", ".groovy"].some((x) => loc.file.endsWith(x)) || p.loc === "Native Method" || p.loc === "Unknown Source") return "java";
      if (loc.line !== null && loc.col !== null) return "js";
      if (t.includes(":line ") || t.startsWith("at System.")) return "dotnet";
    }
    if (t.startsWith("---> ")) return "dotnet";
  } return null;
}
export function parseTrace(body: string, lang: TraceLang | null, b?: Budget, cap = 2000): Trace {
  b?.charge(body.length, 0, body.length);
  const lines = body.replace(/\r/g, "").split("\n");
  if (lines.length > cap) throw new Error(`trace has ${lines.length} lines; at most ${cap}`);
  const l = lang ?? detectLang(body, b); if (!l) throw new Error("could not tell the language of this trace: add lang=go|dotnet|js|dart|java|python");
  const out: Block[] = [], stack: Block[] = [], links: string[] = [], head: string[] = []; let cur: Block | null = null, last: Frame | null = null;
  const add = (kind: Block["kind"], text: string) => { cur = block(kind, text); out.push(cur); return cur; };
  const ensure = () => cur ?? add("error", "error");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], t = raw.trim(); b?.charge(1 + raw.length, 1, raw.length); if (!t) continue;
    if (l === "go") {
      if (t.startsWith("goroutine ") && (t.endsWith("]:") || t.endsWith("]"))) { cur = add("thread", t); cur.type = t.slice(0, t.indexOf(" [")); cur.message = t.slice(t.indexOf("[") + 1, t.lastIndexOf("]")); continue; }
      if (t.startsWith("exit status ")) continue;
      const next = lines[i + 1]?.trim(), at = next?.indexOf(" +0x"), loc = next ? location(at! >= 0 ? next.slice(0, at) : next) : null;
      if (!raw.startsWith(" ") && !raw.startsWith("\t") && loc?.line !== null && loc && lines[i + 1] !== next) {
        b?.charge(lines[i + 1].length); let fn = t, created = false;
        if (fn.startsWith("created by ")) { fn = fn.slice(11); const x = fn.indexOf(" in goroutine "); if (x >= 0) fn = fn.slice(0, x); created = true; }
        fn = dropArgs(fn, b); const dot = fn.indexOf(".", fn.lastIndexOf("/") + 1), pkg = dot < 0 ? fn : fn.slice(0, dot);
        const std = loc.file.includes("/go/src/") || loc.file.includes("/usr/local/go/") || loc.file.includes("GOROOT") || (!pkg.split("/")[0].includes(".") && pkg !== "main");
        ensure().frames.push(mk(raw, created ? `created by ${fn}` : fn, loc.file, loc.line, null, pkg, std || hasLib(loc.file))); i++; continue;
      }
      if (t.startsWith("panic:") || t.startsWith("fatal error:") || t.startsWith("signal:") || t.startsWith("[recovered]") || t.startsWith("runtime error:")) add(out.length ? "cause" : "error", raw);
      else if (!cur) add("error", raw); else if (cur.kind === "error" && !cur.frames.length) cur.head += "\n" + raw;
    } else if (l === "dotnet") {
      if (t.startsWith("---> ")) { stack.push(add("cause", t.slice(5))); continue; }
      if (t.startsWith("--- End of inner exception stack trace ---")) { stack.pop(); cur = stack.at(-1) ?? null; continue; }
      if (t.startsWith("--- End of stack trace from previous location")) { const c = stack.at(-1); if (c) c.gaps.push(c.frames.length); continue; }
      if (t.startsWith("at ") && raw !== t) {
        const rest = t.slice(3), at = rest.lastIndexOf(" in "), marker = rest.lastIndexOf(":line "); const file = at >= 0 && marker > at ? rest.slice(at + 4, marker) : "", fn = file ? rest.slice(0, at) : rest;
        const name = fn.split("(", 1)[0], ns = name.slice(0, name.lastIndexOf(".")); const c = stack.at(-1); if (!c) throw new Error(".NET trace: a frame comes before any exception line");
        c.frames.push(mk(raw, fn, file, file ? Number(rest.slice(marker + 6)) : null, null, ns, (!file && ["System.", "Microsoft.", "Newtonsoft.", "Npgsql."].some((p) => fn.startsWith(p))) || hasLib(file))); continue;
      }
      if (raw === t || t.includes("Exception") || t.includes("Error")) { stack.length = 0; stack.push(add(out.length ? "cause" : "error", t)); } else ensure().message += "\n" + t;
    } else if (l === "js") {
      if (t.startsWith("at ") && raw !== t) { const rest = t.slice(t.startsWith("at async ") ? 9 : 3), p = frameParts(rest), loc = location(p.loc);
        if (loc.line !== null && loc.col !== null) { ensure().frames.push(mk(raw, p.fn, loc.file, loc.line, loc.col, loc.file.slice(0, loc.file.lastIndexOf("/")), loc.file.startsWith("node:") || loc.file.startsWith("bun:") || hasLib(loc.file))); continue; }
        if (["native", "unknown location", "<anonymous>"].includes(p.loc)) { ensure().frames.push(mk(raw, p.fn === "<anonymous>" ? p.loc : p.fn, p.loc, null, null, "native", true)); continue; }
      }
      const prefix = ["Caused by:", "[cause]:", "cause:"].find((p) => t.startsWith(p)); add(out.length ? "cause" : "error", prefix ? t.slice(prefix.length).trim() : t);
    } else if (l === "dart") {
      const space = t.search(/\s/); if (t[0] === "#" && space >= 0 && digits(t.slice(1, space))) { const p = frameParts(t.slice(space).trim()), loc = location(p.loc); if (!cur) add("error", head.filter((h) => h !== "Unhandled exception:").join("\n") || "Unhandled exception");
        ensure().frames.push(mk(raw, p.fn, loc.file, loc.line, loc.col, loc.file.startsWith("package:") ? loc.file.slice(8).split("/")[0] : loc.file, loc.file.startsWith("dart:") || ["flutter", "flutter_test", "flutter_driver", "sky_engine"].some((p) => loc.file.startsWith(`package:${p}/`)) || hasLib(loc.file))); continue; }
      if (t.startsWith("<asynchronous suspension>")) { if (cur) cur.gaps.push(cur.frames.length); continue; }
      if (cur) add("cause", t.startsWith("Caused by:") ? t.slice(10).trim() : t); else head.push(t);
    } else if (l === "java") {
      if (t.startsWith("at ") && raw !== t && t.endsWith(")")) { const rest = t.slice(3), at = rest.indexOf("("); if (at >= 0) { let fn = rest.slice(0, at); const slash = fn.indexOf("/"), mod = slash >= 0 ? fn.slice(0, slash) : ""; if (slash >= 0) fn = fn.slice(slash + 1); const loc = location(rest.slice(at + 1, -1)), parts = fn.split(".");
        ensure().frames.push(mk(raw, fn, loc.file, loc.line, null, parts.slice(0, -2).join(".") || fn, ["java.", "javax.", "jdk.", "sun.", "com.sun."].some((p) => fn.startsWith(p)) || mod.startsWith("java.") || mod.startsWith("jdk."))); continue; } }
      if (t.startsWith("... ")) { const n = t.slice(4).split(" ", 1)[0]; if (digits(n) && cur) cur.omitted += Number(n); continue; }
      const prefix = ["Caused by:", "Suppressed:"].find((p) => t.startsWith(p)); if (prefix) { add(prefix === "Suppressed:" ? "suppressed" : "cause", t.slice(prefix.length).trim()); continue; }
      if (raw === t || !cur) add(out.length ? "cause" : "error", t); else cur.message += "\n" + t;
    } else {
      if (t.startsWith("Traceback (most recent call last):")) { cur = add(out.length ? "cause" : "error", ""); last = null; continue; }
      if (t.startsWith("File \"")) { const at = t.lastIndexOf("\", line "); if (at >= 0) { const rest = t.slice(at + 8), comma = rest.indexOf(", in "), n = comma >= 0 ? rest.slice(0, comma) : rest; if (digits(n)) { const file = t.slice(6, at), fn = comma >= 0 ? rest.slice(comma + 5) : "<module>"; last = mk(raw, fn, file, Number(n), null, file.slice(0, file.lastIndexOf("/")), file.startsWith("<frozen ") || file.includes("/lib/python") || hasLib(file)); ensure().frames.push(last); continue; } } }
      if (t.startsWith("During handling of the above exception") || t.startsWith("The above exception was the direct cause")) { links.push(t); continue; }
      if (/^[\^~]+$/.test(t)) continue;
      if (raw.startsWith("    ") && last && !last.code) { last.code = t; continue; }
      if (cur && !cur.head) Object.assign(cur, { head: t, type: block(cur.kind, t).type, message: block(cur.kind, t).message }); else if (cur) cur.message += "\n" + t; else add("error", t);
    }
  }
  if (l === "dart" && !out.length && head.length) add("error", head.join("\n"));
  if (!out.some((bl) => bl.frames.length)) throw new Error(`no stack frame of the ${l} form was found. Frames look like: Go "pkg.Fn(args)" then a tab and "file.go:12"; .NET "at Ns.Type.Method(args) in file:line 12"; Bun/Node "at fn (file:12:5)"; Dart "#0  fn (package:x/y.dart:12:5)"; Java "at pkg.Class.method(File.java:12)"; Python File "x.py", line 12, in fn`);
  if (l === "python") { const ordered = out.map((bl, k) => ({ ...bl, kind: (k === out.length - 1 ? "error" : "cause") as Block["kind"], ...(k > 0 && links[k - 1] ? { note: links[k - 1] } : {}) })); return { lang: l, blocks: [ordered.at(-1)!, ...ordered.slice(0, -1).reverse()], lines: lines.length }; }
  return { lang: l, blocks: out, lines: lines.length };
}
