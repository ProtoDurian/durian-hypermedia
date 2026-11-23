// A token sent into a queue, a stack or a list becomes its item (SPEC 6.15): pop, move, split and drop work on it.
import { describe, expect, test } from "bun:test";
import { compileScene, type Compiled } from "../src/core/scene";

const scene = (src: string): Compiled => {
  const head: string[] = [], steps: { title: string; raw: string; line: number }[] = [];
  src.split("\n").forEach((l, i) => { const m = l.match(/^@step\s*(.*)$/); if (m) steps.push({ title: m[1], raw: "", line: i }); else if (steps.length) steps[steps.length - 1].raw += (steps[steps.length - 1].raw ? "\n" : "") + l; else head.push(l); });
  return compileScene(head.join("\n"), steps, 0, {});
};
const msgs = (c: Compiled) => c.errors.map((e) => e.msg).join(" | ");
const box = (c: Compiled, k: number, id: string) => c.frames[k].boxes.find((b) => b.id === id)!;
const size = (r: { w: number; h: number }) => [Math.round(r.w), Math.round(r.h)];
const inBox = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

describe("a token sent into a container becomes its item", () => {
  const base = (kind: string, first: string) => `box a\nbox b\n${kind} q "q"${first}\n${kind} r "r"\na -> q\nq -> b\n@step one\n`;
  const sent = 'send "seg 1" a -> q as m', pushed = 'push q "seg 1" as m';

  for (const kind of ["queue", "stack", "list"]) for (const first of ["", ": job"]) {
    test(`${kind}${first ? " with an item" : ""}: the same size and place as a pushed item`, () => {
      const run = (arrive: string) => scene(`${base(kind, first)}${arrive}\n@step two\nhighlight q`);
      const s = run(sent), p = run(pushed);
      expect(msgs(s)).toBe("");
      for (const id of ["q", "m"]) expect(size(box(s, 1, id))).toEqual(size(box(p, 1, id)));
      expect(inBox(box(s, 1, "m"), box(s, 1, "q"))).toBe(true);
      const rel = (c: Compiled) => [Math.round(box(c, 1, "m").x - box(c, 1, "q").x), Math.round(box(c, 1, "m").y - box(c, 1, "q").y)];
      expect(rel(s)).toEqual(rel(p));
    });
  }

  test("it stays an item when popped or moved to another queue, and turns back into a chip at a plain thing", () => {
    for (const take of ["pop q to r", "move m into r"]) {
      const s = scene(`${base("queue", "")}${sent}\n@step two\n${take}`), p = scene(`${base("queue", "")}${pushed}\n@step two\n${take}`);
      expect(msgs(s)).toBe("");
      expect(size(box(s, 1, "m"))).toEqual(size(box(p, 1, "m")));
      expect(inBox(box(s, 1, "m"), box(s, 1, "r"))).toBe(true);
    }
    for (const take of ["pop q to b", "move m to b"]) {
      const s = scene(`${base("queue", "")}${sent}\n@step two\n${take}`);
      expect(msgs(s)).toBe("");
      expect(box(s, 1, "m").h).toBeLessThan(30);
    }
  });

  test("split gives items, drop takes it out", () => {
    const s = scene(`${base("queue", "")}${sent}\n@step two\nsplit m into m1 m2`);
    const p = scene(`${base("queue", "")}${pushed}\n@step two\nsplit m into m1 m2`);
    expect(msgs(s)).toBe("");
    for (const id of ["m1", "m2"]) expect(size(box(s, 1, id))).toEqual(size(box(p, 1, id)));
    expect(msgs(scene(`${base("queue", "")}${sent}\n@step two\ndrop m`))).toBe("");
  });

  test("pop or move of a send without as says how to fix it", () => {
    const fix = "give the send an id (send ... as <id>) to move it later";
    for (const take of ["pop q", "pop q to r", "move m into r", "move m to b", "split m into m1 m2", "drop m"]) {
      const c = scene(`${base("queue", "")}send "seg 1" a -> q\n@step two\n${take}`);
      expect(msgs(c)).toContain(fix);
      expect(c.errors[0].line).toBeGreaterThan(7);
    }
  });

  test("the hint is only for a send: a queue that never got one is plainly empty", () => {
    const c = scene(`${base("queue", "")}highlight q\n@step two\npop q`);
    expect(msgs(c)).toContain("is empty");
    expect(msgs(c)).not.toContain("give the send an id");
  });
});


describe("an arrived item leaves no dot behind", () => {
  test("a send with as into a queue lands", () => {
    const c = scene('box a\nqueue q "q"\na -> q\n@step one\nsend "seg 1" a -> q as m\n@step two\nhighlight q');
    expect(c.frames[0].sends[0].landed).toBe(true);
  });
});
