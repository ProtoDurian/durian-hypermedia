// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// Pass 11 "stage": the composed stage (tools/stage.ts and its blocks): parse, refusals, the LLM view, layout once over
// all steps (nothing moves), the narrow layout, the dispatch from ```animation, roles, linear work and hostile input.
import { beforeEach, describe, expect, test } from "bun:test";
import { compileStage, layoutStage, stageLlm, isStage, edgeSteps, type Compiled } from "../../src/core/stage";
import { forbidden, FONT, measure, type Item , wrapRoom, setPhoneFont, drawnW, poppinsW } from "../../src/core/stage-core";
import { pageRoles } from "../../src/core/stage-roles";
import { sectionsOutsideFences, isStagePart } from "../../src/core/stage-part";
import { jsonOf, llmView, parseDoc } from "../../src/core/dh-lib";
import { checkDoc } from "../../src/core/doccheck";
import { beginDocument, newBudget, BudgetError } from "../../src/core/stage-budget";

beforeEach(() => { beginDocument(); });

const ROLES = { client: 1, server: 2, store: 3, ops: 6, job: 4, cache: 5, plain: 0 };
// a scene from its source, as the page hands it over: the setup, then "@step" steps
function scene(src: string, roles: Record<string, number> = ROLES): Compiled {
  const head: string[] = [], steps: { title: string; raw: string; line: number }[] = [];
  src.split("\n").forEach((l, i) => {
    const m = l.match(/^@step (.*)$/);
    if (m) steps.push({ title: m[1], raw: "", line: i + 1 });
    else if (steps.length) steps[steps.length - 1].raw += (steps[steps.length - 1].raw ? "\n" : "") + l;
    else head.push(l);
  });
  return compileStage(head.join("\n"), steps, 1, {}, roles);
}
const msgs = (c: Compiled) => c.errors.map((e) => e.msg).join(" | ");
const SHOP = `title: Orders | one request
## Browsers
client b1..b4: laptop; phone; tablet; kiosk | sends GET /orders
... about 2,000 sessions
## Servers
server s0,s1: api 0; api 1 | answers in JSON
  + (a) worker a; (b) worker b
## Storage
store db: orders database | primary
## _ under Servers..Storage
ops cfg: ledger service | sends routes
@step Ask: Each browser asks one server.
b1,b3 --> s0: GET
b2,b4 --> s1: GET
tag b1,b3: to api 0
@step Read: The servers read.
s0,s1 -> db (store): SELECT
say db: one primary
@step Ledger: Off the data path.
clear
show cfg
cfg -> s1, db: checked
@step All: The whole picture.
show all
key client: GET browser to server`;

describe("parse", () => {
  test("lanes, cards, ranges, badges, more, spans, steps", () => {
    const c = scene(SHOP);
    expect(msgs(c)).toBe("");
    const m = c.model;
    expect(m.title).toBe("Orders");
    expect(m.note).toBe("one request");
    expect(m.lanes.map((l) => l.title)).toEqual(["Browsers", "Servers", "Storage", ""]);
    expect([...m.cards.keys()]).toEqual(["b1", "b2", "b3", "b4", "s0", "s1", "db", "cfg"]);
    expect(m.cards.get("b3")!.title).toBe("tablet");
    expect(m.cards.get("s1")!.badges).toEqual([{ b: "a", s: "worker a" }, { b: "b", s: "worker b" }]);
    expect(m.lanes[3].span).toEqual(["Servers", "Storage"]);
    expect(m.lanes[0].more).toEqual(["about 2,000 sessions"]);
    expect(m.steps.map((s) => s.title)).toEqual(["Ask", "Read", "Ledger", "All"]);
    expect(m.steps[0].edges.length).toBe(4);
    expect(m.steps[0].edges.every((e) => e.dash)).toBe(true);
    expect(m.steps[1].edges[0].role).toBe("store");
    expect(m.cards.get("cfg")!.from).toBe(3);
  });
  test("say (role), in role:, a mark's note, a lone card grows beside a stack", () => {
    const c = scene("## A\nclient a1,a2,a3: x; y; z\n## B\nserver b: B\n@step One: x\nsay b (client): hi\n@step Two: y");
    expect(msgs(c)).toBe("");
    expect(c.model.steps[0].says[0]).toEqual(["b", "hi", "client"]);
    const p = layoutStage(c.model, 1000), bx = p.items.find((i) => i.k === "box" && i.id === "b") as any, a1 = p.items.find((i) => i.k === "box" && i.id === "a1") as any;
    expect(bx.h).toBeGreaterThan(a1.h * 1.5);
    const s = scene('sheet: s\nserver g: G\n  plain r "R": 1 2 3\n@step One: x\nkeep mark r 2: bad +1 | 2 < 3: odd\n@step Two: y');
    expect(msgs(s)).toBe("");
    expect(stageLlm(s)).toContain("R, value 2 (2): bad, +1; 2 < 3: odd.");
  });
  test("tag (role) colours the chip; a step's notes sit under its own panels", () => {
    const c = scene("## A\nclient a1,a2: x; y\n## B\nserver b: B\n@step One: x\ntag a1 (server): to b\n@step Two: y");
    expect(msgs(c)).toBe("");
    expect(c.model.steps[0].tags[0]).toEqual([["a1"], "to b", "server"]);
    const p = layoutStage(c.model, 1000);
    expect(p.items.some((i) => i.k === "box" && (i as any).stroke === "role:server:line" && (i as any).h < 30)).toBe(true);
  });
  test("a connector label speaks in its own step; 'and more' steps aside for a band", () => {
    const c = scene("## A\nclient a1,a2: x; y\n... and more\n## B\nserver b: B\nops o under A..B: foreman\n@step One: x\na1 --> b: GET\n@step Two: y\nshow o\n@step Three: z");
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000) as any;
    const lab = p.items.find((i: any) => i.k === "text" && i.s === "GET"), more = p.items.find((i: any) => i.k === "text" && i.s === "… and more");
    expect([lab.from, lab.to]).toEqual([1, 1]);
    expect(more.to).toBe(1);
  });
  test("a step lights its actors: the cards light names, else its connectors' senders and the cards it shows that it does not only send to", () => {
    const c = scene("## A\nclient a1,a2: x; y\n## B\nserver b1,b2: p; q\n@step One: x\nclear\nshow a*\n@step Two: y\nshow b*\na1,a2 --> b1,b2: POST\nlight a1,a2\n@step Three: z\nshow b*");
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000) as any, lit = (k: number) => [...new Set(p.items.filter((i: any) => i.k === "box" && i.hot?.includes(k) && /^[ab][12]$/.test(i.id ?? "")).map((i: any) => i.id))].sort();
    expect(lit(2)).toEqual(["a1", "a2"]);
    expect(lit(3)).toEqual(["b1", "b2"]);
    const d = scene("## A\nclient a1,a2: x; y\n## B\nserver b1,b2: p; q\n@step One: x\nclear\nshow a*\n@step Two: y\nshow b*\na1,a2 --> b1,b2: POST");
    const pd = layoutStage(d.model, 1000) as any; expect([...new Set(pd.items.filter((i: any) => i.k === "box" && i.hot?.includes(2) && /^[ab][12]$/.test(i.id ?? "")).map((i: any) => i.id))].sort()).toEqual(["a1", "a2"]); // without light: the senders, not the shown targets
  });
  test("'light none': a step lights no card, not even its connectors' senders; any other word after light is still a card id", () => {
    const c = scene("## A\nclient a1,a2: x; y\n## B\nserver b1,b2: p; q\n@step One: x\nshow a*\n@step Two: y\nshow b*\na1,a2 --> b1,b2: POST\nlight none\n@step Three: z\nb1 --> a1: OK");
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000) as any, lit = (k: number) => [...new Set(p.items.filter((i: any) => i.k === "box" && i.hot?.includes(k) && /^[ab][12]$/.test(i.id ?? "")).map((i: any) => i.id))].sort();
    expect(lit(2)).toEqual([]);
    expect(lit(3)).toEqual(["b1"]);
    expect(msgs(scene("## A\nclient a1: x\n@step One: x\nlight nobody\n@step Two: y"))).not.toBe("");
  });
  test("wide spacing (fault 2): cards of a lane 21 px apart; a short lane of several cards spreads over 0.92 of the lane before it; the gap before a lone card holds only its label's overhang", () => {
    const c = scene("## A\nclient a1..a6: one; two; three; four; five; six | a line\n## B\nserver b1,b2,b3: p; q; r | a line | another line\n## C\nserver c: C\n## D\nclient d: the store | holds it\n@step One: x\nb1,b2,b3 --> c: POST\n@step Two: y\nc --> d: copy out (boxed up)");
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1178) as any, r = (id: string) => p.items.find((i: any) => i.k === "box" && i.id === id);
    expect(r("a2").y - (r("a1").y + r("a1").h)).toBe(21);
    const aSpan = r("a6").y + r("a6").h - r("a1").y, bSpan = r("b3").y + r("b3").h - r("b1").y;
    expect(Math.abs(bSpan - 0.92 * aSpan)).toBeLessThan(30);
    expect(r("d").x - (r("c").x + r("c").w)).toBeLessThan(80);
    const lab = p.items.find((i: any) => i.k === "text" && i.s === "copy out (boxed up)");
    expect(lab.x + measure("copy out (boxed up)", "chip") / 2).toBeLessThanOrEqual(1178);
  });
  test("a neutral (control) connector's label stays while its line shows; a data label speaks in its own step only", () => {
    const c = scene("## A\nclient a: A\n## B\nserver b: B\nplain op under A..B: op\n@step One: x\na --> b: GET\nop --> a: ledger\n@step Two: y\nshow all", { client: 1, server: 2, plain: 0 });
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000) as any, at = (s: string, k: number) => p.items.some((i: any) => i.k === "text" && i.s === s && (i.on ? i.on.includes(k) : k >= (i.from ?? 1) && (!i.to || k <= i.to)));
    expect(at("GET", 1)).toBe(true); expect(at("GET", 2)).toBe(false);
    expect(at("ledger", 1)).toBe(true); expect(at("ledger", 2)).toBe(true);
  });
  test("a chips panel on a phone flows its chips by their own widths, several to a row; one wider than the row takes it whole and wraps", () => {
    const long = "a_very_long_label_name_that_cannot_fit=on_one_phone_row_at_all_x";
    const c = scene("## A\nclient a: A\n@step One: x\nchips 3: kept\n  + job=api; + env=live; + zone=b; - pen=p1; - ip=192.0.2.7; + " + long + "\n@step Two: y");
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 356) as any, ch = p.items.filter((i: any) => i.k === "box" && i.bar?.kind === "chip");
    expect(ch.length).toBe(6);
    const rows = new Set(ch.slice(0, 5).map((b: any) => Math.round(b.y)));
    expect(rows.size).toBeLessThanOrEqual(2);
    for (const b of ch) expect(b.x + b.w).toBeLessThanOrEqual(356);
    const lb = ch.find((b: any) => b.bar.label === long); expect(lb.h).toBeGreaterThan(26);
    expect(p.items.filter((i: any) => i.k === "text" && i.s === "env=live").length).toBe(1);
  });
  test("a cut stands near where its line arrives (16 px before the target end), on the connector's own route even in a step that no longer draws it", () => {
    const c = scene("## A\nclient a: A | a line\n## B\nserver b: B | a line | another | and more | still more\n@step One: x\na --> b: GET\n@step Two: y\ncut a --> b");
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000) as any, line = p.items.find((i: any) => i.k === "path" && i.id === "a>b"), cut = p.items.find((i: any) => String(i.id ?? "").startsWith("cut:"));
    const cx = (cut.pts[0][0] + cut.pts[1][0]) / 2, cy = (cut.pts[0][1] + cut.pts[1][1]) / 2, end = line.pts.at(-1);
    expect(Math.hypot(cx - end[0], cy - end[1])).toBeLessThan(24);
    const start = line.pts[0]; expect(Math.hypot(cx - start[0], cy - start[1])).toBeGreaterThan(Math.hypot(cx - end[0], cy - end[1]));
  });
  test("phone compact forms: a rows row keeps every line at 17 px and puts a short chip at the end of the line before it; a grid's compact verdict rows are 50 px, 6 px apart", () => {
    const c = scene("## A\nclient a: A\n@step One: x\nrows\n  web-1 ; 192.0.2.10:8080 | hash = 0x1f ; * Jump(h, 4) = 2 | => client: field 2 | not moved ; steward = hash\n  web-2 ; 192.0.2.11:8080 | hash = 0x2e ; * Jump(h, 4) = 3 | => client: field 3 | not moved ; steward = hash\n@step Two: y\ngrid 2\n  client: web-1 | 192.0.2.10 · Running [+ kept]\n  client: web-2 | 192.0.2.11 · Running [- dropped]\n  client: web-3 | 192.0.2.12 · Pending [- dropped]");
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 356) as any, on = (i: any, k: number) => (i.on ? i.on.includes(k) : k >= (i.from ?? 1) && (!i.to || k <= i.to));
    const rows = p.items.filter((i: any) => i.k === "box" && i.bar?.kind === "worksheet-row" && on(i, 1));
    expect(rows.length).toBe(2); for (const r of rows) expect(r.h).toBeLessThan(140);
    const chip = p.items.find((i: any) => i.k === "text" && i.s === "field 2"), jump = p.items.find((i: any) => i.k === "text" && String(i.s).startsWith("Jump(h, 4) = 2"));
    expect(chip.y).toBe(jump.y);
    for (const s of ["web-1", "192.0.2.10:8080", "hash = 0x1f", "not moved", "steward = hash"]) expect(p.items.some((i: any) => i.k === "text" && i.s === s && on(i, 1))).toBe(true);
    const g = p.items.filter((i: any) => i.k === "box" && i.bar?.kind === "worksheet-row" && on(i, 2) && !on(i, 1));
    expect(g.length).toBe(3); expect(g[1].y - (g[0].y + g[0].h)).toBe(6); expect(g[0].h).toBe(50);
  });
  test("a phone keeps a lone panel frame its own height (no empty box under its words); a wide stage still grows it to the region; a phone line that is one long token keeps 5% room, a line of words does not", () => {
    const c = scene("## A\nclient a: A\n@step One: x\ncard client: Short | one line\n@step Two: y\ncard client: Tall\n  = one\n  = two\n  = three\n  = four\n  = five\n  = six\n  = seven\n  = eight");
    expect(msgs(c)).toBe("");
    const fr = (w: number, k: number) => (layoutStage(c.model, w) as any).items.filter((i: any) => i.k === "box" && i.cls === "scn-frame" && (i.on ? i.on.includes(k) : k >= (i.from ?? 1) && (!i.to || k <= i.to)));
    const p1 = fr(356, 1)[0], p2 = fr(356, 2)[0], w1 = fr(1000, 1)[0], w2 = fr(1000, 2)[0];
    expect(p1.h).toBeLessThan(p2.h - 100);
    expect(w1.h).toBe(w2.h);
    setPhoneFont(true); expect(wrapRoom("words that fit on one line", 400, "sub")).toEqual(["words that fit on one line"]); const tok = "web-arm-7f9c8d6b5-k2m4p-x"; expect(wrapRoom(tok, measure(tok, "sub") + 1, "sub").length).toBe(2); setPhoneFont(false); expect(wrapRoom(tok, Math.max(drawnW(tok, "sub"), poppinsW(tok, "sub")) + 1, "sub").length).toBe(1); // off a phone: one line where its drawn width fits (rc.3 review MUST 4; rc.4: Poppins as drawn too)
  });
  test("on a phone, a grid shown again with the same cards keeps their height when they lose their value chip (zero movement between steps); the wide stage keeps its own heights", () => {
    const g = (v: boolean) => "grid 3\n  client: field 1 | from web-1" + (v ? " [= (a=1)]" : "") + "\n  client: field 2 | from web-2" + (v ? " [= (a=2)]" : "") + "\n  client: field 3 | from web-3" + (v ? " [= (a=3)]" : "");
    const c = scene("## A\nclient a: A\n@step One: x\n" + g(true) + "\n@step Two: y\n" + g(false));
    expect(msgs(c)).toBe("");
    for (const w of [356]) {
      const p = layoutStage(c.model, w) as any, on = (i: any, k: number) => (i.on ? i.on.includes(k) : k >= (i.from ?? 1) && (!i.to || k <= i.to));
      const h = (k: number) => p.items.filter((i: any) => i.k === "box" && i.bar?.kind === "card" && i.bar.label === "field 1" && on(i, k)).map((i: any) => i.h);
      expect(h(2)).toEqual(h(1));
    }
  });
  test("a connector written again with words in a later step: one label per step, the old one up to that step, the new one from it (wide and phone)", () => {
    const c = scene("## A\nclient a: A\n## B\nserver b: B\n@step One: x\na --> b: ledger, checked\n@step Two: y\nshow all\na --> b: ledger, checked");
    expect(msgs(c)).toBe("");
    for (const w of [1000, 356]) {
      const p = layoutStage(c.model, w) as any, on = (i: any, k: number) => (i.on ? i.on.includes(k) : k >= (i.from ?? 1) && (!i.to || k <= i.to));
      for (const k of [1, 2]) expect({ w, k, n: p.items.filter((i: any) => i.k === "text" && i.s === "ledger, checked" && on(i, k)).length }).toEqual({ w, k, n: 1 });
    }
  });
  test("on a phone, as wide, a data connector's label speaks in its own step; a neutral one's stays for its steps", () => {
    const c = scene("## A\nclient a: A\nplain n: N\n## B\nserver b: B\n@step One: x\na --> b: copy out\nn --> b: ledger\n@step Two: y\nshow all");
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 356) as any, on = (i: any, k: number) => (i.on ? i.on.includes(k) : k >= (i.from ?? 1) && (!i.to || k <= i.to));
    const n = (s: string, k: number) => p.items.filter((i: any) => i.k === "text" && i.s === s && on(i, k)).length;
    expect([n("copy out", 1), n("copy out", 2)]).toEqual([1, 0]);
    expect([n("ledger", 1), n("ledger", 2)]).toEqual([1, 1]);
  });
  test("phone: a lane heading stays in its gap beside the gap's widest label; more labels take 22 px label rows, never a card; a data label holds its place only in its own step", () => {
    const c2 = scene("## Pickers\nclient a1,a2,a3: x; y; z\n## Packers\nserver b1,b2: p; q\n## Store\nstore d: D\n@step One: x\na1,a2,a3 --> b1,b2: POST /send\n@step Two: y\nb1,b2 --> d: copy out");
    expect(msgs(c2)).toBe("");
    const p = layoutStage(c2.model, 356) as any, on = (i: any, k: number) => (i.on ? i.on.includes(k) : k >= (i.from ?? 1) && (!i.to || k <= i.to));
    const head = p.items.find((i: any) => i.k === "text" && i.s === "Packers"), b1 = p.items.find((i: any) => i.k === "box" && i.id === "b1");
    const labs = p.items.filter((i: any) => i.k === "box" && i.bar?.["edge-label"] === "POST /send");
    expect(labs.length).toBe(3);
    expect(Math.min(...labs.map((l: any) => l.y))).toBeLessThan(head.y); // the heading sits in the label row, beside a label
    const cards = p.items.filter((i: any) => i.k === "box" && /^[abd][123]?$/.test(i.id ?? ""));
    for (const l of [...labs, ...p.items.filter((i: any) => i.k === "box" && i.bar?.["edge-label"])]) for (const r of cards) expect(l.x + l.w <= r.x || r.x + r.w <= l.x || l.y + l.h <= r.y || r.y + r.h <= l.y).toBe(true);
    expect(head.y).toBeLessThan(b1.y);
    for (const l of labs) expect(l.on ?? [l.from]).toEqual([1]);
  });
  test("phone: one sender's line to targets in two lanes draws ONE label, in the gap of its first connector (the hero's ledger line)", () => {
    const c = scene("## A\nclient a: A\n## B\nserver b: B\n## C\nstore d: D\n## Ops\nplain o: foreman\n@step One: x\no --> a,b: ledger, checked\n@step Two: y");
    expect(msgs(c)).toBe("");
    expect((layoutStage(c.model, 356) as any).items.filter((i: any) => i.k === "text" && i.s === "ledger, checked").length).toBe(1);
  });
  test("'list Title | roomy': the same rows with the reference design's spacing (title gap and pitch 28, 42 under the last row; 21/31 on a phone); the title loses the option; any other option is an error", () => {
    const body = "\n  timeout: 30 s\n  retries: 3\n  - the old flag\n@step Two: y";
    const plain = scene("## A\nclient a: A\n@step One: x\nlist Settings" + body), roomy = scene("## A\nclient a: A\n@step One: x\nlist Settings | roomy" + body);
    expect(msgs(plain)).toBe(""); expect(msgs(roomy)).toBe("");
    for (const w of [1000, 356]) {
      const ys = (c: any) => (layoutStage(c.model, w) as any).items.filter((i: any) => i.k === "text" && ["timeout", "retries"].includes(i.s)).map((i: any) => i.y);
      const [a, b] = ys(plain), [c, d] = ys(roomy);
      expect(d - c).toBe(w > 500 ? 28 : 21); // the reference design's row pitch, and its phone scale
      const p = layoutStage(roomy.model, w) as any, tl = p.items.find((i: any) => i.k === "text" && i.s === "Settings"), fr = p.items.find((i: any) => i.k === "box" && i.cls === "scn-frame" && i.h > 60);
      expect(c - tl.y).toBe(w > 500 ? 28 : 21);
      const lastY = Math.max(...p.items.filter((i: any) => i.k === "text" && i.f === "sub").map((i: any) => i.y)); expect(fr.y + fr.h - lastY).toBe(w > 500 ? 42 : 31);
      expect((layoutStage(roomy.model, w) as any).items.some((i: any) => i.k === "text" && i.s === "Settings")).toBe(true);
    }
    expect(msgs(scene("## A\nclient a: A\n@step One: x\nlist Settings | wide" + body))).toContain("roomy");
  });
  test("fan-out: three sources each to two targets with one label draw one label per source, wide and on a phone (the hero's step 3: one POST per picker; as the reference design)", () => {
    const c = scene("## A\nclient a1,a2,a3: x; y; z\n## B\nserver b1,b2: p; q\n@step One: x\na1,a2,a3 --> b1,b2: POST /send\n@step Two: y");
    expect(msgs(c)).toBe("");
    for (const wd of [1000, 356, 340]) {
      const p = layoutStage(c.model, wd) as any, ls = p.items.filter((i: any) => i.k === "text" && i.s === "POST /send");
      expect(ls.length).toBe(3);
      for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) expect(Math.abs(ls[i].x - ls[j].x) > 60 || Math.abs(ls[i].y - ls[j].y) > 18).toBe(true);
    }
    { const p = layoutStage(c.model, 1000) as any, ls = p.items.filter((i: any) => i.k === "text" && i.s === "POST /send"), a = p.items.find((i: any) => i.k === "box" && i.id === "a1"), b = p.items.find((i: any) => i.k === "box" && i.id === "b1"); for (const l of ls) expect(Math.abs(l.x - (a.x + a.w + b.x) / 2)).toBeLessThan(2); } // wide: centred in the gap
    const d = scene("## A\nclient a1,a2: x; y\n## B\nserver b: B\n@step One: x\na1,a2 --> b: GET\n@step Two: y");
    for (const wd of [1000, 356]) expect((layoutStage(d.model, wd) as any).items.filter((i: any) => i.k === "text" && i.s === "GET").length).toBe(1);
  });
  test("key splits by ';'; x2 draws two connectors per pair", () => {
    const c = scene("## A\nclient a: A\n## B\nserver b: B\n@step One: x\na -> b x2: twice\n@step Two: y\nkey client: one; two");
    expect(msgs(c)).toBe("");
    expect(c.model.steps[0].edges.length).toBe(2);
    expect(c.model.steps[1].keys).toEqual([["client", "one"], ["client", "two"]]);
  });
  test("x2 from a band up to a card: two separate arrows at a quarter and three quarters of the card, the same in every step (the reference design's foreman arrows)", () => {
    const c = scene("## A\nclient a: A\n## B\nserver b: B\nops o under A..B: the foreman\n@step One: x\no -> a x2: ledger\n@step Two: y\no -> a x2: ledger");
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000) as any, a = p.items.find((i: any) => i.k === "box" && i.id === "a");
    const xs = (k: number) => p.items.filter((i: any) => i.k === "path" && /^o>a/.test(i.id ?? "") && (i.on ? i.on.includes(k) : k >= (i.from ?? 1) && (!i.to || k <= i.to))).map((i: any) => [i.pts[0][0], i.pts.at(-1)[0]]);
    for (const k of [1, 2]) {
      const ends = xs(k).sort((u: number[], v: number[]) => u[0] - v[0]);
      expect(ends.length).toBe(2);
      for (const [s, e] of ends) expect(Math.abs(s - e)).toBeLessThan(1); // straight up
      expect(Math.abs(ends[0][0] - (a.x + a.w / 4))).toBeLessThan(1);
      expect(Math.abs(ends[1][0] - (a.x + (a.w * 3) / 4))).toBeLessThan(1);
      // the pair's one label stands between its lines, on neither
      const chips = p.items.filter((i: any) => i.k === "box" && i.cls === "stg-chip" && (i.on ? i.on.includes(k) : k >= (i.from ?? 1) && (!i.to || k <= i.to)));
      expect(chips.length).toBe(1);
      for (const [x] of ends) expect(x < chips[0].x || x > chips[0].x + chips[0].w).toBe(true);
    }
  });
  test("a lane's 'and more' line steps aside when a band under it comes in, wide and on a phone", () => {
    const c = scene("## A\nclient a1,a2: A1; A2\n... 32 more\n## B\nserver b: B\nops o under A..B: the foreman\n@step One: x\nlight a*\n@step Two: y\nshow o\n@step Three: z");
    expect(msgs(c)).toBe("");
    for (const w of [1000, 356]) {
      const more = (layoutStage(c.model, w) as any).items.filter((i: any) => i.k === "text" && /32 more/.test(i.s));
      expect(more.length).toBeGreaterThan(0);
      for (const i of more) { expect(i.from ?? 1).toBe(1); expect(i.to).toBe(1); }
    }
  });
  test("a one-line band: role id under A..B: title", () => {
    const c = scene("## A\nclient a: A\n## B\nserver b: B\nops o under A..B: the foreman");
    expect(msgs(c)).toBe("");
    expect(c.model.lanes.at(-1)!.span).toEqual(["A", "B"]);
    expect(c.model.lanes.at(-1)!.cards[0].title).toBe("the foreman");
  });
  test("one id keeps a ';' in its title", () => {
    const c = scene("## A\nops x: one; two | sub");
    expect(msgs(c)).toBe("");
    expect(c.model.cards.get("x")!.title).toBe("one; two");
  });
  test("a back arrow is drawn from its right side", () => {
    const c = scene("## A\nclient a: A\n## B\nserver b: B\n@step One: x\na <- b: back\n@step Two: y");
    expect(c.model.steps[0].edges[0]).toMatchObject({ from: "a", to: "b", back: true });
    expect(stageLlm(c)).toContain("back: B to A.");
  });
  test("connectors show from their step until a clear, and in a show all step", () => {
    const c = scene(SHOP);
    expect(edgeSteps(c.model, 1)).toEqual([1, 2, 4]);
    expect(edgeSteps(c.model, 2)).toEqual([2, 4]);
    expect(edgeSteps(c.model, 3)).toEqual([3, 4]);
  });
});

describe("refusals: each names the line and the fix", () => {
  const cases: [string, string, RegExp][] = [
    ["unknown role", "## A\nwizard w: W", /"wizard" is not a role of this page; the page declares client, server/],
    ["unknown card in a step", "## A\nclient a: A\n@step One: x\na -> zz: hi\n@step Two: y", /"zz" is not a card of this scene \(a\)/],
    ["titles do not match ids", "## A\nclient a,b,c: one; two", /3 ids but 2 titles/],
    ["id twice", "## A\nclient a: A\nclient a: B", /"a" is declared twice/],
    ["a line that does not read", "## A\nthis is prose", /this line does not read/],
    ["a step line that does not read", "## A\nclient a: A\n@step One: x\nwobble a\n@step Two: y", /this step line does not read\. A step's words: show, show all, clear/],
    ["one step", "## A\nclient a: A\n@step Only: x", /at least 2 steps, or none/],
    ["a span names a lane above", "## A\nclient a: A\n## _ under A..Nope\nops o: O", /"Nope" is not a lane above/],
    ["a graph scene without layout=graph", 'box a "A"\nbox b "B"\na -> b', /reads like a graph scene.*layout=graph/],
    ["a graph word in a step", "## A\nclient a: A\n@step One: x\nsend a\n@step Two: y", /write layout=graph on the fence/],
    ["badges go under a card", "## A\n+ (a) x", /indented under the cards/],
    ["grid columns", "## A\nclient a: A\n@step One: x\ngrid 9\n  client: y\n@step Two: y", /grid takes a number of columns, 1 to 6/],
    ["rows cells", "## A\nclient a: A\n@step One: x\nrows\n  a | b\n  a | b | c\n@step Two: y", /every row has the same number of cells/],
    ["track phase", "track: client a, b\n@step One: x\nat zz\n@step Two: y", /"zz" is not a phase of the track \(a, b\)/],
    ["sheet mark", 'sheet: s\nserver g: G\n  plain r "R": 1 2 3\n@step One: x\nmark r 9: bad\n@step Two: y', /mark names a row and a cell from 1 to 3/],
    ["time span", "time: 0..10 | s\nrow job j: a 0..10\n@step One: x\nspan j 5..20: no\n@step Two: y", /span names a row and a range on the axis/],
    ["time state off the axis", "time: 0..10 | s\nrow job j: a 0..12", /runs off the axis/],
  ];
  for (const [name, src, re] of cases) test(name, () => { const c = scene(src); expect(msgs(c)).toMatch(re); expect(c.errors[0].line).toBeGreaterThan(0); });
});

describe("no coordinate, pixel, colour value or millisecond", () => {
  test.each([
    ["client a: A | 12px", /pixel size/],
    ["client a: A | #3366ff", /colour value/],
    ["client a: A | rgb(1,2,3)", /colour value/],
    ["client a: A x=12", /coordinate/],
    ["client a: A dur=300ms", /coordinate, size or time/],
  ])("%s", (line, re) => { expect(msgs(scene(`## A\n${line}`))).toMatch(re); });
  test("content may say 300 ms, #3, a hash 0x51 or an id #42-a", () => {
    for (const t of ["p99 is 300 ms", "issue #3", "hash 0x51a2", "ticket #42-a"]) expect(forbidden(t)).toBeNull();
  });
});

describe("layout once over all steps", () => {
  const boxes = (items: Item[]) => items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && !!i.id);
  test("each card has one place for the whole scene, also those shown later", () => {
    const c = scene(SHOP), p = layoutStage(c.model, 1000);
    const ids = boxes(p.items).map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length); // drawn once, never redrawn per step
    expect(ids).toContain("cfg");
    const cfg = boxes(p.items).find((b) => b.id === "cfg")!;
    expect(cfg.from).toBe(3);
  });
  test("a reply on the same pair gets its own ports, not the request's line", () => {
    const c = scene("## A\nclient a: A\n## B\nserver b: B\n@step One: x\na -> b: GET\n@step Two: y\nb -> a: 200 OK");
    const ls = layoutStage(c.model, 1000).items.filter((i) => i.k === "path" && i.bar?.edge) as any[];
    expect(ls.length).toBe(2);
    expect(JSON.stringify(ls[0].pts[0])).not.toBe(JSON.stringify(ls[1].pts.at(-1)));
  });
  test("the same input lays out the same, to the pixel", () => {
    const a = layoutStage(scene(SHOP).model, 1000), b = layoutStage(scene(SHOP).model, 1000);
    expect(JSON.stringify(a.items)).toBe(JSON.stringify(b.items));
  });
  test("no card overlaps another; lanes go left to right", () => {
    const p = layoutStage(scene(SHOP).model, 1000), bs = boxes(p.items).filter((b) => b.cls === "scn-shape");
    for (const a of bs) for (const b of bs) if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    const x = (id: string) => bs.find((b) => b.id === id)!.x;
    expect(x("b1")).toBeLessThan(x("s0"));
    expect(x("s0")).toBeLessThan(x("db"));
  });
  test("everything stays inside the stage, at 1000 and on a phone", () => {
    for (const w of [1000, 360]) {
      const p = layoutStage(scene(SHOP).model, w);
      for (const it of p.items) if (it.k === "box") { expect(it.x).toBeGreaterThanOrEqual(0); expect(it.x + it.w).toBeLessThanOrEqual(w + 0.5); }
    }
  });
  test("a phone stacks the lanes", () => {
    const p = layoutStage(scene(SHOP).model, 340), bs = boxes(p.items);
    expect(p.narrow).toBe(true);
    expect(bs.find((b) => b.id === "s0")!.y).toBeGreaterThan(bs.find((b) => b.id === "b4")!.y);
  });
  test("no font under 11 px", () => { for (const f of Object.values(FONT)) expect(f.size).toBeGreaterThanOrEqual(11); });
  test("connectors and labels: one label per label, step and gap; dashed by -->", () => {
    const p = layoutStage(scene(SHOP).model, 1000);
    const lines = p.items.filter((i) => i.k === "path" && i.bar?.edge);
    expect(lines.length).toBe(4 + 2 + 2);
    const gets = p.items.filter((i) => i.k === "box" && i.bar?.["edge-label"] === "GET");
    expect(gets.length).toBe(1); // both GET bundles cross the same gap in the same step
    expect(lines.filter((l) => (l as any).dash).length).toBe(4);
  });
});

describe("blocks", () => {
  test("track, grid, rows, map, list, chips, calc, card, sheet and time parse and lay out", () => {
    const src = `track: job fetch, build | store publish
carry: one package
@step A: a
at build
grid 2
  job: ui-kit | 3.2.0 [+ kept]
  job: icons | 0.8.0 [- draft]
  job: router | 1.9 [= field 2]
rows
  a ; b | * c | => cache: field 2
  ! a note
@step B: b
at publish
map rename
  job: router
  to
  + name; - maps
list Settings
  timeout: 30 s
  - old flag
chips 2: kept
  + a=1; - b=2
  => job: a="1"
calc
  x = 1
  == job: y = 2
card store: The store | holds
  in: (1); (2)
  job: inner | = 3
  right:
  * blue`;
    const c = scene(src);
    expect(msgs(c)).toBe("");
    for (const w of [1000, 340]) expect(layoutStage(c.model, w).items.length).toBeGreaterThan(30);
    const llm = stageLlm(c);
    expect(llm).toContain("Phases: fetch, build, publish.");
    expect(llm).toContain("At: build (carrying one package).");
    expect(llm).toContain("ui-kit (3.2.0): kept.");
    expect(llm).toContain("router (1.9): field 2.");
    expect(llm).toContain("router, rename: kept name; dropped maps.");
  });
  test("worksheet and time", () => {
    const c = scene(`sheet: two shops | 3 tills
server s0: north | 2 tills
  plain t1 "till 1": 40 55 70
  plain t2 "till 2": 10 20 30
=> store out: office | adds
time: 0..60 | seconds
row job j1 "build": queued 0..4; +running 4..31
@step A: a
mark t1 2: bad +55
value t1 t2: per hour | 100, 60
span j1 4..31: 27 s
@step B: b
sum s0: north | 100 + 60 = 160 -> 160
total out: 160 => takings | 160
at 31: done`);
    expect(msgs(c)).toBe("");
    const llm = stageLlm(c);
    expect(llm).toContain("till 1: 40, 55, 70");
    expect(llm).toContain("till 1, value 2 (55): bad, +55.");
    expect(llm).toContain("build, 4 to 31: 27 s.");
    expect(llm).toContain("At 31 seconds: done.");
    // a time mark sits at its true place on the axis
    const p = layoutStage(c.model, 1000);
    const axis = p.items.find((i) => i.bar?.axis)! as any, mark = p.items.find((i) => i.k === "path" && i.bar?.value === 31) as any;
    const [x0, x1] = [axis.pts[0][0], axis.pts[1][0]];
    expect(Math.abs(mark.pts[0][0] - (x0 + (31 / 60) * (x1 - x0)))).toBeLessThan(0.01);
  });
});

describe("page", () => {
  const page = (body: string, fm = "roles:\n  client: c1\n  server: c2\n") => parseDoc("t.dh.md", `---\ntitle: T\n${fm}---\n\n# T\n\n${body}\n`);
  test("composed by default; layout=graph, 3d or a kind go to the engine", () => {
    expect(isStage({})).toBe(true);
    for (const a of [{ layout: "graph" }, { layout: "row" }, { view: "3d" }, { kind: "sequence" }]) expect(isStage(a as any)).toBe(false);
    const d = page("```animation\n## A\nclient a: A\n```\n\n```animation layout=graph\nbox a \"A\"\n```");
    const j = jsonOf(d);
    const anims = j.blocks.filter((b: any) => b.type === "animation");
    expect(anims[0].stage.roles).toEqual({ client: 1, server: 2 });
    expect(anims[1].anim).toBeTruthy();
  });
  test("roles: colours, the neutral, the next free one, refusals", () => {
    expect(pageRoles({ roles: { a: "c3", b: {}, c: "c0", d: { colour: "c1", label: "D" } } }).roles).toEqual({ a: 3, b: 2, c: 0, d: 1 });
    expect(pageRoles({ roles: { a: "c1", b: "c1" } })).toMatchObject({ roles: { a: 1, b: 1 }, errors: [] }); // a page may share a colour; one stage may not (v11-roles-share)
    expect(pageRoles({ roles: { a: "red" } }).errors[0]).toMatch(/not a role colour/);
  });
  test("doccheck refuses a stage error with its line; a composed scene is exempt from the 400-token rule", () => {
    const long = Array.from({ length: 40 }, (_, i) => `client c${i}: a card with quite a long title number ${i} | and a second line that says more`).join("\n");
    const d = page("```animation\n## A\n" + long + "\n@step One: x\nc1 -> c2: hi\n@step Two: y\nwobble\n```");
    const issues: any[] = []; checkDoc(d, undefined, issues);
    expect(issues.some((i) => i.level === "error" && /this step line does not read/.test(i.msg))).toBe(true);
    expect(issues.some((i) => /over the 400-token limit/.test(i.msg))).toBe(false);
  });
  test("the LLM view lists the facts per step", () => {
    const d = page("```animation\ntitle: T | n\n## A\nclient a: A\n## B\nserver b: B\n@step One: first\na -> b: call\n@step Two: second\nsay b: done\n```");
    const v = llmView(d, "t.dh.md");
    expect(v).toContain("1. One: first\n   call: A to B.");
    expect(v).toContain("2. Two: second\n   B says: done.");
  });
  test("the Format page's sections are split outside fences only", () => {
    const s = sectionsOutsideFences("intro\n## One\ntext\n```animation\n## Lane\n```\n## Two\nx");
    expect(s.map((x) => x.split("\n")[0])).toEqual(["intro", "## One", "## Two"]);
  });
  test("a graph-engine scene with no layout= still goes to the engine (old pages keep working)", () => {
    expect(isStage({}, 'box a "API"\ncylinder b\na -> b')).toBe(false);
    expect(isStage({}, "array a: 5 2 8 1")).toBe(false);
    expect(isStage({}, "## A\nclient a: A")).toBe(true);
    expect(isStage({}, "track: job a, b")).toBe(true);
    expect(isStage({}, "")).toBe(true);
  });
  test("isStagePart", () => { expect(isStagePart({ name: "animation", attrs: {} })).toBe(true); expect(isStagePart({ name: "animation", attrs: { layout: "graph" } })).toBe(false); });
});

describe("work: linear and bounded", () => {
  const big = (n: number) => `## A\n${Array.from({ length: n }, (_, i) => `client c${i}: card ${i} | line ${i}`).join("\n")}\n## B\nserver s: S\n@step One: x\n${Array.from({ length: n }, (_, i) => `c${i} -> s: call ${i}`).join("\n")}\n@step Two: y`;
  const work = (src: string) => { const b = beginDocument(newBudget(1e9, 1e9)); const c = scene(src); layoutStage(c.model, 1000); stageLlm(c); return 1e9 - b.left().work; };
  test("doubling the input at most about doubles the work", () => {
    const a = work(big(25)), b = work(big(50));
    expect(b / a).toBeLessThan(2.4);
  });
  test("a small budget refuses a big scene with BudgetError", () => {
    beginDocument(newBudget(500, 500));
    expect(() => { const c = scene(big(50)); layoutStage(c.model, 1000); }).toThrow(BudgetError);
  });
  test("hostile input ends quickly: huge ranges, long words, deep indents, many arrows", () => {
    const t0 = performance.now();
    const c1 = scene("## A\nclient p1..p999999: x"); // a range over 64 is not a range: one odd id, refused
    expect(c1.errors.length).toBeGreaterThan(0);
    const word = "x".repeat(20000);
    const c2 = scene(`## A\nclient a: ${word}\n${"  ".repeat(500)}+ (a) b`);
    layoutStage(c2.model, 1000);
    const c3 = scene(`## A\nclient a: A\n## B\nserver b: B\n@step One: x\n${"a -> b: y\n".repeat(500)}@step Two: y`);
    expect(msgs(c3)).toMatch(/at most 400 connectors/);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
  test("caps: lines and cards", () => {
    expect(msgs(scene(Array.from({ length: 401 }, (_, i) => `// ${i}`).join("\n").replace(/\/\/ /g, "client c")))).toBeTruthy();
    expect(msgs(scene(`## A\n${Array.from({ length: 121 }, (_, i) => `client c${i}: c`).join("\n")}`))).toMatch(/at most 120 cards/);
  });
});
