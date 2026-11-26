// Writes look/look.css from look/tokens.ts: `bun src/engine/look/gen.ts` (test/engine/look/look.test.ts fails when they drift).
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { LOOKS, LOOKS_DARK, LOOK_NAMES } from "./tokens";

const decls = (o: Record<string, string>, pad: string) => Object.entries(o).map(([k, v]) => `${pad}${k}: ${v};`).join("\n");

export function lookCss(): string {
  const out: string[] = [
    "/* GENERATED from src/engine/look/tokens.ts by gen.ts: edit the tokens, then run `bun src/engine/look/gen.ts`.",
    "   The one engine's two looks (DESIGN 2.4) as page tokens only: `stage` (default) and `classic`. The renderer draws every",
    "   layout from these --lk-* names; edges and words come from the page's measured palette (theme.css). */",
  ];
  for (const look of LOOK_NAMES) out.push(`.eng[data-look="${look}"] {\n${decls(LOOKS[look], "  ")}\n}`);
  const dark = LOOK_NAMES.filter((l) => Object.keys(LOOKS_DARK[l]).length);
  out.push("/* dark: the page tokens change by themselves; only plain numbers and shadows are set again */");
  out.push("@media (prefers-color-scheme: dark) {\n" + dark.map((l) => `  :root:not([data-theme="light"]) .eng[data-look="${l}"] {\n${decls(LOOKS_DARK[l], "    ")}\n  }`).join("\n") + "\n}");
  for (const l of dark) out.push(`:root[data-theme="dark"] .eng[data-look="${l}"] {\n${decls(LOOKS_DARK[l], "  ")}\n}`);
  return out.join("\n") + "\n";
}

if (import.meta.main) writeFileSync(join(import.meta.dir, "look.css"), lookCss());
