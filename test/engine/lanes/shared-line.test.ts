// eng-lanes2: two relations the lanes stage draws as one line (a pair and its reverse) are stroked once: the second is
// an `eng-shared` prim (no stroke in engine.css) that keeps its arrowhead and carries its own dot (run its own way).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compile, sharedKey } from "../../../src/engine/pipeline";
import { fencesOf, ROOT } from "../parse/fixtures";

const cases: [string, number][] = [["05-dns-lookup", 1280], ["05-dns-lookup", 390], ["02-tcp-handshake", 390], ["03-oauth-login", 390], ["10-payment-refund", 390], ["11-cache-stampede", 390]];

describe("lanes: a line two relations share is drawn once", () => {
  for (const [name, w] of cases) test(`gt ${name} at ${w}`, () => {
    const [fe] = fencesOf(join(ROOT, "fixtures/gt", name + ".dh.md")), c = compile(fe.src), p = c.plan(w);
    let shared = 0;
    for (let k = 1; k < c.states.length; k++) {
      const lines = p.frame(k).filter((q): q is Extract<typeof q, { k: "path" }> => q.k === "path" && q.key.startsWith("rel:"));
      const stroked = new Map<string, string>();
      for (const q of lines) {
        const key = sharedKey(q.d)!, isShared = /(^|\s)eng-shared(\s|$)/.test(q.cls ?? "");
        if (isShared) { shared++; expect(stroked.has(key)).toBe(true); expect(q.arrow).toBe("end"); continue; }
        expect(stroked.has(key) ? `${stroked.get(key)} and ${q.key} both stroked at step ${k}` : "").toBe("");
        stroked.set(key, q.key);
      }
    }
    expect(shared).toBeGreaterThan(0);
  });
  test("the sheet hides only the shared line's stroke (its arrowhead is a filled path)", () => {
    expect(readFileSync(join(ROOT, "src/engine/render/engine.css"), "utf8")).toContain(".eng g.eng-shared > path.stg-line { stroke: none; }");
  });
  test("sharedKey: the same line run either way has one key", () => {
    expect(sharedKey("M10 20C30 20 30 80 50 80")).toBe(sharedKey("M50 80C30 80 30 20 10 20"));
    expect(sharedKey("M10 20L50 80")).not.toBe(sharedKey("M10 20L50 81.6"));
  });
});
