// Trusted Types and references (format version 11): the React entries a host uses without interactive parts never reach
// the interactive entry, the only module that sets a frame's page (srcdoc) and makes a Trusted Types policy.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const run = (entries: string[]) => {
  const r = Bun.spawnSync(["bun", join(import.meta.dir, "refs-graph.ts"), ...entries], { cwd: join(import.meta.dir, ".."), env: { ...process.env } });
  return JSON.parse(r.stdout.toString()) as Record<string, { ok: boolean; inputs: string[]; code: string }>;
};

describe("trusted types: only the interactive entry sets a frame's page", () => {
  test("the strict and full entries never reach react/interactive.tsx; it alone names srcdoc and the dh-interactive policy", () => {
    const g = run(["src/react/strict.tsx", "src/react/index.tsx", "src/react/document.tsx", "src/react/reference.tsx", "src/react/interactive.tsx"]);
    for (const e of ["src/react/strict.tsx", "src/react/index.tsx", "src/react/document.tsx", "src/react/reference.tsx"]) {
      expect(g[e].ok).toBe(true);
      expect(g[e].inputs.some((x) => /react\/interactive\.tsx$/.test(x))).toBe(false);
      expect(g[e].code).not.toMatch(/srcdoc|dh-interactive/);
    }
    const strict = g["src/react/strict.tsx"].code;
    expect(strict).not.toMatch(/createPolicy/);
    const ix = g["src/react/interactive.tsx"];
    expect(ix.ok).toBe(true);
    expect(ix.code).toMatch(/srcdoc/);
    expect(ix.code).toMatch(/createPolicy\("dh-interactive"/);
    expect(ix.code).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
  }, 60_000);
});
