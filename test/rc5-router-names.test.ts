// 0.7.0-rc.5 (rc.4 fresh review, MUST 2 + SHOULD 4): in "a message through a router, in segments" (Format fixture 68) the
// segments were nameless: the one-focus rule (core/calm.ts tokenSubject) muted every token on a step about no token (the
// zoom, the lit table row) and on a step whose last line named a token that had left (`drop msg.4`), and a muted token
// drew an empty pill in 2D and no word in 3D. Now a step about no token keeps every name, a muted token keeps its number
// ("seg 3": 3), and while a step plays in 3D the things its caption names keep their names (the routing table, port 2).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { captionNamed, tokenMark, tokenSubject } from "../src/core/calm";
import { compileScene } from "../src/core/scene";

const ROOT = join(import.meta.dir, "..");
const md = readFileSync(join(ROOT, "fixtures/format/68-3d-a-message-through-a-router-in-segments.dh.md"), "utf8");
const fence = /^```animation([^\n]*)\n([\s\S]*?)^```$/m.exec(md)!;
const [head, ...rest] = fence[2].split(/^@step /m);
const steps = rest.map((r, k) => { const [t, ...b] = r.split("\n"); return { title: t.trim(), raw: b.join("\n"), line: 100 * (k + 1) }; });
const c = compileScene(head, steps, 1, { view: "3d" });
const ids = new Set<string>(c.frames.flatMap((f) => f.boxes.filter((b) => b.kind === "token").map((b) => b.id)));
// what a reader sees on each token at rest: its label, its number, or nothing
const seen = (k: number) => {
  const f = c.frames[k - 1], s = tokenSubject(f, steps[k - 1].raw, ids);
  return f.boxes.filter((b) => b.kind === "token" && !(b as { hidden?: boolean }).hidden)
    .map((b) => [b.id, !s || s.includes(b.key) ? b.label : tokenMark(b.id, b.label)] as const);
};

describe("the router's segments keep their names (rc.5 MUST 2, SHOULD 4)", () => {
  test("the fixture compiles", () => expect(c.errors).toEqual([]));
  test("no token on any step is drawn without a word or its number", () => {
    const empty = steps.flatMap((_, k) => seen(k + 1).filter(([, w]) => !w).map(([id]) => `step ${k + 1}: ${id}`));
    expect(empty).toEqual([]);
  });
  test("steps 3 to 5 (the zoom, the full queue, the lit row) show every segment's full name", () => {
    for (const k of [3, 4, 5]) for (const [id, w] of seen(k)) expect(`${id} ${w}`).toMatch(/ seg \d$/);
  });
  test("step 7 ('segment 3 waits its turn'): segment 3 shows at least its number", () => {
    expect(seen(7).find(([id]) => id === "msg.3")?.[1]).toMatch(/3$/);
  });
  test("a muted token keeps its number; one with no number has none", () => {
    expect(tokenMark("msg.3", "seg 3")).toBe("3");
    expect(tokenMark("a", "packet 12")).toBe("12");
    expect(tokenMark("ack", "ACK")).toBe("");
    expect(tokenMark("v2x", "v2x")).toBe("");
  });
  test("step 5's caption names the routing table and port 2, so they keep their names while it plays in 3D", () => {
    const f = c.frames[4], got = captionNamed(f.boxes, steps[4].title).map((q) => f.boxes.find((b) => b.key === q)!.label);
    expect(got).toContain("routing table");
    expect(got).toContain("port 2");
    expect(captionNamed(f.boxes, "nothing named here")).toEqual([]);
  });
  test("the 2D and 3D stages draw the number, and the caption's names join who takes part", () => {
    const a = readFileSync(join(ROOT, "src/ui/anim.tsx"), "utf8"), t = readFileSync(join(ROOT, "src/ui/anim3d.ts"), "utf8");
    expect(a).toContain("{mark || (b.lines[0] ?? b.label)}");
    expect(a).toContain("captionNamed(B.boxes,");
    expect(t).toContain("tokenMark(it.id, it.label");
  });
});
