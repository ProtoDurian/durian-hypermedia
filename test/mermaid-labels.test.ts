// Mermaid labels survive the cleaning: a real flowchart drawn in headless Chrome, every node keeps its text, no
// foreignObject. Skipped when Chrome is not installed (bun run csp checks every diagram page the same way).
import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

const PKG = resolve(import.meta.dir, "..");
const chrome = Bun.which("google-chrome");
const built = existsSync(join(PKG, "example/dist/format-10-diagram.html"));
describe.skipIf(!chrome || !built)("mermaid labels in the browser (needs Chrome and bun example/build.tsx)", () => {
  test("a flowchart's labels survive DOMPurify, as SVG text", async () => {
    const { launch } = await import("../scripts/cdp");
    const port = 5100 + Math.floor(Math.random() * 200);
    const srv = Bun.spawn(["bun", join(PKG, "example/serve.ts"), join(PKG, "example/dist"), String(port)], { stdout: "ignore", stderr: "ignore" });
    await Bun.sleep(700);
    const p = await launch();
    try {
      await p.goto(`http://127.0.0.1:${port}/format-10-diagram.html`);
      for (let k = 0; k < 40 && !(await p.eval<boolean>(`!!document.querySelector(".dh-doc .diagram.is-drawn svg")`)); k++) await p.sleep(250);
      const r = await p.eval<{ nodes: string[]; fo: number }>(`(() => { const s = document.querySelector(".dh-doc .diagram.is-drawn svg"); return { nodes: [...s.querySelectorAll("g.node")].map((g) => g.textContent.trim()), fo: s.querySelectorAll("foreignObject").length }; })()`);
      expect(r.nodes.length).toBeGreaterThan(1);
      for (const t of r.nodes) expect(t.length).toBeGreaterThan(0);
      expect(r.nodes).toContain("CLI");
      expect(r.fo).toBe(0);
    } finally { await p.close(); srv.kill(); }
  }, 60_000);
});
