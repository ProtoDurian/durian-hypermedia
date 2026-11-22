#!/usr/bin/env bun
// The example site: every fixture as a page, rendered on the server and hydrated in the browser.
//   bun example/build.tsx [out]        then  bun example/serve.ts [out] [port]
// No inline script, no inline event handler, no CDN, no web font: it runs under
//   Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'
// The style switch (soft, flat, bold) and the theme switch are in the page script (client.tsx).
import React from "react";
import { renderToString } from "react-dom/server";
import { mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "../src/index";
import { highlight } from "../src/server";
import { DhDocument } from "../src/react/index";
import { documentJson } from "../src/react/hydrate";
import { buildCss } from "../scripts/build-css";
import { taskBlock, hostInlines } from "./host-block";

const HERE = import.meta.dir;
const PKG = resolve(HERE, "..");
const OUT = resolve(process.argv[2] ?? join(HERE, "dist"));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "assets"), { recursive: true });
writeFileSync(join(OUT, "assets/styles.css"), buildCss() + "\n" + readFileSync(join(HERE, "site.css"), "utf8"));
const r = await Bun.build({ entrypoints: [join(HERE, "client.tsx"), join(HERE, "client-tt.tsx"), join(HERE, "client-ttfull.tsx"), join(HERE, "tt-control.ts")], outdir: join(OUT, "assets"), splitting: true, format: "esm", minify: true, target: "browser", naming: { entry: "[name].[ext]", chunk: "c-[hash].[ext]" }, define: { "process.env.NODE_ENV": '"production"' } });
if (!r.success) { console.error(r.logs); process.exit(1); }

const groups: [string, string][] = [["", "Hand-written"], ["format", "From the Format page"], ["parts", "The folder parts (generated from src/parts/*/sample.md)"], ["hostile", "Hostile input (each one attack)"]];
const pages: { group: string; file: string; title: string; href: string }[] = [];
for (const [dir, group] of groups) {
  const d = join(PKG, "fixtures", dir);
  for (const f of readdirSync(d).filter((x) => x.endsWith(".md")).sort()) pages.push({ group, file: join(dir, f), title: "", href: `${(dir ? dir + "-" : "") + f.replace(/\.(dh\.)?md$/, "")}.html` });
}
const shell = (title: string, body: string, json = "", script = "client") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · durian-hypermedia example</title><link rel="stylesheet" href="assets/styles.css"><script type="module" src="assets/${script}.js"></script></head><body><header class="ex-head"><a class="ex-brand" href="index.html">durian-hypermedia</a><span class="ex-tools"><span class="ex-label">Style</span><button type="button" data-variant="">soft</button><button type="button" data-variant="flat">flat</button><button type="button" data-variant="bold">bold</button><button type="button" data-theme-toggle aria-label="Switch light or dark">◐</button></span></header><main class="ex-main">${body}</main>${json ? `<script type="application/json" id="dh-doc">${json}</script>` : ""}</body></html>`;

let n = 0;
for (const p of pages) {
  const text = readFileSync(join(PKG, "fixtures", p.file), "utf8");
  const doc = await highlight(parse(text, { blocks: [taskBlock], inlines: hostInlines, path: p.file }));
  p.title = doc.title ?? p.file;
  const html = renderToString(<DhDocument doc={doc} blocks={[taskBlock]} inlines={hostInlines} />);
  const probs = doc.problems.length ? `<details class="ex-problems"><summary>${doc.problems.length} problem(s) parse() reported</summary><ul>${doc.problems.map((x) => `<li>line ${x.line}: ${esc(x.message)}</li>`).join("")}</ul></details>` : "";
  // the same page rendered only in the browser (no server HTML), for the strict style-src test
  if (/^(codewalk|markdown|host-block|format-(10|12|21|26|31|33|38|39|43|57))/.test(p.href)) writeFileSync(join(OUT, "csr-" + p.href), shell(p.title, `<p class="ex-crumb"><a href="index.html">All fixtures</a> · rendered in the browser only</p><div id="dh-root" data-mode="csr"></div>`, documentJson(doc)));
  // every page again, rendered in the browser only, for the Trusted Types check: the strict entry, and the full one to compare
  writeFileSync(join(OUT, "tt-" + p.href), shell(p.title, `<p class="ex-crumb"><a href="index.html">All fixtures</a> · strict entry, rendered in the browser only</p><div id="dh-root"></div>`, documentJson(doc), "client-tt"));
  writeFileSync(join(OUT, "ttfull-" + p.href), shell(p.title, `<p class="ex-crumb"><a href="index.html">All fixtures</a> · full entry, rendered in the browser only</p><div id="dh-root"></div>`, documentJson(doc), "client-ttfull"));
  writeFileSync(join(OUT, p.href), shell(p.title, `<p class="ex-crumb"><a href="index.html">All fixtures</a> · ${esc(p.group)} · <code>${esc(p.file)}</code></p>${probs}<div id="dh-root">${html}</div>`, documentJson(doc)));
  n++;
}
const list = groups.map(([, g]) => `<h2>${esc(g)}</h2><ul class="ex-list">${pages.filter((p) => p.group === g).map((p) => `<li><a href="${p.href}">${esc(p.title)}</a> <code>${esc(p.file)}</code></li>`).join("")}</ul>`).join("");
// a control page that breaks the CSP on purpose (an inline script and an inline handler): the checker must see it
writeFileSync(join(OUT, "_control.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>control</title></head><body><div class="dh-doc"><script>window.__inline = 1</script><img src="nope.png" onerror="window.__inline = 2" alt=""></div></body></html>`);
// the Trusted Types control page: its script puts a plain string into innerHTML; under the policy that must be refused
writeFileSync(join(OUT, "_tt-control.html"), `<!doctype html><html><head><meta charset="utf-8"><title>tt control</title><script type="module" src="assets/tt-control.js"></script></head><body><div class="dh-doc" id="box"></div></body></html>`);
writeFileSync(join(OUT, "index.html"), shell("All fixtures", `<h1>durian-hypermedia: every fixture</h1><p>Each page is rendered on the server with <code>renderToString(&lt;DhDocument doc={doc} /&gt;)</code> and hydrated in the browser. The style buttons switch the variant; the last button switches light and dark.</p>${list}`));
console.log(`example: ${n} pages in ${OUT}`);
