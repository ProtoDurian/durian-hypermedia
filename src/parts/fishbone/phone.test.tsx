// The fishbone on a phone (390 and 360 px wide pages): one column, every word left to right, thick bones, nothing wider
// than the drawing, and never a slanted line or a turned word. The wide shape is pinned unchanged beside it.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../../index";
import { UI } from "../../ui/ui";
import { textW } from "../kit/text";
import type { PartBlock, PartViewProps } from "../types";
import type { FishSpec } from "./part";
import View from "./view";
import { FISH, NARROW, layoutFish } from "./layout";

const SRC = '# Why\n\n```fishbone static title="Why is checkout slow?"\neffect: Checkout takes 4 seconds at p95\nPeople: on-call is new to the service and nobody has read the runbook this quarter\nProcess: no load test before a release\n  only staging has real data\n  the data is a year old\nTools: the ORM loads every line item\n  one query per line\nEnvironment: the database is in another region\nBuild: a very long category name that needs two lines\nNetwork: packets\n```';
const block = parse(SRC, { path: "p.dh.md" }).blocks.find((b) => b.type === "fishbone") as PartBlock<FishSpec>;
const draw = (width: number) => renderToStaticMarkup(<View {...({ block, data: block.data, static: "", ui: UI.en, stage: { width, theme: "light", motion: "off", report() {} } } satisfies PartViewProps<FishSpec>)} />);
// the stage is the page minus the page's 16 px side gutters and the box's border: 358 px on a 390 page, 328 on a 360 page
const STAGES = [358, 328];

describe("fishbone on a phone: layout", () => {
  const L = layoutFish(block.data, "narrow");
  test("every line of every word sits inside the drawing, at the font size the wide shape uses", () => {
    for (const b of L.bones) {
      expect(b.chip.x + b.chip.w).toBeLessThanOrEqual(L.w);
      for (const t of b.chip.text) expect(b.chip.x + 10 + textW(t, FISH.font)).toBeLessThanOrEqual(b.chip.x + b.chip.w);
      for (const c of b.causes) {
        expect(c.anchor).toBe("start");
        for (const t of c.lines) expect(c.x + textW(t, FISH.font)).toBeLessThanOrEqual(L.w);
        for (const s of c.subs) for (const t of s.lines) expect(c.x + 8 + textW(t, FISH.font)).toBeLessThanOrEqual(L.w + 0.5);
      }
    }
    for (const t of L.head.lines) expect(L.head.x + 10 + textW(t, FISH.font)).toBeLessThanOrEqual(L.head.x + L.head.w);
  });
  test("a bone runs level from the spine to its name, a rail drops from the name, and the causes hang on the rail", () => {
    for (const b of L.bones) {
      expect(b.y0).toBe(b.y1);
      expect(b.x0).toBe(NARROW.spine);
      expect(b.rail).toBeDefined();
      const [rx, ry0, ry1] = b.rail!;
      expect(rx).toBeGreaterThan(b.x1);
      expect(ry0).toBeGreaterThanOrEqual(b.chip.y + 24);
      for (const c of b.causes) { expect(c.tx).toBe(rx); expect(c.by).toBeGreaterThan(ry0); expect(c.by).toBeLessThanOrEqual(ry1 + 4); expect(c.x).toBeGreaterThanOrEqual(rx + 12); }
    }
  });
  test("categories come down the spine in order, none over another, the effect last", () => {
    let bottom = 0;
    for (const b of L.bones) { expect(b.chip.y).toBeGreaterThanOrEqual(bottom); bottom = b.rail![2]; }
    expect(L.head.y).toBeGreaterThanOrEqual(bottom);
    expect(L.spine[3]).toBeGreaterThanOrEqual(L.head.y);
    expect(L.h).toBeGreaterThanOrEqual(L.head.y + L.head.h);
  });
  test("the drawing is never scaled below the wide shape's font on a 390 or a 360 page", () => {
    for (const stage of STAGES) expect(FISH.font * (stage / L.minW)).toBeGreaterThanOrEqual(13);
  });
});

describe("fishbone on a phone: what is drawn", () => {
  for (const stage of STAGES) test(`stage ${stage}: only the phone shape, level and upright`, () => {
    const html = draw(stage);
    expect(html).toContain("fish-narrow");
    expect(html).not.toContain("fish-wide");
    expect(html).not.toMatch(/rotate\(|transform=/);
    for (const m of html.matchAll(/<line[^>]*class="fish-line"[^>]*>/g)) {
      const a = (n: string) => +(m[0].match(new RegExp(`${n}="([\\d.]+)"`)) ?? [, NaN])[1]!;
      expect(a("y1")).toBe(a("y2"));
    }
    const rails = [...html.matchAll(/<line[^>]*class="fish-rail"[^>]*>/g)];
    expect(rails.length).toBe(block.data.categories.length);
    for (const m of rails) expect(m[0].match(/x1="([\d.]+)"/)![1]).toBe(m[0].match(/x2="([\d.]+)"/)![1]);
    for (const c of ["Tools", "Environment", "only staging has real data"]) expect(html).toContain(c);
  });
  test("a wide stage still draws the wide shape and the old narrow-only parts stay out of it", () => {
    const html = draw(800);
    expect(html).toContain("fish-wide");
    expect(html).not.toContain("fish-narrow");
    expect(html).not.toContain("fish-rail");
  });
});

describe("fishbone on a phone: the stroke widths", () => {
  const css = readFileSync(join(import.meta.dir, "style.css"), "utf8");
  const width = (sel: string) => { const m = css.match(new RegExp(`${sel.replace(/[.\-]/g, "\\$&")}\\s*\\{[^}]*stroke-width:\\s*([\\d.]+)`)); return m ? +m[1] : 0; };
  test("the bones, the rails and the spine are at least 3 px thick on a phone (the wide bones are 1.8)", () => {
    expect(width(".fish-narrow .fish-line")).toBeGreaterThanOrEqual(3);
    expect(width(".fish-rail")).toBeGreaterThanOrEqual(3);
    expect(width(".fish-narrow .fish-spine")).toBeGreaterThanOrEqual(3);
    expect(width(".fish-line")).toBeCloseTo(1.8);
  });
});
