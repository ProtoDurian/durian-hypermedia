// No HTML-string sink under the strict React entry: bundle "durian-hypermedia/react/strict" with every dependency it
// reaches (React and React DOM left out: the host ships them) and look at both the module list and the code.
// The browser half of this check is `bun run tt`: every fixture rendered under require-trusted-types-for 'script'.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PKG = resolve(import.meta.dir, "..");
const REACT = ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom/client", "react-dom/server"];
const SINK = /innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|createContextualFragment|document\.write|srcdoc/g;

async function graph(entry: string) {
  const out = mkdtempSync(join(tmpdir(), "dh-tt-"));
  try {
    const r = await Bun.build({ entrypoints: [join(PKG, entry)], target: "browser", splitting: true, outdir: out, external: REACT, metafile: true } as any);
    expect(r.success).toBe(true);
    const inputs = Object.keys((r as any).metafile.inputs as Record<string, unknown>);
    let code = "";
    for (const o of r.outputs) code += await o.text();
    return { inputs, code, sinks: code.match(SINK) ?? [] };
  } finally { rmSync(out, { recursive: true, force: true }); }
}

describe("trusted types: the strict entry's import graph", () => {
  for (const entry of ["src/react/strict.tsx", "src/react/mermaid-host.tsx", "src/react/codewalk.tsx", "src/react/containers.tsx", "src/react/document.tsx"]) {
    test(`${entry}: no mermaid, no DOMPurify, no HTML-string sink`, async () => {
      const g = await graph(entry);
      expect(g.inputs.filter((x) => /node_modules\/(mermaid|dompurify)\//.test(x))).toEqual([]);
      expect(g.inputs.some((x) => /src\/react\/mermaid\.tsx$/.test(x))).toBe(false);
      expect(g.sinks).toEqual([]);
    });
  }
  test("the package's own sources: no HTML-string sink outside the classic mermaid part", async () => {
    const glob = new Bun.Glob("src/**/*.{ts,tsx}");
    const hits: string[] = [];
    for await (const f of glob.scan(PKG)) {
      const t = await Bun.file(join(PKG, f)).text();
      if (/dangerouslySetInnerHTML|\.innerHTML\s*=|outerHTML|insertAdjacentHTML/.test(t.replace(/\/\/.*$/gm, ""))) hits.push(f);
    }
    expect(hits).toEqual([]);
  });
  test("control: the full entry does reach mermaid and DOMPurify (so the check can see them)", async () => {
    const g = await graph("src/react/index.tsx");
    expect(g.inputs.some((x) => /node_modules\/mermaid\//.test(x))).toBe(true);
    expect(g.inputs.some((x) => /node_modules\/dompurify\//.test(x))).toBe(true);
    expect(g.sinks.length).toBeGreaterThan(0);
  });
});
