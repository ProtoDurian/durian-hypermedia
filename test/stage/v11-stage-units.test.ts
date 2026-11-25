// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
import { beforeEach, expect, test } from "bun:test";
import { compileStage, layoutStage, stageLlm } from "../../src/core/stage";
import { beginDocument, newBudget, BudgetError } from "../../src/core/stage-budget";
import { FONT, measure, type Item } from "../../src/core/stage-core";
const compile = (src: string) => compileStage(src, [], 1, {}, {});
beforeEach(() => beginDocument());
test("counts each category and remainder independently", () => {
  const c = compile("units 64: kept 16, added 8, removed 4"); expect(c.errors).toEqual([]);
  expect(stageLlm(c)).toContain("64 units: kept 16, added 8, removed 4, remaining 36");
  const grid = layoutStage(c.model, 1000).items.filter((i) => i.k === "box" && i.cls?.includes("stg-unit"));
  expect(grid.length).toBe(64);
  for (const [label, n] of [["kept", 16], ["added", 8], ["removed", 4], ["remaining", 36]] as const) expect(grid.filter((i) => i.bar?.label === label).length).toBe(n);
});
for (const w of [1000, 340]) test(`units fits ${w}`, () => { const p = layoutStage(compile("units 64: kept 16, added 8, removed 4").model, w); for (const i of p.items) { if (i.k === "box") { expect(i.x).toBeGreaterThanOrEqual(0); expect(i.x + i.w).toBeLessThanOrEqual(w); expect(i.y + i.h).toBeLessThanOrEqual(p.h); } if (i.k === "text") { expect(FONT[i.f].size).toBeGreaterThanOrEqual(11); expect(i.x + measure(i.s, i.f)).toBeLessThanOrEqual(w); } } });
for (const src of ["units 0: kept 0", "units -1: kept 0", "units 1.5: kept 1", "units 3: kept -1", "units 3: kept 1.5", "units 3: unknown 1", "units 3: kept 1 extra", "units 3: kept 1, kept 1", "units 3: kept 2, added 2", "units 3:", "units 3: kept 1\n  extra", "units 9007199254740992: kept 1"]) test(`refuses ${src}`, () => { const c = compile(src); expect(c.errors.length).toBeGreaterThan(0); expect(c.errors[0].line).toBeGreaterThan(0); });
test("zero counts and all assigned totals keep exact count", () => { const c = compile("units 4: kept 0, added 4, removed 0"); expect(c.errors).toEqual([]); expect(layoutStage(c.model, 340).items.filter((i) => i.k === "box" && i.cls?.includes("stg-unit")).length).toBe(4); });
test("hostile count charges before grid allocation", () => { beginDocument(newBudget(1000)); expect(() => compile("units 1000000000: kept 1")).toThrow(BudgetError); });
test("grid work doubles linearly", () => { const work = (n: number) => { const b = beginDocument(), c = compile(`units ${n}: kept ${n}`); layoutStage(c.model, 1000); return 2_000_000 - b.left().work; }; const a = work(256), b = work(512); expect(b).toBeGreaterThan(a * 1.5); expect(b).toBeLessThan(a * 2.1); });
const panel=(raw:string)=>compileStage("",[{title:"Count",raw,line:10},{title:"Next",raw:raw.replaceAll("leaving","gone"),line:20}],1,{}, {job:1,server:2});
test("a head block opts into step panels explicitly; other heads stay setup-only",()=>{
 const yes=panel('units Pieces\n  job 10: kept 8, leaving 2');expect(yes.errors).toEqual([]);expect(yes.model.steps[0].panels[0].block.word).toBe("units");expect(yes.model.steps[0].panels[0].block.kind).toBe("head");expect(yes.model.steps[0].panels[0].block.panel).toBe(true);
 const no=panel('time: 0..4');expect(no.errors.length).toBeGreaterThan(0);expect(no.model.steps[0].panels.length).toBe(0);
});
test("counted role panels sit beside cards with thick leaving and faint gone units",()=>{
 const c=panel('card job: Draft | a copy\nbeside\nunits Stored pieces | one square is one piece\n  job 20: kept 17, leaving 3\n  server 18: kept 13, leaving 5');expect(c.errors).toEqual([]);
 for(const w of [1000,340]){
 const p=layoutStage(c.model,w),units=p.items.filter(i=>i.k==="box"&&i.cls?.includes("stg-unit"));expect(units.length).toBe(76);
 expect(units.filter(i=>i.bar?.label==="leaving").length).toBe(8);expect(units.filter(i=>i.bar?.label==="gone").length).toBe(8);
 expect(units.filter(i=>i.bar?.label==="leaving").every(i=>i.k==="box"&&i.thick)).toBe(true);
 expect(units.filter(i=>i.bar?.label==="gone").every(i=>i.k==="box"&&i.fill==="surface-2")).toBe(true);
 const card=p.items.find(i=>i.k==="box"&&i.bar?.label==="Draft"),unit=units.find(i=>i.from===1);
 if(card?.k!=="box"||unit?.k!=="box")throw new Error("missing beside panels");if(w===1000)expect(unit.x).toBeGreaterThan(card.x+card.w);else expect(unit.y).toBeGreaterThan(card.y+card.h);
 for(const i of units)if(i.k==="box"){expect(i.x).toBeGreaterThanOrEqual(0);expect(i.x+i.w).toBeLessThanOrEqual(w);expect(i.y+i.h).toBeLessThanOrEqual(p.h);expect(i.from).toBe(i.to);}
 }
 expect(stageLlm(c)).toContain("job: 20 units, kept 17, leaving 3");expect(stageLlm(c)).toContain("gone 3");
});
for(const word of ["beside 0","beside 1.5","beside 10","beside words"])test(`refuses invalid panel shares ${word}`,()=>expect(panel(word+'\nunits Pieces\n  job 4: kept 4').errors.length).toBeGreaterThan(0));
for(const raw of ['units Pieces\n  missing 4: kept 4','units Pieces\n  job 0: kept 0','units Pieces\n  job 4: kept 5','units Pieces\n  job 4: leaving 2, leaving 1','units Pieces\n  job 4: unknown 2','units Pieces\n  job 4: gone -1','units Pieces\n  job 4: kept 4\n  job 4: kept 4'])test(`refuses invalid counted panel ${raw}`,()=>{const c=panel(raw);expect(c.errors.length).toBeGreaterThan(0);expect(c.errors[0].line).toBeGreaterThan(10);});
test("panel expansion stops on the document budget before allocating squares",()=>{beginDocument(newBudget(1000));expect(()=>panel('units Pieces\n  job 1000000000: kept 1')).toThrow(BudgetError);});
test("counted panel work doubles with its square count",()=>{
 const work=(n:number)=>{const b=beginDocument();const c=panel(`units Pieces\n  job ${n}: kept ${n}`);layoutStage(c.model,1000);return 2_000_000-b.left().work;};
 const a=work(256),b=work(512);expect(Number.isFinite(a)&&Number.isFinite(b)).toBe(true);expect(b).toBeGreaterThan(a*1.5);expect(b).toBeLessThan(a*2.1);
});
test("panel squares and soft badges have independent declared roles, followed by plain and muted text",()=>{
 const c=panel('units Copies | Counted pieces\n  job (server) 12: kept 9, leaving 3\n  job (job) 12: kept 8, leaving 4\n  The copies agree.\n  ~ Compare the remaining pieces.');
 expect(c.errors).toEqual([]);
 for(const w of [1000,340]){
  const p=layoutStage(c.model,w),first=p.items.filter(i=>i.from===1),squares=first.filter(i=>i.k==="box"&&i.cls?.includes("stg-unit"));
  expect(squares.length).toBe(24);expect(squares.every(i=>i.k==="box"&&i.fill==="role:job:soft")).toBe(true);
  const badge=first.find(i=>i.k==="box"&&i.fill==="role:server:soft");
  expect(badge?.k==="box"&&badge.stroke==="role:server:line").toBe(true);
  expect(badge?.bar).toEqual({kind:"chip",label:"s",id:"unit-panel:0:badge",role:"server"});
  const note=first.find(i=>i.k==="text"&&i.s==="Counted pieces"),plain=first.find(i=>i.k==="text"&&i.s==="The copies agree."),muted=first.find(i=>i.k==="text"&&i.s==="Compare the remaining pieces.");
  if(note?.k!=="text"||plain?.k!=="text"||muted?.k!=="text")throw new Error("missing panel prose");
  expect(plain.y).toBeGreaterThan(note.y);expect(muted.y).toBeGreaterThan(plain.y);expect(plain.ink).toBe("ink");expect(muted.ink).toBe("muted");
 }
 expect(stageLlm(c)).toContain("job (server): 12 units");expect(stageLlm(c)).toContain("Compare the remaining pieces.");
 expect(panel('units Copies\n  job (missing) 4: kept 4').errors.length).toBeGreaterThan(0);
 expect(panel('units Copies\n  job 4: kept 4\n  The reason: both copies remain.').errors).toEqual([]);
 expect(panel('units Copies\n  job 4: kept 4\n  words\n  server 4: kept 4').errors.length).toBeGreaterThan(0);
});
test("muted gone and remaining squares do not declare an active role palette",()=>{
 const c=panel('units Pieces\n  job 10: kept 5, gone 3');expect(c.errors).toEqual([]);
 const squares=layoutStage(c.model,340).items.filter(i=>i.k==="box"&&i.cls?.includes("stg-unit")&&i.from===1);
 expect(squares.length).toBe(10);
 const muted=squares.filter(i=>i.bar?.label==="gone"||i.bar?.label==="remaining");expect(muted.length).toBe(5);
 expect(muted.every(i=>i.k==="box"&&i.fill==="surface-2"&&i.stroke==="scn-faint-edge"&&i.bar?.role===undefined)).toBe(true);
 expect(squares.filter(i=>i.bar?.label==="kept").every(i=>i.bar?.role==="job")).toBe(true);
});
test("a wide units panel draws large upright squares across its width; its note sits under the last group; a phone keeps small squares",()=>{
  const c=panel('units Pods | 32-35 leave\n  job 36: kept 32, leaving 4\n  server 36: kept 32, leaving 4');expect(c.errors).toEqual([]);
  const at=(w:number)=>{const p=layoutStage(c.model,w);return {p,sq:p.items.filter((i):i is Extract<Item,{k:"box"}>=>i.k==="box"&&!!i.cls?.includes("stg-unit")&&(i.on?i.on.includes(1):(i.from??1)<=1&&(!i.to||i.to>=1)))};};
  const {p,sq}=at(1000),first=sq[0],last=sq[71];
  expect(sq.length).toBe(72);expect(first.w).toBeGreaterThanOrEqual(14);expect(first.h).toBeGreaterThan(first.w);
  expect(new Set(sq.slice(0,36).map(s=>s.y)).size).toBe(1); // one line of 36
  const note=p.items.find((i):i is Extract<Item,{k:"text"}>=>i.k==="text"&&i.s==="32-35 leave"&&(i.on?i.on.includes(1):(i.from??1)<=1))!;
  expect(note.anchor).toBe("end");expect(note.x).toBeCloseTo(last.x+last.w,0);expect(note.y).toBeGreaterThan(last.y+last.h);
  const ph=at(356).sq;expect(ph[0].w).toBeLessThanOrEqual(10);expect(ph[0].h).toBe(ph[0].w);
});

test("on a phone a units row's squares keep a readable size (9 px, 2 px apart, rows 3 px apart) and wrap onto even rows instead of shrinking", () => {
  for (const w of [340, 319]) {
    beginDocument();
    const c = compileStage("panels", [{ title: "One", raw: "beside 1, 2\ncard job: config | replicas: 36\nunits StatefulSets: 36 pods each | 32-35 leave\n  job 36: kept 32, leaving 4\n  server 36: kept 32, leaving 4", line: 2 }, { title: "Two", raw: "", line: 9 }], 1, {}, { job: 1, server: 2 });
    expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w), sq = p.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && i.cls === "scn-shape stg-unit");
    expect(sq.length).toBe(72);
    for (const s of sq) { expect(s.w).toBeGreaterThanOrEqual(9); expect(s.h).toBeGreaterThanOrEqual(9); }
    const first = sq.filter((s) => s.id?.startsWith("unit-panel:0:")), ys = [...new Set(first.map((s) => s.y))].sort((a, b) => a - b);
    expect(ys.length).toBe(2);
    const perRow = ys.map((y) => first.filter((s) => s.y === y).length);
    expect(Math.abs(perRow[0] - perRow[1])).toBeLessThanOrEqual(1);       // even rows: 18 + 18
    for (const y of ys) { const row = first.filter((s) => s.y === y).sort((a, b) => a.x - b.x); for (let k = 1; k < row.length; k++) expect(row[k].x - (row[k - 1].x + row[k - 1].w)).toBeGreaterThanOrEqual(2); }
    for (const s of sq) expect(s.x + s.w).toBeLessThanOrEqual(w);
  }
  beginDocument();
  const d = compileStage("panels", [{ title: "One", raw: "beside 1, 2\ncard job: config | replicas: 36\nunits StatefulSets: 36 pods each | 32-35 leave\n  job 36: kept 32, leaving 4", line: 2 }, { title: "Two", raw: "", line: 9 }], 1, {}, { job: 1, server: 2 });
  const desk = layoutStage(d.model, 1280).items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && i.cls === "scn-shape stg-unit");
  expect(new Set(desk.map((s) => s.y)).size).toBe(1); // a desktop keeps its one wide row
});
