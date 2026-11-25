#!/usr/bin/env bun
// The fit check: a part fits its box at every width, with no sideways scroller inside it (format version 11).
//   bun scripts/fit-check.ts --part trace [--widths 1280,390,360] [--column 640] [--out <dir>] [<page.dh.md>]     (default page: the part's sample)
// --column N also draws the page in a column N px wide at every width (a host whose content column is narrower than the screen).
// The page is built and drawn in headless Chrome at each width. Inside every [data-dh-part=<name>], any element that scrolls
// sideways (its content is wider than its box, and it scrolls or clips) is reported with both widths, and so is any drawing
// (svg) wider than the part. Exit 1 on any. The browser and the server are closed in any case.
import { launch } from "./cdp";
import React from "react";
import { renderToString } from "react-dom/server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { parse } from "../src/index";
import { DhDocument } from "../src/react/index";
import { documentJson } from "../src/react/hydrate";
import { buildCss } from "./build-css";

const PKG = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const PART = opt("--part", "");
const WIDTHS = opt("--widths", "1280,390,360").split(",").map(Number);
const COLUMN = Number(opt("--column", "0"));
const OUT = resolve(opt("--out", join(PKG, "dist/fit-check")));
const taken = new Set([opt("--part", ""), opt("--widths", ""), opt("--out", ""), opt("--column", "")]);
const page = args.find((a) => !a.startsWith("--") && !taken.has(a)) ?? join(PKG, "src/parts", PART, "sample.md");
if (!PART || !existsSync(page)) { console.error("usage: bun scripts/fit-check.ts --part <name> [--widths 1280,390,360] [<page>]"); process.exit(2); }
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

mkdirSync(join(OUT, "assets"), { recursive: true });
writeFileSync(join(OUT, "assets/styles.css"), buildCss() + "\n" + readFileSync(join(PKG, "example/site.css"), "utf8"));
const built = await Bun.build({ entrypoints: [join(PKG, "example/client.tsx")], outdir: join(OUT, "assets"), splitting: true, format: "esm", minify: false, target: "browser" });
if (!built.success) { console.error(built.logs); process.exit(1); }
const raw = readFileSync(page, "utf8");
const text = page.endsWith("sample.md") ? `---\ntitle: ${PART}\n---\n# ${PART}\n\n${raw}` : raw;
const doc = parse(text, { path: basename(page).endsWith(".dh.md") ? basename(page) : `${PART}.sample.dh.md` });
writeFileSync(join(OUT, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(PART)} fit</title><link rel="stylesheet" href="assets/styles.css">${COLUMN ? `<style>.ex-main{max-width:${COLUMN}px !important;margin-inline:auto}</style>` : ""}<script type="module" src="assets/client.js"></script></head><body><main class="ex-main"><div id="dh-root">${renderToString(React.createElement(DhDocument, { doc }))}</div></main><script type="application/json" id="dh-doc">${documentJson(doc)}</script></body></html>`);

const MEASURE = `(() => {
  const out = [];
  document.querySelectorAll('[data-dh-part="${PART}"]').forEach((part, pi) => {
    const pr = part.getBoundingClientRect();
    part.querySelectorAll("*").forEach((el) => {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      if (!r.width) return;
      const scrolls = (cs.overflowX === "auto" || cs.overflowX === "scroll" || cs.overflowX === "hidden") && el.scrollWidth > el.clientWidth + 1;
      if (scrolls && cs.overflowX !== "hidden") out.push({ part: pi, what: (el.tagName.toLowerCase() + "." + String(el.getAttribute("class") || "").split(" ")[0]), inside: el.scrollWidth, box: el.clientWidth });
      if (el.tagName.toLowerCase() === "svg" && r.right > pr.right + 1 && !el.closest(".trace-mini")) out.push({ part: pi, what: "svg wider than the part", inside: Math.round(r.right - pr.left), box: Math.round(pr.width) });
    });
  });
  return out;
})()`;

const freePort = () => { const s = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") }); const p = s.port; s.stop(true); return p; };
const PORT = freePort();
const server = Bun.spawn(["bun", join(PKG, "example/serve.ts"), OUT, String(PORT)], { stdout: "ignore", stderr: "inherit" });
let bad = 0;
const rows: string[] = [];
let p: Awaited<ReturnType<typeof launch>> | null = null;
try {
  await new Promise((r) => setTimeout(r, 700));
  if (server.exitCode !== null) throw new Error(`the page server did not start on port ${PORT}: the check is broken`);
  p = await launch();
  for (const w of WIDTHS) {
    await p.viewport(w, 844, w < 700);
    await p.goto(`http://127.0.0.1:${PORT}/index.html`);
    await p.sleep(500);
    // scroll through the page so every lazy drawing runs
    const h = await p.eval<number>(`document.documentElement.scrollHeight`);
    for (let y = 0; y < h; y += 600) { await p.eval(`window.scrollTo(0, ${y})`); await p.sleep(60); }
    await p.sleep(900);
    const found = await p.eval<{ part: number; what: string; inside: number; box: number }[]>(MEASURE);
    const n = await p.eval<number>(`document.querySelectorAll('[data-dh-part="${PART}"]').length`);
    if (!n) { rows.push(`${PART} at ${w}: no part drawn: the check is broken`); bad++; continue; }
    rows.push(`${PART} at ${w}${COLUMN ? ` (column ${COLUMN})` : ""}: ${n} drawn, ${found.length} sideways`);
    for (const f of found) { bad++; rows.push(`  SIDEWAYS part ${f.part}: ${f.what} holds ${f.inside} px in a ${f.box} px box`); }
  }
} finally {
  await p?.close?.();
  server.kill();
}
console.log(rows.join("\n"));
console.log(bad ? `fit-check: ${bad} problems` : "fit-check: ok");
process.exit(bad ? 1 : 0);
