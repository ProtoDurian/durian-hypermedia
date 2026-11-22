// No headless browser outlives the runner that started it (scripts/cdp.ts, used by the CSP check).
// Skipped when google-chrome is not installed.
import { describe, expect, test } from "bun:test";
import { spawn, which } from "bun";
import { join } from "node:path";

/** live (non-zombie) processes in a process group */
function groupAlive(pgid: number): number {
  const out = Bun.spawnSync(["ps", "-eo", "pgid=,stat="]).stdout.toString();
  return out.split("\n").filter((l) => { const [g, s] = l.trim().split(/\s+/); return Number(g) === pgid && s && !s.startsWith("Z"); }).length;
}

async function runAndEnd(how: string, kill?: "SIGKILL" | "SIGTERM" | "SIGINT") {
  const r = spawn(["bun", join(import.meta.dir, "cdp-runner.ts"), how], { stdout: "pipe", stderr: "ignore", env: { ...process.env } });
  const reader = r.stdout.getReader();
  let text = "";
  const t0 = Date.now();
  while (!/PGID (\d+)/.test(text) && Date.now() - t0 < 30000) {
    const { value, done } = await reader.read();
    if (done) break;
    text += new TextDecoder().decode(value);
  }
  const pgid = Number(/PGID (\d+)/.exec(text)?.[1]);
  expect(pgid).toBeGreaterThan(1);
  expect(groupAlive(pgid)).toBeGreaterThan(0);
  if (kill) r.kill(kill);
  await r.exited;
  let left = groupAlive(pgid);
  for (let i = 0; i < 40 && left; i++) { await Bun.sleep(100); left = groupAlive(pgid); }
  return left;
}

describe.skipIf(!which("google-chrome"))("cdp: no browser outlives its runner", () => {
  test("runner killed with SIGKILL (no handler can run): the guard kills the browser", async () => {
    expect(await runAndEnd("hang", "SIGKILL")).toBe(0);
  }, 40000);
  test("runner stopped with SIGTERM", async () => {
    expect(await runAndEnd("hang", "SIGTERM")).toBe(0);
  }, 40000);
  test("runner stopped with SIGINT (Ctrl-C)", async () => {
    expect(await runAndEnd("hang", "SIGINT")).toBe(0);
  }, 40000);
  test("runner throws", async () => {
    expect(await runAndEnd("throw")).toBe(0);
  }, 40000);
  test("runner exits without close()", async () => {
    expect(await runAndEnd("exit")).toBe(0);
  }, 40000);
  test("unhandled rejection", async () => {
    expect(await runAndEnd("reject")).toBe(0);
  }, 40000);
  test("close() ends the whole group, guard included", async () => {
    const { launch, liveBrowsers } = await import("../scripts/cdp");
    const p = await launch();
    expect(liveBrowsers()).toContain(p.pgid);
    await p.close();
    await Bun.sleep(500);
    expect(groupAlive(p.pgid)).toBe(0);
    expect(liveBrowsers()).not.toContain(p.pgid);
  }, 40000);
});
