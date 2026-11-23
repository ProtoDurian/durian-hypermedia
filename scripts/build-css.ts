#!/usr/bin/env bun
// Build dist/styles.css: the renderer's stylesheets, scoped under .dh-doc so they never style the host page.
//   bun scripts/build-css.ts
// - :root, html and body rules apply to .dh-doc instead (so the theme tokens live on the document, not the page);
//   a dark rule applies when the page or the document says dark: <html data-theme="dark"> or <div class="dh-doc" data-theme="dark">.
// - every other selector gets ".dh-doc " in front.
// - the site's own chrome (header, navigation, page columns) and @font-face rules are left out: fonts are the host's
//   (map --font-sans, --font-mono and --font-display), so the package never fetches a font.
// - src/styles/dh.css (the package's own rules, variants and the reduced-motion rules) is added as written.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PART_CSS } from "../src/parts/generated/css";

const PKG = resolve(import.meta.dir, "..");
const UI = join(PKG, "src/ui");
const CHROME = /^(html|body|\.skip|\.site-|\.brand|\.theme-btn|\.page\b|\.col\b|\.toc-side|\.toc-inline|\.kicker|h1\.title|\.lead\b|\.meta-row|\.lang-links|\.fine\b|\.cards?\b|\.nums\b|\.three\b|\.three-h|\.pane-label|\.pane-src|\.pane-out|\.pane-none|\.cites|\.llm-raw|\.mt-note)/;

type Rule = { prelude: string; body: string };
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  let i = 0;
  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i++;
    if (i >= css.length) break;
    const open = css.indexOf("{", i);
    const semi = css.indexOf(";", i);
    if (open < 0) break;
    if (semi >= 0 && semi < open && css.slice(i, semi).trim().startsWith("@")) { out.push({ prelude: css.slice(i, semi).trim(), body: "" }); i = semi + 1; continue; }
    let depth = 1, j = open + 1, q: string | null = null;
    for (; j < css.length && depth; j++) {
      const c = css[j];
      if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") q = c; else if (c === "{") depth++; else if (c === "}") depth--;
    }
    out.push({ prelude: css.slice(i, open).trim(), body: css.slice(open + 1, j - 1) });
    i = j;
  }
  return out;
}
function splitSel(s: string): string[] {
  const out: string[] = []; let depth = 0, cur = "";
  for (const c of s) { if (c === "(" || c === "[") depth++; if (c === ")" || c === "]") depth--; if (c === "," && !depth) { out.push(cur.trim()); cur = ""; } else cur += c; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function scopeOne(sel: string): string[] {
  if (sel.startsWith(".dh-doc")) return [sel];
  const m = sel.match(/^(:root|html|body)((?:\[[^\]]*\]|:not\([^)]*\)|\.[\w-]+)*)(.*)$/);
  if (m) {
    const q = m[2], rest = m[3];
    if (!q) return [`.dh-doc${rest}`];
    if (/data-theme="dark"/.test(q)) return [`:root${q} .dh-doc:not([data-theme="light"])${rest}`, `.dh-doc[data-theme="dark"]${rest}`];
    if (/:not\(\[data-theme="light"\]\)/.test(q)) return [`:root${q} .dh-doc:not([data-theme="light"])${rest}`];
    return [`:root${q} .dh-doc${rest}`, `.dh-doc${q}${rest}`];
  }
  return [`.dh-doc ${sel}`];
}
function transform(css: string, dropChrome: boolean): string {
  const out: string[] = [];
  for (const r of rules(css.replace(/\/\*[\s\S]*?\*\//g, ""))) {
    const p = r.prelude;
    if (p.startsWith("@font-face") || p.startsWith("@import") || p.startsWith("@charset")) continue;
    if (p.startsWith("@keyframes") || p.startsWith("@property")) { out.push(`${p} {${r.body}}`); continue; }
    if (p.startsWith("@media") || p.startsWith("@supports") || p.startsWith("@container") || p.startsWith("@layer")) {
      const inner = transform(r.body, dropChrome);
      if (inner.trim()) out.push(`${p} {\n${inner}\n}`);
      continue;
    }
    if (p.startsWith("@")) { out.push(r.body ? `${p} {${r.body}}` : `${p};`); continue; }
    const sels = splitSel(p).filter((s) => !(dropChrome && (CHROME.test(s) || /^body\./.test(s))) || /^(:root)/.test(s));
    if (!sels.length) continue;
    out.push(`${sels.flatMap(scopeOne).join(",\n")} {${r.body}}`);
  }
  return out.join("\n");
}

export function buildCss(): string {
  const all = readdirSync(UI).filter((f) => f.endsWith(".css"));
  // colours.css (the measured role palette's planes and 3:1 edges) comes after the other part sheets, so its edges win
  const order = ["theme.css", "base.css", ...all.filter((f) => f !== "theme.css" && f !== "base.css" && f !== "colours.css").sort(), "colours.css"];
  const parts = order.filter((f) => all.includes(f)).map((f) => `/* ---- ${f} (scoped) ---- */\n${transform(readFileSync(join(UI, f), "utf8"), f === "base.css")}`);
  // the parts in their own folders (src/parts/<name>/style.css), the kit first: listed by scripts/parts.ts
  for (const f of PART_CSS) parts.push(`/* ---- parts/${f} (scoped) ---- */\n${transform(readFileSync(join(PKG, "src/parts", f), "utf8"), false)}`);
  const own = readFileSync(join(PKG, "src/styles/dh.css"), "utf8");
  return `/* durian-hypermedia styles: every rule is scoped under .dh-doc. Theme tokens: THEME.md. */\n${parts.join("\n\n")}\n\n/* ---- dh.css (the package's own rules) ---- */\n${own}`;
}
if (import.meta.main) {
  mkdirSync(join(PKG, "dist"), { recursive: true });
  const css = buildCss();
  writeFileSync(join(PKG, "dist/styles.css"), css);
  console.log(`dist/styles.css ${(css.length / 1024).toFixed(1)} KB`);
}
