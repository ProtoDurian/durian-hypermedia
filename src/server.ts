// highlight(doc): colours for every piece of code, done once on the server (Bun or Node).
// Code Hike's highlighter runs TextMate grammars on WebAssembly, which a strict browser CSP (no 'wasm-unsafe-eval')
// does not allow; so it runs here and the colours travel in the Document. The browser never highlights.
// Without highlight() every part still renders, with plain (uncoloured) code.
import { highlight as chHighlight, type HighlightedCode } from "codehike/code";
import { packCode, walkRuns } from "./ui/codewalk";
import type { Block, Document, MdBlock } from "./types";

const LANG: Record<string, string> = { ts: "ts", typescript: "ts", tsx: "tsx", js: "js", javascript: "js", jsx: "jsx", rust: "rust", go: "go", python: "python", py: "python", csharp: "csharp", cs: "csharp", yaml: "yaml", yml: "yaml", json: "json", diff: "diff", md: "markdown", markdown: "markdown", sh: "bash", bash: "bash", shell: "bash", text: "text", "": "text", toml: "toml", state: "yaml", css: "css", html: "html", sql: "sql", java: "java", kotlin: "kotlin", swift: "swift", ruby: "ruby", php: "php", c: "c", cpp: "cpp", dockerfile: "dockerfile", nix: "nix", hcl: "hcl" };
const MAX_HL_CHARS = 200_000;   // one piece of code longer than this stays plain

export interface HighlightOptions { /** Code Hike theme name (default "github-from-css": colours from CSS variables, so light and dark follow the page) */ theme?: string }

export function dedent(text: string): { text: string; by: number } {
  const ls = text.split("\n");
  const by = Math.min(...ls.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)![0].length));
  const n = Number.isFinite(by) ? by : 0;
  return { text: ls.map((l) => l.slice(n)).join("\n"), by: n };
}

/** A new Document with colours on every code block, code walk, editor and terminal command. */
export async function highlight(doc: Document, opts: HighlightOptions = {}): Promise<Document> {
  const theme = opts.theme ?? "github-from-css";
  const cache = new Map<string, HighlightedCode>();
  const hl = async (value: string, lang = ""): Promise<HighlightedCode | undefined> => {
    if (value.length > MAX_HL_CHARS) return undefined;
    const k = `${lang}\u{0}${value}`;
    if (cache.has(k)) return cache.get(k)!;
    let h: HighlightedCode;
    try { h = await chHighlight({ value, lang: LANG[lang] ?? lang, meta: "" }, theme as any); }
    catch { h = await chHighlight({ value, lang: "text", meta: "" }, theme as any); }
    cache.set(k, h);
    return h;
  };
  const md = async (bs: MdBlock[]): Promise<MdBlock[]> => {
    const out: MdBlock[] = [];
    for (const b of bs) {
      if (b.t === "code") out.push({ ...b, hl: await hl(b.text, b.lang) });
      else if (b.t === "list") { const items = []; for (const it of b.items) items.push({ ...it, c: await md(it.c) }); out.push({ ...b, items }); }
      else if (b.t === "quote" || b.t === "callout") out.push({ ...b, c: await md(b.c) });
      else out.push(b);
    }
    return out;
  };
  const blocks = async (bs: Block[]): Promise<Block[]> => {
    const out: Block[] = [];
    for (const b of bs) {
      switch (b.type) {
        case "markdown": out.push({ ...b, md: await md(b.md) }); break;
        case "codewalk": {
          const { still } = walkRuns(b.steps.map((s) => !!s.animated));
          const walkHl: Record<string, unknown> = {};
          const steps = [];
          for (const [k, s] of b.steps.entries()) {
            const whole = b.walkFiles?.[s.key] ?? null;
            if (still[k] && s.lines && whole != null && !s.error) {
              if (!walkHl[s.key]) { const h = await hl(whole, s.lang); if (h) walkHl[s.key] = packCode(h); }
              steps.push(s);
            } else if (s.code) { const d = dedent(s.code); steps.push({ ...s, hl: await hl(d.text, s.lang), dedent: d.by }); }
            else steps.push(s);
          }
          out.push({ ...b, steps, walkHl });
          break;
        }
        case "editor": {
          const files = [];
          for (const f of b.files) files.push({ ...f, hl: f.code != null ? await hl(f.code, f.lang) : undefined });
          const steps = [];
          for (const s of b.steps) { const lang = b.files.find((f) => f.path === s.file)?.lang ?? "text"; steps.push({ ...s, beforeHl: await hl(s.before, lang), afterHl: await hl(s.after, lang) }); }
          out.push({ ...b, files, steps });
          break;
        }
        case "terminal": {
          const steps = [];
          for (const s of b.steps) {
            const lines = [];
            for (const l of s.lines) {
              if (l.k !== "cmd" || !l.text || b.prefixes?.[l.prompt ?? ""]) { lines.push(l); continue; }
              const h = await hl(l.text, "bash");
              lines.push(h ? { ...l, hl: h.tokens.map((x: any) => (typeof x === "string" ? [x, null] : [x[0], x[1] ?? null])) as [string, string | null][] } : l);
            }
            steps.push({ ...s, lines });
          }
          out.push({ ...b, steps });
          break;
        }
        case "tabs": case "accordion": { const items = []; for (const it of b.items) items.push({ ...it, body: await blocks(it.body) }); out.push({ ...b, items } as Block); break; }
        case "human": out.push({ ...b, body: await blocks(b.body) }); break;
        default: out.push(b);
      }
    }
    return out;
  };
  return { ...doc, blocks: await blocks(doc.blocks), highlighted: true };
}

export { parse, llmView, check } from "./document";
