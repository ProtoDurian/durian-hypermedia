#!/usr/bin/env bun
// Write THEME.md: every CSS custom property the renderer reads, with what it is for and its light and dark defaults,
// taken from the stylesheets themselves (so it stays true after a sync). Then the class names and attributes a host may style.
//   bun scripts/theme-doc.ts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PKG = resolve(import.meta.dir, "..");
const UI = join(PKG, "src/ui");
const read = (f: string) => readFileSync(f, "utf8");
const cssFiles = [...readdirSync(UI).filter((f) => f.endsWith(".css")).map((f) => join(UI, f)), join(PKG, "src/styles/dh.css")];
const tsFiles = [...readdirSync(UI).filter((f) => /\.tsx?$/.test(f)).map((f) => join(UI, f)), ...readdirSync(join(PKG, "src/react")).map((f) => join(PKG, "src/react", f))];

// the tokens' definitions: light (:root), dark (:root[data-theme="dark"]), with the comment on the line or the section above
type Def = { light?: string; dark?: string; note?: string; section?: string };
const defs = new Map<string, Def>();
function readDefs(text: string) {
  let section = "";
  const lines = text.split("\n");
  let mode: "light" | "dark" | null = null, depth = 0;
  for (const l of lines) {
    const sec = l.match(/\/\*\s*-+\s*([^*-][^*]*?)\s*-*\s*\*\//);
    if (sec && !/:/.test(l.replace(/\/\*.*\*\//, ""))) section = sec[1].replace(/\(.*?\)/g, "").trim();
    if (/^\s*:root\[data-theme="dark"\]\s*\{/.test(l)) { mode = "dark"; depth = 1; continue; }
    if (/^\s*:root\s*\{/.test(l)) { mode = "light"; depth = 1; continue; }
    if (mode) {
      const comment = l.match(/\/\*\s*(.*?)\s*\*\//)?.[1];
      for (const m of l.replace(/\/\*.*?\*\//g, "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
        const d = defs.get(m[1]) ?? {};
        if (mode === "light" && d.light == null) { d.light = m[2].trim(); d.section = section; if (comment && !d.note) d.note = comment; }
        if (mode === "dark" && d.dark == null) d.dark = m[2].trim();
        defs.set(m[1], d);
      }
      depth += (l.match(/\{/g)?.length ?? 0) - (l.match(/\}/g)?.length ?? 0);
      if (depth <= 0) mode = null;
    }
  }
}
for (const f of [join(UI, "theme.css"), join(UI, "base.css"), join(UI, "parts.css")]) readDefs(read(f));

// the tokens the renderer reads: var(--x) in CSS, getPropertyValue / tok / css("--x") in code, --c1..--c8 families
const used = new Map<string, Set<string>>();
const use = (t: string, where: string) => { if (!used.has(t)) used.set(t, new Set()); used.get(t)!.add(where); };
for (const f of cssFiles) {
  const text = read(f).replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim().split(",")[0].trim().replace(/\s+/g, " ").slice(0, 40);
    for (const v of m[2].matchAll(/var\((--[\w-]+)/g)) use(v[1], sel);
  }
}
for (const f of tsFiles) {
  const text = read(f);
  for (const m of text.matchAll(/["'`](--[a-z][\w-]*)["'`]/g)) use(m[1], f.split("/").pop()!.replace(/\.tsx?$/, "") + " (code)");
  for (const m of text.matchAll(/--(c|series-)\$\{/g)) { const fam = m[1] === "c" ? ["", "-soft", "-ink"].flatMap((s) => [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `--c${n}${s}`)) : [1, 2, 3, 4, 5].map((n) => `--series-${n}`); fam.forEach((t) => use(t, f.split("/").pop()!.replace(/\.tsx?$/, "") + " (code)")); }
}
const SHAPE = /^--(r-|shadow|ring|dur|ease|stagger|s-\d|gutter|band|measure|page-max|font|w-|fs-|lh-|ls-|col$)/;
const isColour = (v = "") => /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|var\(--/i.test(v);
const esc = (s: string) => s.replace(/\|/g, "\\|");
// words for token families whose comment in theme.css does not say it per token
function special(t: string): string | null {
  let m = t.match(/^--c(\d)(-soft|-ink)?$/);
  if (m) return m[2] === "-soft" ? `family ${m[1]}: its pale fill` : m[2] === "-ink" ? `family ${m[1]}: its words on small tags` : `family colour ${m[1]}: borders, lines and dots of family ${m[1]} (animation, tier list, alignment grid, chart)`;
  m = t.match(/^--series-(\d)$/);
  if (m) return `chart series ${m[1]}`;
  m = t.match(/^--tone-([\w-]+)$/);
  if (m) return `animation tone "${m[1].replace(/-soft$/, "")}"${m[1].endsWith("-soft") ? " (fill)" : ""}`;
  if (/^--ch-\d+$/.test(t)) return "code colours (Code Hike theme github-from-css)";
  return null;
}
const INTERNAL = new Set(["--ar", "--d", "--i", "--lw", "--n", "--pct", "--rows", "--t", "--t-ink", "--t-soft", "--x", "--y", "--w", "--h"]);
function row(t: string) {
  const d = defs.get(t) ?? {};
  const sp = special(t);
  if (sp) d.note = d.note && /^--ch-/.test(t) ? `${sp}: ${d.note}` : sp;
  const where = [...(used.get(t) ?? [])].slice(0, 3).join(", ");
  const what = [d.note, d.section && !d.note ? d.section : "", where ? `read by ${where}` : ""].filter(Boolean).join("; ");
  return `| \`${t}\` | ${esc(what || "-")} | \`${esc(d.light ?? "-")}\` | \`${esc(d.dark ?? d.light ?? "-")}\` |`;
}
const read_ = [...used.keys()].filter((t) => !INTERNAL.has(t)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
const colours = read_.filter((t) => !SHAPE.test(t) && (isColour(defs.get(t)?.light) || !defs.has(t)));
const shapes = read_.filter((t) => SHAPE.test(t));
const others = read_.filter((t) => !colours.includes(t) && !shapes.includes(t));
const undefinedTokens = read_.filter((t) => !defs.has(t));
const head = "| Token | What it is for | Light default | Dark default |\n| --- | --- | --- | --- |";

const md = `# Theme contract

Everything the renderer draws reads CSS custom properties ("tokens"). Change the look by setting tokens; change the shape and motion
by a variant (below). This file is made from the stylesheets by \`bun scripts/theme-doc.ts\`; a sync that changes the CSS changes it.

## Where tokens live

- \`styles.css\` sets every token on \`.dh-doc\` (the root element of every rendered document), never on the page's \`:root\`,
  so the package cannot recolour the host page and the host's own tokens of the same name do not leak in.
- **Dark:** \`<html data-theme="dark">\`, or \`data-theme="dark"\` on one document (\`<DhDocument theme="dark">\`), or the
  system setting when neither says \`light\`.
- **Map a host theme:** set the tokens on \`.dh-doc\` in the host's CSS, after \`styles.css\`:
  \`.dh-doc { --acc: var(--host-accent); --surface: var(--host-card); }\` and the same under the host's dark selector.
- **Fonts:** the package loads no font. \`--font-sans\`, \`--font-mono\` and \`--font-display\` name the host's fonts (the default lists
  fall back to the system fonts).
- The 3D stage and the charts read the tokens from their own element when they draw and again when \`data-theme\` changes on
  \`<html>\`; after changing tokens any other way, toggle \`data-theme\` or re-mount.

## Colours (${colours.length} tokens)

${head}
${colours.map(row).join("\n")}

## Shape, type, space and motion (${shapes.length} tokens)

${head}
${shapes.map(row).join("\n")}
${others.length ? `\n## Other tokens (${others.length})\n\n${head}\n${others.map(row).join("\n")}\n` : ""}
${undefinedTokens.length ? `\nTokens read with no default in the package (a host may set them): ${undefinedTokens.map((t) => `\`${t}\``).join(", ")}.\n` : ""}
Not theme tokens: ${[...INTERNAL].filter((t) => used.has(t)).map((t) => `\`${t}\``).join(", ")} are set by the components on their own elements (sizes, positions, a tier's colour).

## Classes and attributes a host may style

| Selector | What it is |
| --- | --- |
| \`.dh-doc\` | the root of a rendered document; every rule in \`styles.css\` is under it |
| \`.dh-doc[data-dh-variant="..."]\` | the style variant (\`flat\` and \`bold\` ship; a host adds its own) |
| \`.dh-doc[data-dh-motion="off"]\` | motion off: every transition, morph, typing effect and chart animation is still |
| \`.dh-doc[data-theme="dark"]\` | this document in dark |
| \`figure.part.part-<type>\`, \`[data-dh-part="<type>"]\` | the frame around each part (\`terminal\`, \`chart\`, \`animation\`, a host block's name ...) |
| \`.term\`, \`.fx\`, \`.ide\`, \`.cw\`, \`.chart\`, \`.dg\`, \`.scn\`, \`.tl\`, \`.al\` | the terminal, file tree, editor, code walk, chart, diagram, animation stage, tier list, alignment grid |
| \`.tabs\`, \`.tab-bar\`, \`.tab-panel\`, \`.accordion\`, \`.acc-item\`, \`.human\` | the containers |
| \`.ctl\`, \`.btn\`, \`.btn-go\`, \`.ctl-range\` | the step controls (Back, Play, the slider, Next) |
| \`.callout.callout-<kind>\`, \`.banner.banner-<kind>\` | callouts (\`note\`, \`tip\`, \`important\`, \`warn\`, \`security\`) and the page banner |
| \`.code-block\`, \`.ch-pre\`, \`.ch-focus\`, \`.ch-mark\`, \`.ch-add\`, \`.ch-del\` | code, and its focused, marked, added and removed lines |
| \`.dh-error\` | a part parse() refused (over a cap, unsafe, unreadable) |
| \`.dh-spinner\`, \`.dh-spin\` | the loading spinner (mermaid) |
| \`.dh-fallback\` | a part shown as text because no component was given for it |
| \`.dh-raw\` | raw HTML from the source, shown as text |
| \`.dh-keys kbd\`, \`.dh-mouse\` | keyboard keys and mouse actions in text |

## Variants: swapping the chrome per style

\`<DhDocument variant="flat">\` sets \`data-dh-variant="flat"\` on the root. Two variants ship in \`styles.css\`:

- \`flat\`: small corners, hairlines, no shadows, quicker motion.
- \`bold\`: square corners, thick ink borders, hard offset shadows, monospace headings and buttons, no transitions.

A host style writes its own the same way: override the shape and motion tokens under its attribute, then any selector above.

\`\`\`css
.dh-doc[data-dh-variant="paper"] { --r-s: 2px; --r-m: 2px; --r-l: 2px; --shadow-sm: none; --shadow-md: none; --dur: 0ms; }
.dh-doc[data-dh-variant="paper"] .term { border: 1px dashed var(--line-2); }
\`\`\`

For changes CSS cannot make, \`slots\` swap the chrome components: \`Frame\` (the box around each part), \`Callout\`, \`Banner\`,
\`Error\` and \`Spinner\`; they also draw Markdown elements your own way (\`Code\`, \`InlineCode\`, \`Link\`, \`Table\`, \`Heading\`) and mermaid diagrams (\`Mermaid\`): see ADOPT.md.

## Motion

- \`prefers-reduced-motion: reduce\` is honoured everywhere: CSS transitions and animations stop; the animation stage jumps to
  each step's end; streams stand still along their paths; the code walk does not morph; the terminal shows each step whole
  instead of typing; Chart.js does not animate.
- A host style can turn motion off without the reader's setting: \`<DhDocument motion="off">\` (sets \`data-dh-motion="off"\`;
  the components check for that attribute anywhere on the page).
`;
writeFileSync(join(PKG, "THEME.md"), md);
console.log(`THEME.md: ${colours.length} colour, ${shapes.length} shape, ${others.length} other tokens; ${undefinedTokens.length} without a default`);
