import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget } from "../../core/budget";
import flame, { parseFlame, flameLlm, searchFrames } from "./part";
const fence = (body: string, attrs = "") => `# P\n\n\`\`\`flame ${attrs}\n${body}\n\`\`\`\n`;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const src = (body: string, attrs: Record<string,string> = {}) => ({ body, bodyLine: 4, line: 3, attrs, head: body, steps: [] });
const fl = (body: string, attrs: Record<string,string> = {}) => parseFlame(src(body,attrs), LIMITS, big());
const C = "0 120 request\n  2 14 auth.check\n  15 95 handler.order\n    16 70 db.query";
const F = "main;serve;parse 120\nmain;serve;db.query 300\nmain;gc 45";
describe("flame: parser and text", () => {
 test("plain serializable data and page checks", () => {
  const doc = parse(fence(C),{path:"p.dh.md"}); const block = doc.blocks.find(b=>b.type==="flame");
  expect(block?.type).toBe("flame"); if(block?.type!=="flame") throw Error("missing flame");
  expect(block.data.frames.map(f=>[f.name,f.depth,f.start,f.end])).toEqual([["request",0,0,120],["auth.check",1,2,14],["handler.order",1,15,95],["db.query",2,16,70]]);
  expect(block.data.frames[0].self).toBe(28); expect(check(doc)).toEqual([]);
  expect(JSON.parse(JSON.stringify(block.data))).toEqual(block.data);
 });
 test("exact chart text, document text and override",()=>{
  const want="Flame chart: T (ms). Each line is a call: its name, when it started and ended, and how long it took; indented lines are inside the line above.\n\nrequest 0–120 (120 ms)\n  auth.check 2–14 (12 ms)\n  handler.order 15–95 (80 ms)\n    db.query 16–70 (54 ms)";
  expect(flameLlm(fl(C,{title:"T",unit:"ms"}))).toBe(want);
  expect(parse(fence(C,'title="T" unit=ms')).llm).toContain(want);
  const override=parse(fence(C)+"\n:::llm\nA traced request.\n:::\n");
  expect(override.llm).toContain("A traced request.");expect(override.llm).not.toContain("Each line is a call");
 });
 test("folded merge, lexical placement, top stacks and own time",()=>{
  const s=fl(F+"\nmain;serve;parse 30",{unit:"samples"});expect(s.errors).toEqual([]);expect(s.dir).toBe("up");
  const by=Object.fromEntries(s.frames.map(f=>[f.name,f]));expect(by.main.total).toBe(495);expect(by.parse.total).toBe(150);
  expect(s.children[by.serve.id].map(i=>s.frames[i].name)).toEqual(["db.query","parse"]);
  expect(flameLlm(fl(F))).toContain("| main;serve;db.query | 300 | 64.5% |");
  expect(flameLlm(fl(Array.from({length:200},(_,i)=>`main;a${i%17};f${i} ${i+1}`).join("\n"))).length/4).toBeLessThan(500);
 });
 test("search counts matching ancestry once, with its own budget",()=>{
  const s=fl("0 100 main\n  10 40 main.child\n  50 70 other");expect(searchFrames(s,"MAIN")).toEqual({ids:[0,1],total:100});
  expect(()=>searchFrames(s,"main",new Budget({steps:1,values:1,chars:1}))).toThrow();
 });
});
const cases: [string,string,RegExp][] = [
 ["empty","",/no frames/], ["mix",C+"\na;b 2",/not a chart line/], ["bad graph",F+"\njust words",/not a folded stack/],
 ["outside","0 10 root\n  1 11 child",/outside its parent/], ["reverse","10 5 root",/before it starts/],
 ["zero","a;b 0",/not above 0/], ["negative","a;b -1",/not above 0/], ["empty name","a;;b 1",/empty frame name/],
 ["tabs","0 10 root\n\t1 2 child",/spaces, not tabs/], ["first indent","  0 1 root",/first frame is not indented/],
 ["chart name","0 1 "+"x".repeat(121),/name is at most 120/],
 ["chart depth",Array.from({length:82},(_,i)=>" ".repeat(i)+"0 1 f"+i).join("\n"),/deeper than 80/],
 ["graph depth",Array.from({length:81},()=>"x").join(";")+" 1",/deeper than 80/],
 ["steps",C+"\n@step first\n@step second",/takes no @step/],
 ["lines",Array.from({length:6001},()=>"a 1").join("\n"),/at most 6000 lines/],
 ["frames","0 5000 root\n"+Array.from({length:2001},(_,i)=>`  ${i} ${i+1} f${i}`).join("\n"),/more than 2000 frames/],
];
for(const [name,body,re] of cases)test("refuses "+name+" with a line",()=>{const ps=check(parse(fence(body),{limits:{maxEvalSteps:1e8,maxEvalChars:1e8,maxEvalValues:1e8}}));expect(ps.some(p=>re.test(p.message))).toBe(true);expect(ps.every(p=>p.line>=1)).toBe(true)});
for(const [attrs,re] of [["dir=left",/dir= is up or down/],["colour=red",/colour= is group or heat/],["size=l",/unknown option/]] as const)test("refuses "+attrs,()=>expect(check(parse(fence(F,attrs))).some(p=>re.test(p.message))).toBe(true));
test("caps from both sets and host overrides",()=>{
 expect(LIMITS.flameFrames).toBe(2000);expect(UNTRUSTED_LIMITS.flameFrames).toBeLessThanOrEqual(2000);
 for(const [key,value,body,re] of [["flameFrames",2,C,/more than 2 frames/],["flameLines",2,C,/at most 2 lines/],["flameDepth",1,C,/deeper than 1/],["flameName",3,C,/name is at most 3/]] as const)expect(check(parse(fence(body),{limits:{[key]:value}})).some(p=>re.test(p.message))).toBe(true);
 const d=parse(fence(C),{limits:{maxEvalSteps:10}});const b=d.blocks.find(x=>x.type==="error");expect(b?.type==="error"&&b.message).toMatch(/^the flame part/);expect(d.llm).toContain("[flame not shown: the flame part");
});
test("doubling charges at three sizes, charts and folded stacks and searches",()=>{
 for(const form of ["chart","graph"])for(const n of [50,200,800]){
  const cost=(n:number)=>{const b=big();const body=form==="chart"?`0 ${n} root\n`+Array.from({length:n},(_,i)=>`  ${i} ${i+1} frame${String(i).padStart(5,"0")}`).join("\n"):Array.from({length:n},(_,i)=>`main;frame${String(i).padStart(5,"0")} 1`).join("\n");const s=parseFlame(src(body),{...LIMITS,flameFrames:10000},b);searchFrames(s,"frame",b);return b.steps+b.values+b.chars};
  const ratio=cost(2*n)/cost(n);expect(ratio).toBeGreaterThan(1.5);expect(ratio).toBeLessThan(2.3);
 }
 const b=big(),c=big();parseFlame(src("x".repeat(20000)),LIMITS,b);parseFlame(src("x".repeat(40000)),LIMITS,c);expect(c.steps/b.steps).toBeLessThan(2.2);
});
for(const f of readdirSync(join(import.meta.dir,"fixtures")))test(f,()=>{for(const limits of [LIMITS,UNTRUSTED_LIMITS]){const doc=parse(readFileSync(join(import.meta.dir,"fixtures",f),"utf8"),{path:f,limits});const ps=check(doc);if(f.startsWith("good-")){expect(ps).toEqual([]);expect(doc.blocks.some(b=>b.type==="flame")).toBe(true)}else{expect(ps.some(p=>p.level==="error")).toBe(true);expect(ps.every(p=>p.line>=1)).toBe(true)}}});
test("definition",()=>{expect(flame.name).toBe("flame");expect(flame.steps).toBe(true)});

test("SVG text, direction, complete static state and phone scroll box", async () => {
 const React = await import("react");
 const { renderToStaticMarkup } = await import("react-dom/server");
 const { Flame } = await import("./view"); const { UI } = await import("../../ui/ui");
 const stage = { width: 390, theme: "light" as const, motion: "off" as const, report: () => {} };
 const html = renderToStaticMarkup(React.createElement(Flame, {spec:fl(C),error:null,ui:UI.en,stage}));
 expect((html.match(/data-dh-slot="frame"/g)??[]).length).toBe(4);
 expect(html).toContain(">request</text>");expect(html).toContain('class="flame-box"');
 const still = renderToStaticMarkup(React.createElement(Flame, {spec:fl(C),error:null,ui:UI.en,stage,static:""}));
 expect(still).not.toContain('type="search"');expect(still).not.toContain('class="flame-bar"');
 expect((still.match(/data-dh-slot="frame"/g)??[]).length).toBe(4);
});

test("numeric radix order keeps finite signed and fractional values stable", async()=>{
 const { numberOrder } = await import("./order");
 const xs=[2.5,-10,0,-0,-0.1,1e100,-1e100,2.5];
 expect(numberOrder(xs,x=>x)).toEqual([-1e100,-10,-0.1,0,-0,2.5,2.5,1e100]);
});

test("measure capped and hostile inputs in both presets",()=>{
 const hostile=readFileSync(join(import.meta.dir,"fixtures/hostile-caps.dh.md"),"utf8");
 for(const [name,limits] of [["LIMITS",LIMITS],["UNTRUSTED_LIMITS",UNTRUSTED_LIMITS]] as const){
  let worst=0;
  for(let i=0;i<10;i++){const before=performance.now();const d=parse(hostile,{limits});expect(check(d).some(p=>p.level==="error")).toBe(true);worst=Math.max(worst,performance.now()-before)}
  console.log(`flame ${name} hostile worst of 10: ${worst.toFixed(2)} ms`);
 }
});

test("accumulated samples stay finite plain JSON",()=>{
 const n="1"+"0".repeat(308), s=fl(`a;b ${n}\na;c ${n}`);
 expect(s.errors.some(e=>e.msg.includes("combined count is not finite"))).toBe(true);
 expect(JSON.parse(JSON.stringify(s))).toEqual(s);
});
