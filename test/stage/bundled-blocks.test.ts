// The composed stage's head blocks (time, matrix, sheet, bins, columns, bars, ...) register themselves when their module
// is imported. package.json's sideEffects must keep those modules, or a bundler (the package's own dist build, or a
// host's) drops them and a `time:` or `matrix:` line reads as a card: the stage draws nothing.
import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileStage } from "../../src/core/stage";

const SRC = join(import.meta.dir, "../../src/core/stage.ts"), FIX = join(import.meta.dir, "../../fixtures/stage");
// the fence's setup and its steps, as the stage part hands them over
function scene(file: string) {
  const lines = readFileSync(join(FIX, file), "utf8").split("\n");
  const a = lines.findIndex((l) => /^`{3,}animation/.test(l)), b = lines.findIndex((l, i) => i > a && /^`{3,}\s*$/.test(l));
  const body = lines.slice(a + 1, b), head: string[] = [], steps: { title: string; raw: string; line: number }[] = [];
  body.forEach((l, i) => { const m = /^@step\s+(.*)$/.exec(l); if (m) steps.push({ title: m[1], raw: "", line: a + 2 + i }); else if (steps.length) steps[steps.length - 1].raw += (steps[steps.length - 1].raw ? "\n" : "") + l; else head.push(l); });
  return { head: head.join("\n"), steps };
}
const pick = (re: RegExp) => readdirSync(FIX).find((f) => re.test(f))!;

test("a bundle of the stage keeps its time and matrix blocks (the same model as the source)", () => {
  const dir = mkdtempSync(join(tmpdir(), "dh-stage-bundle-"));
  try {
    const entry = join(dir, "entry.ts");
    writeFileSync(entry, `export { compileStage } from ${JSON.stringify(SRC)};`);
    // the bundler as a process of its own (Bun.build inside the test runner resolves differently)
    const r = Bun.spawnSync([process.execPath, "build", entry, "--outdir", join(dir, "out"), "--target", "browser", "--format", "esm"], { stdout: "pipe", stderr: "pipe" });
    expect(r.exitCode).toBe(0);
    const bundled = require(join(dir, "out", "entry.js")).compileStage as typeof compileStage;
    for (const f of [pick(/-animation-time\.dh\.md$/), pick(/-a-swimlane-matrix\.dh\.md$/)]) {
      const s = scene(f), roles = { client: 1, server: 2, store: 3, job: 4, cache: 5, ops: 6, plain: 0 };
      const direct = compileStage(s.head, s.steps, 1, {}, roles), viaBundle = bundled(s.head, s.steps, 1, {}, roles);
      expect(direct.errors).toEqual([]);
      expect(viaBundle.errors).toEqual([]);
      expect(Object.keys(viaBundle.model).sort()).toEqual(Object.keys(direct.model).sort());
      expect(Object.keys(viaBundle.model.cards ?? {}).sort()).toEqual(Object.keys(direct.model.cards ?? {}).sort());
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 60_000);
