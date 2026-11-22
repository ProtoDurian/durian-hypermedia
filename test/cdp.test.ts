// No headless browser, and no browser profile dir, outlives the runner that started it (scripts/cdp.ts, used by the CSP check).
// The browser tests are skipped when google-chrome is not installed, or with DH_CDP_TEST=0.
import { describe, expect, test } from "bun:test";
import { spawn, which } from "bun";
import { existsSync, mkdirSync, readdirSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isOwnProfileDir } from "../scripts/cdp";

/** live (non-zombie) processes in a process group */
function groupAlive(pgid: number): number {
  const out = Bun.spawnSync(["ps", "-eo", "pgid=,stat="]).stdout.toString();
  return out.split("\n").filter((l) => { const [g, s] = l.trim().split(/\s+/); return Number(g) === pgid && s && !s.startsWith("Z"); }).length;
}
/** live processes anywhere whose command line names the dir (catches helpers that left the group, like a crash reporter) */
function namingDir(dir: string): number {
  const out = Bun.spawnSync(["ps", "-eo", "stat=,args="]).stdout.toString();
  return out.split("\n").filter((l) => l.includes(dir) && !l.trim().startsWith("Z") && !l.includes("dh-cdp-guard")).length;
}

async function runAndEnd(how: string, kill?: "SIGKILL" | "SIGTERM" | "SIGINT") {
  const r = spawn(["bun", join(import.meta.dir, "cdp-runner.ts"), how], { stdout: "pipe", stderr: "ignore", env: { ...process.env } });
  const reader = r.stdout.getReader();
  let text = "";
  const t0 = Date.now();
  while (!/PGID (\d+) DIR (\S+)/.test(text) && Date.now() - t0 < 30000) {
    const { value, done } = await reader.read();
    if (done) break;
    text += new TextDecoder().decode(value);
  }
  const m = /PGID (\d+) DIR (\S+)/.exec(text);
  const pgid = Number(m?.[1]);
  const dir = m?.[2] ?? "";
  expect(pgid).toBeGreaterThan(1);
  expect(isOwnProfileDir(dir)).toBe(true);
  expect(groupAlive(pgid)).toBeGreaterThan(0);
  expect(existsSync(dir)).toBe(true);
  if (kill) r.kill(kill);
  await r.exited;
  // the guard polls once a second, then waits for the group to die: allow 8 s
  for (let i = 0; i < 80 && (groupAlive(pgid) || existsSync(dir) || namingDir(dir)); i++) await Bun.sleep(100);
  return { procs: groupAlive(pgid), dirLeft: existsSync(dir), naming: namingDir(dir) };
}

const clean = { procs: 0, dirLeft: false, naming: 0 };
// These start real Chrome.
const withBrowser = !!which("google-chrome") && process.env.DH_CDP_TEST !== "0";

describe.skipIf(!withBrowser)("cdp: no browser and no profile dir outlives its runner", () => {
  test("runner killed with SIGKILL (no handler can run): the guard kills the browser and removes its dir", async () => {
    expect(await runAndEnd("hang", "SIGKILL")).toEqual(clean);
  }, 40000);
  test("runner stopped with SIGTERM", async () => {
    expect(await runAndEnd("hang", "SIGTERM")).toEqual(clean);
  }, 40000);
  test("runner stopped with SIGINT (Ctrl-C)", async () => {
    expect(await runAndEnd("hang", "SIGINT")).toEqual(clean);
  }, 40000);
  test("runner throws", async () => {
    expect(await runAndEnd("throw")).toEqual(clean);
  }, 40000);
  test("runner exits without close()", async () => {
    expect(await runAndEnd("exit")).toEqual(clean);
  }, 40000);
  test("unhandled rejection", async () => {
    expect(await runAndEnd("reject")).toEqual(clean);
  }, 40000);
  test("close() ends the whole group, guard included, and removes the dir", async () => {
    const { launch, liveBrowsers } = await import("../scripts/cdp");
    const p = await launch();
    expect(liveBrowsers()).toContain(p.pgid);
    expect(existsSync(p.profileDir)).toBe(true);
    // Chrome's own temp dirs (com.google.Chrome.*) land inside the profile, not in the shared temp dir: read what Chrome wrote
    // (/proc/<pid>/environ cannot show it: Chrome writes its process title over that memory)
    await p.goto("data:text/html,<p>tmp</p>");
    let own: string[] = [];
    for (let i = 0; i < 50 && !own.length; i++) { own = readdirSync(p.profileDir).filter((n) => /com\.google\.Chrome\./.test(n)); if (!own.length) await Bun.sleep(100); }
    expect(own.length).toBeGreaterThan(0);
    await p.close();
    await Bun.sleep(500);
    expect(groupAlive(p.pgid)).toBe(0);
    expect(existsSync(p.profileDir)).toBe(false);
    expect(namingDir(p.profileDir)).toBe(0);
    expect(liveBrowsers()).not.toContain(p.pgid);
  }, 40000);
});

describe("cdp: the clean-up removes only its own profile dir", () => {
  test("only a direct child of the temp dir named dh-cdp- and 6 letters or digits counts", () => {
    const t = tmpdir();
    expect(isOwnProfileDir(join(t, "dh-cdp-a1B2c3"))).toBe(true);
    for (const bad of ["", "/", t, join(t, "dh-cdp-"), join(t, "dh-cdp-*"), join(t, "dh-cdp-abc"), join(t, "dh-cdp-abcdefg"),
      join(t, "x", "dh-cdp-abcdef"), join(t, "dh-cdp-abcdef", ".."), "dh-cdp-abcdef", join(t, "other-abcdef"), "/opt/dh-cdp-abcdef"])
      expect(isOwnProfileDir(bad)).toBe(false);
  });
  test.skipIf(!withBrowser)("a sibling dir that only looks similar is left alone after a run", async () => {
    const sib = join(tmpdir(), `dh-cdp-test-${process.pid}`); // not mkdtemp's shape: must survive
    mkdirSync(sib);
    try {
      expect(await runAndEnd("hang", "SIGKILL")).toEqual(clean);
      expect(existsSync(sib)).toBe(true);
    } finally { rmdirSync(sib); }
  }, 40000);
});

describe.skipIf(!withBrowser)("cdp: the profile stays small while it lives", () => {
  test("after a page load the profile is under 40 MB (was about 150 MB)", async () => {
    const { launch } = await import("../scripts/cdp");
    const p = await launch();
    try {
      await p.goto("data:text/html,<h1>small</h1>");
      await Bun.sleep(3000);
      const kb = Number(Bun.spawnSync(["du", "-sk", p.profileDir]).stdout.toString().split(/\s/)[0]);
      expect(kb).toBeLessThan(40 * 1024);
    } finally { await p.close(); }
    expect(existsSync(p.profileDir)).toBe(false);
  }, 40000);
});
