// Speech is read as said by the thing nearest it, so a bubble stands nearer its own speaker than any other thing
// (SPEC.md 6.14). The service mesh's "retries twice on failure" stood 36 px from the other proxy and 72 px from its own;
// on a phone, a packet's words stood by a network card, not by the rules that said them.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../src/index";
import { compileScene, type Box, type Rect } from "../src/core/scene";
import { phoneScene } from "../src/core/readable";

const FIX = join(import.meta.dir, "../fixtures/format");
const gap = (a: Rect, b: Rect) => Math.hypot(Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)), Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h)));
const anims = (file: string) => {
  const out: { head: string; steps: { title: string; raw: string; line: number }[]; base?: number; info?: Record<string, string> }[] = [];
  const walk = (v: unknown): void => { if (!v || typeof v !== "object") return; if (Array.isArray(v)) return v.forEach(walk); const o = v as Record<string, unknown>; if (o.type === "animation" && o.anim && !o.stage) { out.push(o.anim as (typeof out)[number]); return; } Object.values(o).forEach(walk); };
  walk(parse(readFileSync(join(FIX, file), "utf8")));
  return out;
};
// every bubble whose nearest thing (not a container, a token or a free word; not inside its speaker) is not its speaker
const misread = (file: string) => {
  const out: string[] = [];
  for (const a of anims(file)) {
    const wide = compileScene(a.head, a.steps, a.base ?? 1, a.info ?? {});
    for (const [lay, c] of [["laptop", wide], ["phone", phoneScene(wide, false)], ["narrow", phoneScene(wide, true)]] as const) {
      c?.frames.forEach((f, k) => {
        for (const m of f.marks.filter((x) => x.kind === "say")) {
          const sp = f.boxes.find((b) => b.key === m.at)!, own: Rect = sp.lbl ? { x: Math.min(sp.x, sp.lbl.x), y: Math.min(sp.y, sp.lbl.y), w: Math.max(sp.x + sp.w, sp.lbl.x + sp.lbl.w) - Math.min(sp.x, sp.lbl.x), h: Math.max(sp.y + sp.h, sp.lbl.y + sp.lbl.h) - Math.min(sp.y, sp.lbl.y) } : sp;
          const inSp = (b: Box) => b.x >= sp.x && b.y >= sp.y && b.x + b.w <= sp.x + sp.w && b.y + b.h <= sp.y + sp.h;
          const nearer = f.boxes.filter((b) => b.key !== sp.key && b.key > 0 && !b.hidden && !b.container && b.kind !== "token" && b.kind !== "text" && !inSp(b) && gap(m.r, b) < gap(m.r, own) - 0.5);
          if (nearer.length) out.push(`${lay} step ${k + 1}: "${m.text}" nearer ${nearer.map((b) => b.label).join(", ")} than ${sp.label}`);
        }
      });
    }
  }
  return out;
};

describe("speech stands by its own speaker", () => {
  for (const pre of ["53-", "64-", "66-", "73-"]) {
    const file = readdirSync(FIX).find((x) => x.startsWith(pre))!;
    test(`${file}: no bubble is nearer another thing than the thing that says it`, () => {
      expect(misread(file)).toEqual([]);
    });
  }
});
