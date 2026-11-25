// The example self-hosts the faces the package measures its words with: the composed stage's widths are Poppins's
// (src/core/chipw.ts), so a page drawn in a fallback face runs lines past their boxes. The package loads no font.
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const EX = join(import.meta.dir, "../example");
const css = readFileSync(join(EX, "site.css"), "utf8"), build = readFileSync(join(EX, "build.tsx"), "utf8");

test("the example declares Poppins 400, 500 and 600 and IBM Plex Mono, each from a file it ships", () => {
  const faces = [...css.matchAll(/@font-face \{ font-family: "([^"]+)"; font-style: normal; font-weight: (\d+); font-display: swap; src: url\("fonts\/([^"]+)"\)/g)];
  const have = faces.map((m) => `${m[1]} ${m[2]}`);
  for (const f of ["Poppins 400", "Poppins 500", "Poppins 600", "IBM Plex Mono 400"]) expect(have).toContain(f);
  for (const m of faces) expect(existsSync(join(EX, "fonts", m[3]))).toBe(true);
  for (const l of ["OFL-Poppins.txt", "OFL-IBMPlexMono.txt"]) expect(existsSync(join(EX, "fonts", l))).toBe(true);
});
test("the build copies the faces next to the stylesheet and preloads the regular ones", () => {
  expect(build).toContain('cpSync(join(HERE, "fonts"), join(OUT, "assets/fonts"), { recursive: true });');
  for (const w of [400, 500, 600]) expect(build).toContain(`<link rel="preload" href="assets/fonts/poppins-${w}-latin.woff2" as="font" type="font/woff2" crossorigin>`);
});
test("the page column waits for its faces 1 s at most, and every page script ends the hold", () => {
  expect(css).toContain("html:not(.fonts-ready) .ex-main { animation: ex-font-hold 1s step-end; }");
  expect(readFileSync(join(EX, "font-hold.ts"), "utf8")).toContain("setTimeout(r, 1000)");
  for (const f of ["client.tsx", "client-tt.tsx", "client-ttfull.tsx"]) expect(readFileSync(join(EX, f), "utf8")).toContain('import { holdFonts } from "./font-hold";\nholdFonts();');
});
test("the package's own stylesheet still loads no font", () => {
  expect(readFileSync(join(import.meta.dir, "../scripts/build-css.ts"), "utf8")).toContain("the package never fetches a font");
});
