// The state, class and ER diagrams and what they stand on: records, line ends and end labels (SPEC 3.2 State, Class, ER).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { check, llmView as viewOf, parse } from "../src/index";
import { html } from "./helpers";
import { compileScene, edgeGeom, phoneInfo, sampleGeom, sceneLlm, type Compiled } from "../src/core/scene";
import { END_MARKS } from "../src/core/line-ends";
import { fitsWide, wholeHeightCss, wholeHeightVars, wholeLayout, wholeSize } from "../src/core/whole";
import { jsonOf, llmView, parseDoc, structureOf, type PartNode } from "../src/core/dh-lib";
import { diagramOf } from "../src/core/diagrams";
import { Budget } from "../src/core/budget";
// a page's layout budget that has only this many units of work left
const spent = (steps: number) => new Budget({ steps, values: Number.MAX_SAFE_INTEGER, chars: Number.MAX_SAFE_INTEGER });
import { withAnimBudget, workTotal } from "../src/core/work";
import { stateDiagram } from "../src/core/state";
import { classDiagram } from "../src/core/class";
import { erDiagram } from "../src/core/er";
import { around, columnWords, endLabel, joinBrackets } from "../src/core/scan";

function scene(src: string, info: Record<string, string> = {}): Compiled {
  const head: string[] = [], steps: { title: string; raw: string; line: number }[] = [];
  src.split("\n").forEach((l, i) => {
    const m = l.match(/^@step\s*(.*)$/);
    if (m) steps.push({ title: m[1], raw: "", line: i });
    else if (steps.length) steps[steps.length - 1].raw += (steps[steps.length - 1].raw ? "\n" : "") + l;
    else head.push(l);
  });
  return compileScene(head.join("\n"), steps, 0, info);
}
const msgs = (c: Compiled) => c.errors.map((e) => e.msg).join(" | ");
const box = (c: Compiled, k: number, id: string) => c.frames[k].boxes.find((b) => b.id === id)!;
const size = (r: { w: number; h: number }) => [Math.round(r.w), Math.round(r.h)];
const inBox = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

// the first fence of a page, as doccheck and the LLM view meet it
const page = (fence: string, body: string, info = "") => `---\ntitle: T\ndescription: D\n---\n\n# T\n\n\`\`\`${fence}${info}\n${body}\n\`\`\`\n`;
const FIRST = 9; // the line of the fence's first body line
const part = (src: string) => parseDoc("x.dh.md", src).body.find((n) => n.kind === "part") as PartNode;
const dia = (fence: string, body: string, info = "") => diagramOf(part(page(fence, body, info)));


// 13.7. The rule is independent of the send code: a thing that arrived by send must come out as a thing that was pushed.
describe("line ends, end labels, second lines and loops", () => {
  const marks = END_MARKS.filter((m) => m !== "none");
  test("every end is accepted on both sides and reaches the drawn line", () => {
    for (const m of marks) {
      const c = scene(`box a\nbox b\na -- b start=${m} end=${m}`);
      expect(msgs(c)).toBe("");
      expect(c.frames[0].edges[0].ends).toEqual({ a: m, b: m });
    }
  });
  test("an unknown end lists the ones there are", () => {
    const c = scene("box a\nbox b\na -> b end=crow");
    expect(msgs(c)).toContain("zero-or-many");
    expect(c.errors[0].line).toBe(2);
  });
  test("end labels sit by their own end and on no thing, wide and on a phone", () => {
    const src = 'box a "Order"\nbox b "Line"\na -> b start=diamond start-label="1" end-label="0..*" "holds"';
    for (const info of [{}, phoneInfo(scene(src), {}, 324)]) {
      const f = scene(src, info).frames[0], e = f.edges[0];
      const a = f.boxes.find((x) => x.id === "a")!, b = f.boxes.find((x) => x.id === "b")!;
      const mid = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
      const far = (p: any, q: any) => Math.hypot(mid(p).x - mid(q).x, mid(p).y - mid(q).y);
      const [ta, tb] = ["a", "b"].map((k) => e.tags!.find((t) => t.end === k)!);
      expect(ta.text).toBe("1");
      expect(tb.text).toBe("0..*");
      expect(far(ta.r, a)).toBeLessThan(far(ta.r, b));
      expect(far(tb.r, b)).toBeLessThan(far(tb.r, a));
      for (const t of [ta, tb]) for (const x of [a, b]) expect(t.r.x < x.x + x.w && x.x < t.r.x + t.r.w && t.r.y < x.y + x.h && x.y < t.r.y + t.r.h).toBe(false);
    }
  });
  test("a second line needs also=yes, and then runs beside the first", () => {
    expect(msgs(scene("box a\nbox b\na -> b\nb -> a"))).toContain("also=yes");
    const f = scene('box a\nbox b\na -> b "pay"\nb -> a "failed" also=yes').frames[0];
    const [p, q] = f.edges.map((e) => { const A = f.boxes.find((x) => x.key === e.from)!, B = f.boxes.find((x) => x.key === e.to)!; return sampleGeom(edgeGeom(e, A, B)); });
    const mid = (l: { x: number; y: number }[]) => ({ x: (l[0].x + l.at(-1)!.x) / 2, y: (l[0].y + l.at(-1)!.y) / 2 });
    expect(Math.hypot(mid(p).x - mid(q).x, mid(p).y - mid(q).y)).toBeGreaterThan(8);
  });
  test("a loop leaves and returns on one side, outside its thing", () => {
    expect(msgs(scene("box a\na -> a"))).toContain("also=yes");
    const c = scene('box a\na -> a "retry" also=yes'), f = c.frames[0], a = box(c, 0, "a");
    expect(msgs(c)).toBe("");
    const pts = sampleGeom(edgeGeom(f.edges[0], a, a));
    for (const p of pts) expect(p.x > a.x && p.x < a.x + a.w && p.y > a.y && p.y < a.y + a.h).toBe(false);
    expect(Math.max(...pts.map((p) => Math.max(a.x - p.x, p.x - a.x - a.w, a.y - p.y, p.y - a.y - a.h)))).toBeGreaterThan(18);
  });
  test("the LLM view says the ends", () => {
    expect(sceneLlm(scene('box a\nbox b\na -> b start=diamond end-label="0..*"'))).toContain('a -> b (start diamond; end "0..*")');
  });
});

describe("records", () => {
  const src = [
    'record customer "Customer" as=entity: id: uuid [pk], email: text [unique]',
    'record order "Order" as=entity: id: uuid [pk], customer_id: uuid [fk], placed_at: timestamptz, ---, total(): decimal(10, 2)',
    'customer.id -- order.customer_id start=one end=zero-or-many',
  ].join("\n");
  test("a title and one row per field, each a thing with the id <record>.<field>", () => {
    const c = scene(src);
    expect(msgs(c)).toBe("");
    const ids = c.frames[0].boxes.map((b) => b.id);
    for (const id of ["customer", "customer.id", "customer.email", "order.customer_id", "order.total"]) expect(ids).toContain(id);
    expect(box(c, 0, "order.total").label).toBe("total(): decimal(10, 2)");
  });
  test("rows fill the box one under the other, under the title", () => {
    for (const info of [{}, phoneInfo(scene(src), {}, 324)]) {
      const c = scene(src, info), r = box(c, 0, "order");
      const rows = ["id", "customer_id", "placed_at", "total"].map((k) => box(c, 0, `order.${k}`));
      expect(rows[0].y).toBeGreaterThan(r.y + 10);
      rows.forEach((q, k) => { expect(inBox(q, r)).toBe(true); expect(Math.round(q.w)).toBe(Math.round(r.w)); if (k) expect(q.y).toBeCloseTo(rows[k - 1].y + rows[k - 1].h, 3); });
      expect(rows.at(-1)!.y + rows.at(-1)!.h).toBeCloseTo(r.y + r.h, 3);
    }
  });
  test("a line to a row ends on that row's left or right edge, and runs through no record", () => {
    for (const info of [{}, phoneInfo(scene(src), {}, 354), phoneInfo(scene(src), {}, 324)]) {
      const f = scene(src, info).frames[0], e = f.edges[0];
      const A = f.boxes.find((b) => b.key === e.from)!, B = f.boxes.find((b) => b.key === e.to)!;
      const pts = sampleGeom(edgeGeom(e, A, B));
      for (const [p, r] of [[pts[0], A], [pts.at(-1)!, B]] as const) {
        expect(Math.min(Math.abs(p.x - r.x), Math.abs(p.x - r.x - r.w))).toBeLessThan(4);
        expect(p.y > r.y && p.y < r.y + r.h).toBe(true);
      }
      for (const r of f.boxes.filter((b) => b.id === "customer" || b.id === "order")) for (const p of pts) expect(p.x > r.x + 2 && p.x < r.x + r.w - 2 && p.y > r.y + 2 && p.y < r.y + r.h - 2).toBe(false);
    }
  });
  test("a step may light one row", () => {
    const c = scene(`${src}\n@step one\nhighlight order.customer_id\n@step two\nhighlight customer.id`);
    expect(msgs(c)).toBe("");
    expect(c.fx[0].highlights[0].key).toBe(box(c, 0, "order.customer_id").key);
  });
  test("the LLM view", () => {
    expect(sceneLlm(scene('record order "Order" as=entity: id: uuid [pk], total: Money'))).toBe('Starts with: record order "Order" (entity): id: uuid pk; total: Money.');
  });
  test("commas and colons inside brackets stay in their field", () => {
    const c = scene("record r: pay(amount: Money, at: Instant): Receipt, tags: Map<string, int>, lines: Line[]");
    expect(["pay", "tags", "lines"].map((k) => box(c, 0, `r.${k}`).label)).toEqual(["pay(amount: Money, at: Instant): Receipt", "tags: Map<string, int>", "lines: Line[]"]);
  });
  test("what a record refuses, with the line", () => {
    for (const [src, says] of [
      ["record r: id [key]", "not a field tag"],
      ["record r as=struct", "a record is"],
      ["box b as=class", "kind of record"],
      ["record r: id\nbox b in r", "only its own fields"],
      [`record r: ${Array.from({ length: 61 }, (_, k) => `f${k}`).join(", ")}`, "more than 60 fields"],
      [`record r: ${"x".repeat(201)}`, "at most 200"],
    ] as const) {
      const c = scene(src);
      expect(msgs(c)).toContain(says);
      expect(c.errors[0].line).toBeGreaterThanOrEqual(0);
    }
  });
});

// what "whole" means is worked out here: the bounds of the things, at 11 px for an 11 px word, inside the stage
describe("state", () => {
  const order = '[start] -> cart\ncart -> paying "check out"\npaying -> paid "card accepted"\npaying -> cart "card declined"\npaid -> shipped "ship"\nshipped -> [end]\nstate paying "Paying" note="waits up to 10 minutes for the bank"\ngroup done "Fulfilment": paid, shipped\n@step A shopper fills the cart.\nat cart\n@step They check out.\nfire check out\n@step The bank declines the card: back to the cart.\nfire card declined';
  test("the LLM view is the machine, a table, the notes and the walk", () => {
    const d = dia("state", order, ' title="An order"');
    expect(d.errors).toEqual([]);
    expect(d.warnings).toEqual([]);
    expect(d.llm.split("\n\n")[0]).toBe("State machine: An order. Starts at cart; ends after shipped.");
    for (const row of ["| from | on | to |", "| cart | check out | paying |", "| paying | card declined | cart |", "waits up to 10 minutes", "   at cart", "   cart -> paying (check out)", "   paying -> cart (card declined)"]) expect(d.llm).toContain(row);
  });
  test("the walk lights where it is, and only there", () => {
    const d = dia("state", order), c = compileScene(d.src.head, d.src.steps, d.src.base, d.src.info);
    const lit = (k: number) => c.frames[k].boxes.filter((b) => b.ent.tone === "acc").map((b) => b.label);
    expect([lit(0), lit(1), lit(2)]).toEqual([["cart"], ["Paying"], ["cart"]]);
    expect(c.frames[1].sends.length).toBe(1);
  });
  test("a transition to a group enters its first state", () => {
    const d = dia("state", '[start] -> a\na -> g "go"\nb -> c "next"\ngroup g "G": b, c\n@step start\nat a\n@step go\nfire go\n@step next\nfire next');
    expect(d.errors).toEqual([]);
    expect(d.llm).toContain("a -> b (go)");
    expect(d.llm).toContain("b -> c (next)");
  });
  test("no steps is a still scene; an event may be left out", () => {
    const d = dia("state", "[start] -> a\na -> b\nb -> [end]"), c = compileScene(d.src.head, d.src.steps, d.src.base, d.src.info);
    expect(d.errors).toEqual([]);
    expect(c.frames.length).toBe(1);
    expect(d.llm).toContain("| a | (none) | b |");
  });
  const steps = "\n@step one\nat a\n@step two\n";
  const refusals: [string, string, number][] = [
    ['a -> b "go"\na -> c "go"', "two transitions", 1],
    [`a -> b "go"${steps}fire stop`, '"go"', 4],
    ['a -> b "go"\n@step one\nfire go\n@step two\nat b', "no current state", 2],
    ["[end] -> a", "nothing leaves [end]", 0],
    ["a -> [start]", "nothing goes back into [start]", 0],
    ["[*] -> a", "write [start]", 0],
    ['a -> b\ngroup g "G": a, zz', 'no such state', 1],
    ["[start] -> a\n[start] -> b", "points at one state", 1],
    [`a -> b "x"\nb -> a "y"${steps}fire x\nfire y`, "one fire to a step", 6],
    ["a -> b\n@step one\nat zz\n@step two\nat a", 'no state "zz"', 2],
    ["a => b", "cannot read", 0],
    ["state a [#ff0000]", "colour word", 0],
    ['state a note="run `gen"', "not closed", 0],
  ];
  for (const [body, says, at] of refusals) test(`refuses: ${says}`, () => {
    const e = dia("state", body).errors.find((x) => x.msg.includes(says));
    expect(e).toBeDefined();
    expect(e!.line).toBe(FIRST + at);
  });
  test("an unknown key is refused and the known ones are listed", () => {
    const d = dia("state", "a -> b", " flavour=mild");
    expect(d.errors[0].msg).toContain("title=");
  });
  test("a state that cannot be reached is a warning", () => {
    const d = dia("state", "[start] -> a\na -> b\nc -> b");
    expect(d.errors).toEqual([]);
    expect(d.warnings.map((w) => `${w.line} ${w.msg}`).join()).toContain(`${FIRST + 2} c cannot be reached`);
  });
  test("caps", () => {
    const many = Array.from({ length: 70 }, (_, k) => `s${k} -> s${k + 1}`).join("\n");
    expect(dia("state", many).errors.map((e) => e.msg).join()).toContain("at most 60");
    expect(dia("state", `a -> b "${"x".repeat(310)}"`).errors.map((e) => e.msg).join()).toContain("at most 300");
  });
  test("the document's budget is really charged, and a spent one refuses the part quickly", () => {
    const p = part(page("state", Array.from({ length: 50 }, (_, k) => `s${k} -> s${k + 1}`).join("\n")));
    const t0 = performance.now(), d = withAnimBudget(spent(1500), () => diagramOf(p));
    expect(d.errors.map((e) => e.msg).join()).toContain("too much layout work");
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

const sceneOf = (d: ReturnType<typeof dia>) => compileScene(d.src.head, d.src.steps, d.src.base, d.src.info);
const refusal = (fence: string, body: string, says: string, at: number) => {
  const e = dia(fence, body).errors.find((x) => x.msg.includes(says));
  expect(e).toBeDefined();
  expect(e!.line).toBe(FIRST + at);
};

describe("class", () => {
  const orders = 'class Order\n  + id: OrderId\n  + total(): Money\n  - lines: Line[]\nclass Line\n  + quantity: int\ninterface Payable\n  + pay(amount: Money): Receipt\nabstract class Shape\nenum Status: open, paid, shipped\nOrder implements Payable\nOrder owns 1..* Line\nOrder has 1 Status\nCircle extends Shape\nOrder uses Clock\nOrder 0..* -> 1 Customer "placed by"';
  test("one line for each class, then the relations as sentences", () => {
    const d = dia("class", orders, ' title="Orders"');
    expect(d.errors).toEqual([]);
    expect(d.llm).toContain("class Order implements Payable: + id: OrderId; + total(): Money; - lines: Line[]\n");
    for (const s of ["Order owns 1 or more Line (composition).", "Order has 1 Status (aggregation).", "Circle extends Shape.", "Order uses Clock (dependency).", "enum Status: open, paid, shipped"]) expect(d.llm).toContain(s);
  });
  test("parents sit above children, and an undeclared class is a bare box", () => {
    const c = sceneOf(dia("class", orders)), at = (id: string) => c.frames[0].boxes.find((b) => b.id === id)!;
    expect(at("c.Payable").y + at("c.Payable").h).toBeLessThanOrEqual(at("c.Order").y);
    expect(at("c.Shape").y + at("c.Shape").h).toBeLessThanOrEqual(at("c.Circle").y);
    expect(c.frames[0].boxes.filter((b) => b.ent.parent === "c.Clock").length).toBe(0);
  });
  test("fields are above methods, each on its own row", () => {
    const c = sceneOf(dia("class", orders)), rows = c.frames[0].boxes.filter((b) => b.ent.parent === "c.Order").sort((a, b) => a.y - b.y);
    expect(rows.map((b) => b.id.split(".").pop())).toEqual(["id", "lines", "total"]);
  });
  test("static and abstract members, a type with brackets, a record and n..m", () => {
    const d = dia("class", "record Point\n  + static origin(): Point\n  x: Map<string, int>\n  ys: int []\nPoint owns 2..5 Axis");
    expect(d.errors).toEqual([]);
    expect(d.llm).toContain("+ origin(): Point (static)");
    expect(d.llm).toContain("Point owns 2 to 5 Axis");
  });
  test("what is under a step appears in it", () => {
    const c = sceneOf(dia("class", "class A\n@step one\nclass B\n  + x: int\n@step two\nB extends A"));
    expect(c.errors).toEqual([]);
    expect(c.frames.map((f) => f.edges.length)).toEqual([0, 1]);
    expect(c.frames[0].boxes.some((b) => b.id === "c.B" && b.key >= 0)).toBe(true);
  });
  for (const [body, says, at] of [
    ["A inherits B", "extends, implements, owns, has, uses, ->", 0],
    ["A extends B\nB extends C\nC extends A", "cycle", 2],
    ["class A\nclass A", "declared twice", 1],
    ["  + x: int", "no class is above it", 0],
    ["A owns many B", "not a multiplicity", 0],
    ["A 3..1 -> B", "not a multiplicity", 0],
    ["class A [red]", "colour word", 0],
    ["class A: x, y", "only an enum", 0],
  ] as [string, string, number][]) test(`refuses: ${body.split("\n").join(" / ")}`, () => refusal("class", body, says, at));
});

describe("er", () => {
  const shop = 'entity customer "Customer"\n  id uuid pk\n  email text unique\nentity order "Order"\n  id uuid pk\n  customer_id uuid fk -> customer.id\n  placed_at timestamptz\ncustomer 1 -- 0..* order "places"';
  test("one line for each entity, and the relationship read both ways", () => {
    const d = dia("er", shop);
    expect(d.errors).toEqual([]);
    expect(d.warnings).toEqual([]);
    expect(d.llm).toContain("order (Order): id uuid pk; customer_id uuid fk -> customer.id; placed_at timestamptz");
    expect(d.llm).toContain("A customer places 0 or more orders; an order belongs to exactly 1 customer.");
  });
  test("the line ends on the key and on what it points at", () => {
    const c = sceneOf(dia("er", shop)), f = c.frames[0], id = (k: number) => f.boxes.find((b) => b.key === k)!.id;
    expect(f.edges.map((e) => [id(e.from), id(e.to)])).toEqual([["r.customer.id", "r.order.customer_id"]]);
  });
  test("a key with no relationship is drawn many-to-one, with a warning on its line", () => {
    const d = dia("er", "entity a\n  id int pk\nentity b\n  a_id int null fk -> a.id");
    expect(d.errors).toEqual([]);
    expect(d.warnings[0].line).toBe(FIRST + 3);
    expect(d.warnings[0].msg).toContain("a 0..1 -- 0..* b");
    expect(sceneOf(d).frames[0].edges.length).toBe(1);
  });
  test("two keys to one table are two lines; a key of two columns is one", () => {
    const two = dia("er", "entity a\n  id int pk\nentity b\n  from_id int fk -> a.id\n  to_id int fk -> a.id\na 1 -- 0..* b");
    expect(sceneOf(two).frames[0].edges.length).toBe(2);
    expect(two.warnings.length).toBe(1);
    const both = dia("er", "entity a\n  x int pk\n  y int pk\nentity b\n  ax int fk -> a.x\n  ay int fk -> a.y\na 1 -- 0..* b");
    expect(sceneOf(both).frames[0].edges.length).toBe(1);
    expect(both.warnings).toEqual([]);
  });
  test("a step lights a column, and only for that step", () => {
    const d = dia("er", `${shop}\n@step The key.\nhighlight order.customer_id\n@step The table.\nhighlight customer`), c = sceneOf(d);
    expect(d.errors).toEqual([]);
    expect(d.llm).toContain("lit: order.customer_id");
    expect(c.frames.length).toBe(2);
  });
  for (const [body, says, at] of [
    ["entity a\n  b int fk -> z.id", 'no entity "z"', 1],
    ["entity a\n  id int\nentity b\n  a int fk -> a.nope", 'no column "nope"', 3],
    ["entity a\na 1 -- 1 z", 'no entity "z"', 1],
    ["entity a\nentity b\na 1 -- many b", "1, 0..1, 1..*, 0..*", 2],
    ["entity a\n  id int serial", "pk, fk, unique, null", 1],
    ["entity a\n  id int\n  pk (id)", "pk on each", 2],
    ["entity a\nentity a", "declared twice", 1],
    ["entity a\n  id int\n@step one\nhighlight a.zz\n@step two\nhighlight a", 'no column "zz"', 3],
  ] as [string, string, number][]) test(`refuses: ${body.split("\n").join(" / ")}`, () => refusal("er", body, says, at));
});

describe("the diagrams are bounded", () => {
  test("a long source is refused before it is read", () => {
    const t0 = performance.now();
    expect(dia("class", Array.from({ length: 6000 }, (_, k) => `class C${k}`).join("\n")).errors[0].msg).toContain("at most 1500");
    expect(performance.now() - t0).toBeLessThan(2000);
  });
  for (const [fence, body] of [
    ["class", Array.from({ length: 30 }, (_, k) => `class C${k}\n  + x: int\nC${k} uses C${(k + 1) % 30}`).join("\n")],
    ["er", Array.from({ length: 30 }, (_, k) => `entity e${k}\n  id int pk`).join("\n") + "\n" + Array.from({ length: 30 }, (_, k) => `e${k} 1 -- 0..* e${(k + 1) % 30}`).join("\n")],
  ]) test(`${fence}: a spent budget refuses at once`, () => {
    const p = part(page(fence, body));
    const t0 = performance.now(), d = withAnimBudget(spent(5000), () => diagramOf(p));
    expect(d.errors.map((e) => e.msg).join()).toContain("too much layout work");
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe("a diamond's fanned ends sit on its outline", () => {
  test("two lines out of a choice", () => {
    const c = sceneOf(dia("state", '[start] -> check\nchoice check\ncheck -> ok "[valid]"\ncheck -> failed "[invalid]"')), f = c.frames[0], d = f.boxes.find((b) => b.kind === "diamond")!;
    const out = f.edges.filter((e) => e.from === d.key);
    expect(out.length).toBe(2);
    for (const e of out) {
      const p = sampleGeom(edgeGeom(e, d, f.boxes.find((b) => b.key === e.to)!))[0];
      const r = Math.abs(p.x - d.x - d.w / 2) / (d.w / 2) + Math.abs(p.y - d.y - d.h / 2) / (d.h / 2);
      expect(r).toBeLessThan(1.5);
      expect(r).toBeGreaterThan(0.95);
    }
  });
});

describe("the diagrams in a page", () => {
  const shape = (src: string) => JSON.stringify(structureOf(parseDoc("x.dh.md", src)));
  const en = page("state", '[start] -> a\na -> b "go"\nstate a "Waiting"\n@step It waits.\nat a\n@step It goes.\nfire go');
  test("a translation may change the words, and nothing else", () => {
    const es = page("state", '[start] -> a\na -> b "ir"\nstate a "Esperando"\n@step Espera.\nat a\n@step Va.\nfire ir');
    expect(shape(es)).toBe(shape(en));
    expect(shape(es.replace("[start] -> a", "[start] -> b"))).not.toBe(shape(en));
  });
  test("the LLM view is the machine and not the scene", () => {
    const v = llmView(parseDoc("x.dh.md", en), "x.dh.md");
    expect(v).toContain("| a | go | b |");
    expect(v).not.toContain("send both");
  });
  test("a refused diagram hands the build its reason and its source", () => {
    const b = JSON.stringify(jsonOf(parseDoc("x.dh.md", page("class", "A inherits B")), "", false));
    expect(b).toContain("the six relations are");
    expect(b).toContain("A inherits B");
  });
});

// Twice the source, at most about twice the reading work, counted in work units and never in time. Only reading is held to this:
// the layout is metered separately (core/work.ts). Each source ends in a line that is refused, so no layout runs.
describe("reading a diagram is linear", () => {
  const SOURCE: Record<string, (k: number) => string> = {
    state: (k) => `s${k} -> t "go ${k}"`,
    class: (k) => `A${k} uses B`,
    er: (k) => `  c${k} uuid`,
  };
  const READ = { state: stateDiagram, class: classDiagram, er: erDiagram };
  for (const name of ["state", "class", "er"] as const) {
    test(`${name}: 1400 lines cost at most 2.2 times 700`, () => {
      const work = (n: number) => {
        const before = workTotal();
        const head = [...(name === "er" ? ["entity t"] : []), ...Array.from({ length: n }, (_, k) => SOURCE[name](k)), "not a line ->  -> x"].join("\n");
        const d = READ[name]({ name, head, steps: [], bodyLine: 2, attrs: {} });
        expect(d.errors.length).toBeGreaterThan(0);
        return workTotal() - before;
      };
      const one = work(700), two = work(1400);
      expect(one).toBeGreaterThan(700);
      expect(two / one).toBeLessThanOrEqual(2.2);
    });
  }

  // the scans against the expressions they replaced, which are right and only slow
  test("the hand scans read what the old expressions read", () => {
    const bad: string[] = [], bits = ["a", " ", "  ", '"', "[", "]", "(", ")", "-", ">", "->", "--", "b1", "\t"];
    let seed = 3;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let k = 0; k < 20000; k++) {
      const s = Array.from({ length: 1 + Math.floor(rnd() * 12) }, () => bits[Math.floor(rnd() * bits.length)]).join(""), t = s.trim();
      const lm = s.match(/\s+"([^"]*)"$/), e = endLabel(s);
      if (e.label !== (lm?.[1] ?? "") || e.body !== (lm ? s.slice(0, lm.index) : s)) bad.push(`endLabel ${s}`);
      if (joinBrackets(s) !== s.replace(/\s+(\[[^\]]*\])$/, "$1")) bad.push(`joinBrackets ${s}`);
      const ws = [...s.matchAll(/"([^"]*)"|->|(?:(?!->)[^\s(])+(?:\([^)]*\))?/g)].map((m) => m[1] ?? m[0]);
      if (JSON.stringify(columnWords(s)) !== JSON.stringify(ws)) bad.push(`columnWords ${s}`);
      const m = t.match(/^(\S+?)\s*->\s*(\S+)(?:\s+"([^"]*)")?$/), a = around(t, "->", /^(\S+)(?:\s+"([^"]*)")?$/);
      if (JSON.stringify(m && m.slice(1)) !== JSON.stringify(a && [a.left, ...a.right.slice(1)])) bad.push(`around -> ${t}`);
      const r = t.match(/^(\S+?)\s*--\s*(\S+)\s+([^\s"]+)(?:\s+"([^"]*)")?$/), b = around(t, "--", /^(\S+)\s+([^\s"]+)(?:\s+"([^"]*)")?$/);
      if (JSON.stringify(r && r.slice(1)) !== JSON.stringify(b && [b.left, ...b.right.slice(1)])) bad.push(`around -- ${t}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});

describe("the diagrams in a rendered page", () => {
  const FIX = join(import.meta.dir, "../fixtures");
  const text = (p: string) => readFileSync(join(FIX, p), "utf8");
  test("each format fixture draws: no problem, and the drawing is in the page", () => {
    for (const [name, type] of [["90-state-diagram", "state"], ["91-class-diagram", "class"], ["92-er-diagram", "er"]] as const) {
      const src = text(`format/${name}.dh.md`), d = parse(src);
      expect(check(src)).toEqual([]);
      expect(d.blocks.filter((b) => b.type === type).length).toBe(2);
      const out = html(d);
      expect(out).toContain(`data-dh-part="${type}"`);
      expect(out).toContain("scn-svg");
      expect(out).not.toContain("is not drawn");
    }
  });
  test("one focus per step: every highlight line in a diagram fixture and in the SPEC samples names one thing", () => {
    const files = ["90-state-diagram", "91-class-diagram", "92-er-diagram"].map((n) => text(`format/${n}.dh.md`));
    files.push(readFileSync(join(import.meta.dir, "../SPEC.md"), "utf8"));
    for (const src of files) {
      let inDiagram = false;
      for (const line of src.split("\n")) {
        if (/^```(state|class|er)\b/.test(line)) inDiagram = true;
        else if (line.startsWith("```")) inDiagram = false;
        else if (inDiagram && /^highlight\s/.test(line)) expect(line.trim().split(/\s+/).length).toBe(2);
      }
    }
  });
  test("a static diagram draws its finished state, with no player", () => {
    const out = html(parse(text("format/90-state-diagram.dh.md")));
    expect(out).toContain("is-static");
  });
  test("a diagram that cannot be drawn says why and keeps its source as text", () => {
    const d = parse(text("hostile/22-diagrams-too-big.dh.md")), out = html(d);
    const [a, b] = d.blocks.filter((x) => x.type === "state" || x.type === "class") as any[];
    expect(a.refused[0].msg).toContain("at most 60");
    expect(b.refused[0].msg).toContain("at most 300");
    expect(out).toContain("This state is not drawn");
    expect(out).toContain("This class is not drawn");
    expect(out).toContain("part-plain");
  });
  test("names that look like HTML stay text", () => {
    const out = html(parse(text("hostile/22-diagrams-too-big.dh.md")));
    expect(out).not.toMatch(/<img\b/);
    expect(out).not.toMatch(/<script\b/);
  });
  test("the LLM view is the diagram's words, never the scene", () => {
    const v = viewOf(text("format/92-er-diagram.dh.md"));
    expect(v).toContain("customer");
    expect(v).not.toContain("scn-");
  });
});

describe("a diagram on a phone: the words stay 11 px, the stage is shaped for the layout the browser draws", () => {
  const FIX = join(import.meta.dir, "../fixtures");
  for (const [name, type] of [["90-state-diagram", "state"], ["91-class-diagram", "class"], ["92-er-diagram", "er"]] as const) {
    test(`${type}: at 352 px the rows layout fits at the least word, and the server's stage height is that layout's`, () => {
      const d: any = parse(readFileSync(join(FIX, `format/${name}.dh.md`), "utf8")), b = d.blocks.find((x: any) => x.type === type);
      const wide = compileScene(b.anim.head, b.anim.steps, b.anim.base, b.anim.info);
      const c = wholeLayout(wide, 352, true);
      expect(fitsWide(c, 352)).toBe(true);
      const vars = wholeHeightVars(wide, undefined, true), pick = (w: number) => { const k = vars[`--wh${w}`] ?? "var(--wh)"; const m = k.match(/^var\((--wh[-\w]*)\)$/); return vars[m![1]]; };
      expect(pick(352)).toBe(wholeHeightCss(wholeSize(c)));
    });
  }
});
