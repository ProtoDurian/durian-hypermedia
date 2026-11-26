// Every ```animation fence of the repo's fixtures, read by the parse lane, runs through core without throwing:
// states, a diff per step, check and the LLM view.
import { expect, test } from "bun:test";
import { allFixtureFences } from "../parse/fixtures";
import { readModel } from "../../../src/engine/pipeline";
import { states } from "../../../src/engine/core/states";
import { diff } from "../../../src/engine/core/diff";
import { check } from "../../../src/engine/core/check";
import { llm } from "../../../src/engine/core/llm";

test("core runs on every fixture fence", () => {
  const bad: string[] = [];
  let ran = 0, refusals = 0;
  for (const f of allFixtureFences()) {
    let m;
    try { m = readModel(f.src); } catch { continue; } // the parse lane's business
    try {
      const s = states(m);
      for (let k = 1; k < s.length; k++) diff(m, s[k - 1], s[k]);
      const p = check(m, s).filter((x) => !x.warn);
      if (process.env.CORE_SMOKE) for (const x of p) if (!/no layout owns/.test(x.msg)) console.log("PROB", f.id, x.line, x.msg);
      refusals += p.length;
      llm(m, s);
      ran++;
    } catch (e) { bad.push(`${f.id}: ${(e as Error).stack?.split("\n").slice(0, 3).join(" | ")}`); }
  }
  if (process.env.CORE_SMOKE) console.log({ ran, refusals });
  expect(bad).toEqual([]);
  expect(ran).toBeGreaterThan(50);
});

test("hostile/10 (too many steps) is refused, as the old engine refuses it", async () => {
  const { fencesOf, ROOT } = await import("../parse/fixtures");
  const [f] = fencesOf(`${ROOT}/fixtures/hostile/10-animation-too-many-steps.dh.md`);
  const m = readModel(f.src);
  const p = check(m, states(m));
  expect(p.length).toBe(1);
  expect(p[0].msg).toMatch(/^\d+ steps; the limit is 200$/);
});
