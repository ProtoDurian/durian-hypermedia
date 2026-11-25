// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
import { beforeEach, expect, test } from "bun:test";
import { compileStage, layoutStage } from "../../src/core/stage";
import { drawCard, measureCard, setCardPad } from "../../src/core/stage-cards";
import { drawnW, fontSize, setPhoneFont, setPhoneLines, type Item } from "../../src/core/stage-core";
import { beginDocument } from "../../src/core/stage-budget";

beforeEach(() => beginDocument());
const roles = { job: 1, server: 2 };
const scene = (head: string, ...raw: string[]) => compileStage(head, raw.map((raw, i) => ({ title: "Step " + (i + 1), raw, line: 30 + i * 3 })), 1, {}, roles);
type Text = Extract<Item, { k: "text" }>;
const text = (items: Item[]) => items.filter((i): i is Text => i.k === "text");

for (const [width, phone] of [[242, false], [166, true], [144, true]] as const) test("boxed identifiers wrap at their boundaries with every part readable: " + width, () => {
  const label = "__parcel_replica__=parcel-engine (a and b)";
  const c = scene("job a: Copies | ordinary details | cluster=dc-prod-east-1a | server=filter-node | job=parcel · payload_status | " + label, "", "");
  expect(c.errors).toEqual([]);
  setPhoneFont(phone); setPhoneLines(phone); setCardPad(phone);
  try {
    const card = c.model.cards.get("a")!, h = measureCard(c.model, card, width, new Set(), new Set()).h;
    const items = drawCard(c.model, card, { x: 0, y: 0, w: width, h }, new Set(), new Set(), new Map());
    const lines = text(items).filter(i => i.f === "sub");
    for (const line of lines) {
      expect(drawnW(line.s, line.f) * (line.size || fontSize(line.f)) / fontSize(line.f)).toBeLessThanOrEqual(width - 2 * (phone ? 7 : 11) + 5);
      expect(line.size || fontSize(line.f)).toBeGreaterThanOrEqual(11);
      expect(line.y).toBeLessThan(h - 1);
    }
    expect(lines.map(i => i.s).join("").replaceAll(" ", "")).toContain(label.replaceAll(" ", ""));
    const breaks = lines.map(i => i.s);
    expect(breaks.some(s => /parcel-engin$|distributio$/.test(s))).toBe(false);
    for (let i = 1; i < lines.length; i++) expect(lines[i].y - lines[i - 1].y).toBeGreaterThanOrEqual((lines[i].size || fontSize(lines[i].f)) + .9);
  } finally { setPhoneFont(false); setPhoneLines(false); setCardPad(false); }
});
test("a single unbroken part shrinks only when it needs room and never below eleven", () => {
  const c = scene("job a: Copies | distribution", "", ""), card = c.model.cards.get("a")!;
  const width = drawnW("distribution", "sub") * .98 + 22;
  const h = measureCard(c.model, card, width, new Set(), new Set()).h;
  const word = text(drawCard(c.model, card, { x: 0, y: 0, w: width, h }, new Set(), new Set(), new Map())).find(i => i.s === "distribution")!;
  expect(word).toBeDefined(); expect(word.size).toBeLessThan(12); expect(word.size).toBeGreaterThanOrEqual(11);
});
const head = 'time: -20..40 | Sample clock\nruler: below\nrow job roots "Root": _ -10..-9 [dot]\nrow server copies "Copy": _ 10..11 [dot]';
test("bottom-ruler marker captions follow the header and meet their own line, without moving between steps", () => {
  const c = scene(head, "", "keep at 0 [bad]: Last parcel", "keep at 20: New sender"), again = scene(head, "", "keep at 0 [bad]: Last parcel", "keep at 20: New sender");
  expect(c.errors).toEqual([]);
  for (const width of [1178, 356, 326]) {
    const p = layoutStage(c.model, width), q = layoutStage(again.model, width), title = text(p.items).find(i => i.s === "Sample clock")!;
    expect(p).toEqual(q);
    for (const words of ["Last parcel", "New sender"]) {
      const label = text(p.items).find(i => i.s === words)!, line = p.items.find(i => i.k === "path" && i.id?.includes(":at:") && i.from === label.from)!;
      expect(label.y).toBeGreaterThan(title.y);
      expect(line.k).toBe("path");
      if (line.k === "path") { expect(line.pts[0][1]).toBe(label.y - 10); expect(Math.abs(line.pts[0][0] - label.x)).toBe(6); }
    }
    const lasting = p.items.filter(i => i.k === "box" && i.bar?.kind === "worksheet-row");
    expect(lasting.every(i => (i.from || 1) === 1 && !i.to)).toBe(true);
  }
});
test("a bare span removes only its stroke, keeping the text, range and reserved geometry", () => {
  for (const width of [1178, 356, 326]) {
    const a = scene(head, "keep span copies -10..20 [line] [plain]: Copies wait", "", "");
    const b = scene(head, "keep span copies -10..20 [bare] [plain]: Copies wait", "", "");
    expect(a.errors).toEqual([]); expect(b.errors).toEqual([]);
    const p = layoutStage(a.model, width), q = layoutStage(b.model, width);
    expect(p.h).toBe(q.h);
    expect(q.items).toEqual(p.items.filter(i => !(i.k === "path" && i.id?.includes(":span:"))));
    expect(text(q.items).find(i => i.s === "Copies wait")?.to).toBe(0);
  }
});
for (const flags of ["[bare] [line]", "[bare] [bar]"]) test("doccheck rejects incompatible bare span paint: " + flags, () => {
  expect(scene(head, "span copies -10..20 " + flags + ": Copies wait", "").errors.length).toBeGreaterThan(0);
});
