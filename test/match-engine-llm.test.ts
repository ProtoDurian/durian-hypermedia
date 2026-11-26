// gate3: `scripts/match.ts --engine <old|new>` names the engine on parse as well as on the renderer, so the saved LLM view is the engine's.
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PKG = resolve(import.meta.dir, "..");
const llmOf = (engine: "old" | "new") => {
  const out = mkdtempSync(join(tmpdir(), `match-llm-${engine}-`));
  try {
    const r = Bun.spawnSync(["bun", "scripts/match.ts", "--only", "gt/06-merge-sort*", "--width", "390", "--engine", engine, "--jobs", "1", "--out", out], { cwd: PKG, stdout: "pipe", stderr: "pipe" });
    expect(r.exitCode).toBe(0);
    const files = readdirSync(join(out, "llm"));
    expect(files.length).toBe(1);
    return readFileSync(join(out, "llm", files[0]!), "utf8");
  } finally { rmSync(out, { recursive: true, force: true }); }
};

test("match.ts: the saved LLM view is of the engine named (old and new differ on the merge-sort fence)", () => {
  const old = llmOf("old"), neu = llmOf("new");
  expect(old.length).toBeGreaterThan(50);
  expect(neu.length).toBeGreaterThan(50);
  expect(old).not.toBe(neu);
  expect(neu).toContain("Animation, 5 steps"); // the new engine's own LLM view
  expect(old).not.toContain("Animation, 5 steps");
}, 200_000);
