// Bundle React entries and print what each reaches, as JSON (run by test/refs-tt.test.ts in a process of its own: under
// bun test, Bun.build can fail to read files the test process has open).
//   bun test/refs-graph.ts src/react/strict.tsx src/react/interactive.tsx
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PKG = resolve(import.meta.dir, "..");
const REACT = ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom/client", "react-dom/server"];
const out: Record<string, { ok: boolean; inputs: string[]; code: string }> = {};
for (const entry of process.argv.slice(2)) {
  const dir = mkdtempSync(join(tmpdir(), "dh-refs-graph-"));
  try {
    const r: any = await Bun.build({ entrypoints: [join(PKG, entry)], target: "browser", splitting: true, outdir: dir, external: REACT, metafile: true } as any);
    let code = "";
    if (r.success) for (const o of r.outputs) code += await o.text();
    out[entry] = { ok: !!r.success, inputs: r.success ? Object.keys(r.metafile.inputs) : [], code };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
process.stdout.write(JSON.stringify(out));
