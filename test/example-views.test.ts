// The example site: every fixture page shows its source and what an LLM reads, each behind a closed toggle above the part
// (no script; a part that grows as it loads moves nothing it did not move before). Builds the example into a new folder.
import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { parse, llmView } from "../src/index";
import { taskBlock, hostInlines } from "../example/host-block";
import { exampleRefs } from "../example/refs-store";

const PKG = resolve(import.meta.dir, "..");
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");

describe("example site: source and LLM view on every fixture", () => {
  test("each page has a closed Source and a closed LLM view, above the part, holding the fixture and its llmView", () => {
    const out = mkdtempSync(join(tmpdir(), "dh-example-views-"));
    try {
      const r = Bun.spawnSync(["bun", join(PKG, "example/build.tsx"), out], { cwd: PKG, stdout: "pipe", stderr: "pipe", env: { ...process.env } });
      expect(r.exitCode).toBe(0);
      for (const name of ["talk.mp3", "talk.peaks.json"]) {
        expect(readFileSync(join(out, "media", name))).toEqual(readFileSync(join(PKG, "src/parts/audio/media", name)));
      }
      let pages = 0;
      for (const dir of ["", "format", "parts", "stage", "hostile"]) {
        for (const f of readdirSync(join(PKG, "fixtures", dir)).filter((x) => x.endsWith(".md")).sort()) {
          const file = join(dir, f), href = `${(dir ? dir + "-" : "") + f.replace(/\.(dh\.)?md$/, "")}.html`;
          const html = readFileSync(join(out, href), "utf8"), text = readFileSync(join(PKG, "fixtures", file), "utf8");
          const views = html.indexOf('<section class="ex-views"'), root = html.indexOf('<div id="dh-root">');
          expect(views, href).toBeGreaterThan(0);
          expect(views, href).toBeLessThan(root);
          const sec = html.slice(views, html.indexOf("</section>", views));
          expect(sec.match(/<details class="ex-view">/g)?.length, href).toBe(2);
          expect(sec.includes("<details open"), href).toBe(false);
          const pres = [...sec.matchAll(/<pre class="ex-view-pre"><code>([\s\S]*?)<\/code><\/pre>/g)].map((m) => unesc(m[1]));
          expect(pres[0], href).toBe(text);
          const doc = parse(text, { blocks: [taskBlock], inlines: hostInlines, path: file, ...(/references\.dh\.md$/.test(file) ? { resolveReference: exampleRefs } : {}) });
          const llm = llmView(doc).trim();
          if (llm) expect(pres[1], href).toBe(llm);
          else expect(sec.includes('class="ex-view-none"'), href).toBe(true);
          pages++;
        }
      }
      expect(pages).toBeGreaterThan(100);
    } finally { rmSync(out, { recursive: true, force: true }); }
  }, 240_000);
});
