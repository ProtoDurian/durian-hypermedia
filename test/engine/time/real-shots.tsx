// Not a test: the page's own engine path ("new") on the time fixtures, server-rendered, shot at 1280 and 390 px (step 1 whole).
//   bun test/engine/time/real-shots.tsx <outdir> [fixture numbers]
import { mkdirSync, readFileSync, readdirSync, writeFileSync, cpSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { launch, killAll } from "../../../scripts/cdp";
import { buildCss } from "../../../scripts/build-css";
const ROOT = join(import.meta.dir, "../../..");
const { parse } = await import(join(ROOT, "src/index"));
const { DhDocument } = await import(join(ROOT, "src/react/index"));
const out = process.argv[2], nums = process.argv.slice(3);
mkdirSync(out, { recursive: true }); cpSync(join(ROOT, "example/fonts"), join(out, "fonts"), { recursive: true });
const fonts = [300, 400, 500, 600].map((w) => `@font-face{font-family:"Poppins";font-weight:${w};src:url("fonts/poppins-${w}-latin.woff2") format("woff2")}`).join("\n");
const extra = ["src/engine/look/look.css", "src/engine/layouts/time/time.css"].map((p) => readFileSync(join(ROOT, p), "utf8")).join("\n");
const css = buildCss() + "\n" + extra + "\n" + fonts + "\nbody{margin:8px;font-family:Poppins,sans-serif;background:var(--surface)}";
const page = await launch();
for (const f of readdirSync(join(ROOT, "fixtures/stage")).filter((x) => x.endsWith(".dh.md") && nums.includes(x.slice(0, 2)))) {
  const doc = parse(readFileSync(join(ROOT, "fixtures/stage", f), "utf8"), { path: "stage/" + f });
  const html = renderToString(<DhDocument doc={doc} engine="new" />);
  for (const w of [1280, 390]) {
    const name = `${f.slice(0, 2)}-${w}`;
    writeFileSync(join(out, name + ".html"), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><body>${html}`);
    await page.viewport(w, 900, w < 480); await page.goto("file://" + join(out, name + ".html")); await page.sleep(500);
    const hgt = await page.eval<number>("document.documentElement.scrollHeight");
    await page.viewport(w, Math.min(4000, hgt + 20), w < 480); await page.sleep(200);
    await page.shot(join(out, name + ".png")); console.log(name, hgt);
  }
}
await page.close(); killAll();
