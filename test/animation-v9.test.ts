// Format version 9: things a step does not change stay still, lines have room, beats, pace, spotlight, camera words,
// tokens that split, queue and merge, and a closed thing the story zooms into. Every Format fixture is replayed.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, check, FORMAT_VERSION } from "../src/index";
import { compileScene, phoneInfo, connGeom, sampleGeom, storyView, cutBy, pad, MARGIN, MIN_LINE } from "../src/core/scene";
import { stillCheck } from "../src/core/still9";

const FIX = join(import.meta.dir, "../fixtures/format");
const scene = (src: string) => {
  const [head, ...rest] = src.split(/^@step /m);
  return compileScene(head, rest.map((r, k) => { const [title, ...body] = r.split("\n"); return { title, raw: body.join("\n"), line: 100 + k * 10 }; }), 1);
};
const page = (body: string) => `---\ntitle: T\ndescription: D\n---\n\n## A\n\n\`\`\`animation\n${body}\n\`\`\`\n`;
const errors = (body: string) => check(parse(page(body), { path: "t.dh.md" })).filter((p) => p.level === "error").map((p) => p.message).join(" | ");
// every animation fence of every Format fixture, as the scene compiler reads it
const fences = (): { name: string; c: ReturnType<typeof compileScene>; info: Record<string, string>; head: string; steps: { title: string; raw: string; line: number }[] }[] => {
  const out = [];
  for (const f of readdirSync(FIX).filter((x) => x.endsWith(".dh.md"))) {
    const t = readFileSync(join(FIX, f), "utf8");
    for (const m of t.matchAll(/^```animation([^\n]*)\n([\s\S]*?)^```$/gm)) {
      const info: Record<string, string> = {};
      for (const w of m[1].trim().split(/\s+/).filter(Boolean)) { const [k, v] = w.split("="); if (v) info[k] = v; else if (k === "3d" || k === "2d") info.view = k; }
      const [head, ...rest] = m[2].split(/^@step /m);
      const steps = rest.map((r, k) => { const [title, ...body] = r.split("\n"); return { title: title.trim(), raw: body.join("\n"), line: 10 + k }; });
      out.push({ name: f, c: compileScene(head, steps, 1, info), info, head, steps });
    }
  }
  return out;
};

describe("format version 9", () => {
  test("the format number", () => expect(FORMAT_VERSION).toBe(9));
  const all = fences();
  test("the fixtures hold the new samples", () => {
    expect(all.length).toBeGreaterThanOrEqual(24);
    expect(all.some((x) => x.name.includes("message-through-a-router"))).toBe(true);
    expect(all.some((x) => x.name.includes("author-sets-the-beat"))).toBe(true);
  });
  test("every fixture scene compiles with no error", () => {
    expect(all.flatMap((x) => x.c.errors.map((e) => `${x.name}: ${e.msg}`))).toEqual([]);
  });
  test("nothing a step does not change moves, wide and on a phone", () => {
    const bad: string[] = [];
    for (const x of all) {
      const phone = compileScene(x.head, x.steps, 1, phoneInfo(x.c, x.info, 324));
      for (const c of [x.c, phone]) bad.push(...stillCheck(c).map((v) => `${x.name} step ${v.step}: ${v.id}`));
    }
    expect(bad).toEqual([]);
  });
  test(`every line shows at least ${MIN_LINE} units`, () => {
    const short: string[] = [];
    const len = (p: { x: number; y: number }[]) => p.slice(1).reduce((a, q, i) => a + Math.hypot(q.x - p[i].x, q.y - p[i].y), 0);
    for (const x of all) for (const f of x.c.frames) {
      const by = new Map(f.boxes.map((b) => [b.key, b]));
      for (const e of f.edges) { const a = by.get(e.from)!, b = by.get(e.to)!; if (len(sampleGeom(connGeom(a, b, a.kind, b.kind, e.implicit, 0, e.bend))) < MIN_LINE) short.push(`${x.name}: ${a.id} -> ${b.id}`); }
    }
    expect([...new Set(short)]).toEqual([]);
  });
  test("the laptop view cuts nothing in half and stays within the scene", () => {
    const bad: string[] = [];
    const ar = 700 / 466;
    for (const x of all) x.c.frames.forEach((f, i) => {
      const v = storyView(f, ar, 700), S = pad(f.bounds, MARGIN);
      const past = (v.x < S.x - 1 && v.x + v.w < S.x + S.w - 1) || (v.x + v.w > S.x + S.w + 1 && v.x > S.x + 1) || (v.y < S.y - 1 && v.y + v.h < S.y + S.h - 1) || (v.y + v.h > S.y + S.h + 1 && v.y > S.y + 1);
      if (cutBy(f, v).length || past) bad.push(`${x.name} step ${i + 1}`);
    });
    expect(bad).toEqual([]);
  });
  test("a lift moves; the rooms stay", () => {
    const c = scene(`layer f2 "2"\nlayer f1 "1"\ngroup a layer=f2\ngroup b layer=f1\ngroup lift "lift" in a\nbox desk "desk" in a\nbox gym "gym" in b\n@step one\nsplit layers\n@step down\nmove lift to b\n@step up\nmove lift to a`);
    const at = (k: number, id: string) => c.frames[k].boxes.find((b) => b.id === id)!;
    for (const id of ["desk", "gym"]) for (const k of [1, 2]) expect([at(k, id).x, at(k, id).y]).toEqual([at(0, id).x, at(0, id).y]);
  });
  test("then: beats with their own frames; pace, spotlight, say above, path=arc", () => {
    const c = scene(`group g\ngroup h\nbox x in g\n@step one\npace slow\nspotlight x\nsay x above: hi\n@step two\nadd box p in g\nthen\nmove p to h path=arc`);
    expect(c.errors).toEqual([]);
    expect([c.fx[0].pace, c.fx[1].beats]).toEqual(["slow", 2]);
    expect(c.beats![1][0].boxes.find((b) => b.id === "p")!.ent.parent).toBe("g");
    expect(c.frames[1].boxes.find((b) => b.id === "p")!.ent.parent).toBe("h");
    expect(c.fx[1].arc).toEqual(["p"]);
  });
  test("camera words, split, merge, drop and zoom compile", () => {
    const c = scene(`box a\ngroup r "router" closed=yes\nqueue q "queue" in r\nbox b\ntoken msg "message" at a\n@step Split.\nsplit msg into 3 "seg"\n@step In.\nzoom into r\nmove msg.1 msg.2 msg.3 into q\n@step One is lost.\ndrop msg.3 at b\n@step Out.\nzoom out\ncamera all far\n@step Back.\nadd token msg.3 "seg 3" at a\n@step Joined.\nmove msg.1 msg.2 msg.3 to b\n@step Whole.\nmerge msg\ncamera b close turn=left tilt=low`);
    expect(c.errors).toEqual([]);
  });
  test("doccheck refuses the new words used wrongly", () => {
    expect(errors(`box a\n@step one\nthen\nhighlight a\n@step two\nhighlight a`)).toContain("then starts the next beat");
    expect(errors(`box a\n@step one\npace quick\n@step two\nhighlight a`)).toContain("pace is slow, normal or fast");
    expect(errors(`box a\n@step one\nsay a top: hi\n@step two\nhighlight a`)).toContain("above, below, left or right");
    expect(errors(`box a\n@step one\ncamera all close\n@step two\nhighlight a`)).toMatch(/close/);
    expect(errors(`box a\ntoken t "x" at a\n@step one\nsplit t into 9\n@step two\nhighlight a`)).toMatch(/8/);
  });
});
