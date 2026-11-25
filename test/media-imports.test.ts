import { expect, test } from "bun:test";
import { join } from "node:path";

test("package imports leave the host Lottie state and timers alone", () => {
  const r = Bun.spawnSync(["bun", join(import.meta.dir, "media-import-check.ts")], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode) throw new Error(r.stderr.toString());
  const { imports, control } = JSON.parse(r.stdout.toString());
  expect(imports.length).toBeGreaterThanOrEqual(4);
  for (const entry of imports) expect(entry).toMatchObject({ timers: 0, scans: 0, lottie: false, bodymovin: false, exported: true });
  expect(control.timers).toBeGreaterThan(0);
  expect(control.lottie).toBe(true);
  expect(control.bodymovin).toBe(true);
}, 60_000);
