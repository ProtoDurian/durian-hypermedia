import { describe, expect, test, beforeEach } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, BudgetError } from "../../core/budget";
import trace, { parseTrace as rawParse, traceLlm, traceToFlame, searchSpans, type TraceSpec } from "./part";
import type { Src } from "./source";
import { TraceView } from "./view";
import { Flame } from "../flame/view";
import { UI } from "../../ui/ui";
const TRACE_CAPS = { spans: LIMITS.traceSpans, lines: LIMITS.traceLines, depth: LIMITS.traceDepth };
class CountBudget extends Budget {
 left(){return {work:this.limits.steps-this.steps,memory:this.limits.values-this.values}}
}
const newBudget=(steps=1e9,values=1e9)=>new CountBudget({steps,values,chars:1e9});
let budget=newBudget();
const beginDocument=(b:CountBudget)=>{budget=b;return b};
const fresh=()=>beginDocument(newBudget());
const src=(body:string, attrs:Record<string,string>={}):Src=>({body,attrs,bodyLine:10,line:9,head:"",steps:[]});
const parseTrace=(s:Src)=>rawParse(s,LIMITS,budget);
const errs=(body:string,attrs:Record<string,string>={})=>{fresh();return parseTrace(src(body,attrs)).errors.map(e=>e.msg)};
beforeEach(()=>{fresh()});
const stage={width:800,theme:"light" as const,motion:"off" as const,report:()=>{}};
const fence=(body:string,attrs="")=>`# P\n\n\`\`\`trace ${attrs}\n${body}\n\`\`\`\n`;
const BIG = `web        POST /checkout        0 842  user=u7 region=us-west-2
  gateway  route /checkout       3 838  route=checkout
    auth   verify.token          6  44  method=jwt
      db   SELECT sessions      10  38  rows=1
    cart   cart.load            47 205  items=3
      db   SELECT cart_items    52 121  rows=3
      db   SELECT prices       126 198  rows=3 cache=miss
    inventory stock.reserve     50 171  warehouse=w2
      db   UPDATE stock         57 166  rows=1 id=stock-update
    payment charge.card        208 812  provider=examplepay error="payment provider timed out"
      payment tls.connect      212 255
      payment provider.call    258 804  attempt=1 id=provider error="upstream timeout after 540 ms"
    queue  publish.retry       814 834  topic=payments.retry id=retry
@log db 130 warn "row lock held 94 ms" span=stock-update
@log payment 258 info "calling examplepay /v2/charge"
@log payment 804 error "upstream timeout after 540 ms, giving up"
@log queue 820 info "queued a retry for order o-2291"
@log web 840 error "answered 504 to the client"
@service db [c5] "Postgres"`;

describe("trace: reading", () => {
  test("the checkout sample: spans, nesting, services in order, logs on the deepest span of their service", () => {
    const s = parseTrace(src(BIG, { title: "POST /checkout", trace: "t-7f3a" }));
    expect(s.errors).toEqual([]); expect(s.warnings).toEqual([]);
    expect(s.spans.length).toBe(13);
    expect(s.services.map((x) => x.id)).toEqual(["web", "gateway", "auth", "db", "cart", "inventory", "payment", "queue"]);
    expect(s.services.find((x) => x.id === "db")).toMatchObject({ colour: "c5", label: "Postgres", spans: 4 });
    expect(s.services.find((x) => x.id === "web")!.colour).toBe("c1"); // one family colour per service, in order of first use
    const by = (n: string) => s.spans.find((x) => x.name === n)!;
    expect(by("SELECT sessions").parent).toBe(by("verify.token").id);
    expect(by("route /checkout").parent).toBe(by("POST /checkout").id);
    expect(by("UPDATE stock")).toMatchObject({ key: "stock-update", depth: 3 });
    expect(by("verify.token").attrs).toEqual([{ k: "method", v: "jwt" }]);
    expect(by("charge.card").error).toBe("payment provider timed out");
    expect(s.logs.length).toBe(5);
    expect(s.logs[0]).toMatchObject({ service: "db", level: "warn", span: by("UPDATE stock").id }); // span=stock-update picks it (two db spans hold 130)
    expect(s.logs[4]).toMatchObject({ service: "web", span: by("POST /checkout").id });
    expect(s.origin).toBe(0); expect(s.length).toBe(842);
  });
  test("self time is the length minus what the children cover (parallel children counted once)", () => {
    const s = parseTrace(src(`web root 0 100\n  api a 10 60\n  api b 30 80\n  api c 90 95`));
    expect(s.spans[0].self).toBe(100 - (80 - 10) - 5);
  });
  test("a span name keeps spaces and numbers; values may be quoted; a colour word sets the bar colour", () => {
    const s = parseTrace(src(`web GET /v2 items 3 0 50 q="a b" [warn]\n  api step 2 5 9`));
    expect(s.errors).toEqual([]);
    expect(s.spans[0]).toMatchObject({ name: "GET /v2 items 3", colour: "warn", attrs: [{ k: "q", v: "a b" }] });
    expect(s.spans[1].name).toBe("step 2");
  });
  test("comments and blank lines are skipped; a unit is kept; the default unit is ms", () => {
    const s = parseTrace(src(`// a trace\n\nweb a 0 5`, { unit: "us" }));
    expect(s.unit).toBe("us"); expect(parseTrace(src(`web a 0 5`)).unit).toBe("ms");
  });
  test("a flat list with parent= and id= becomes the same tree, in any line order", () => {
    const s = parseTrace(src(`db q 8 40 id=c parent=b\nweb r 0 60 id=a\napi l 3 55 id=b parent=a`));
    expect(s.errors).toEqual([]);
    expect(s.order.map((i) => s.spans[i].name)).toEqual(["r", "l", "q"]);
    expect(s.spans.find((x) => x.name === "q")!.depth).toBe(2);
  });
  test("open= folds at the start and critical= is read", () => {
    const s = parseTrace(src(`web a 0 9\n  api b 1 8\n    db c 2 6`, { open: "2", critical: "off" }));
    expect(s.open).toBe(2); expect(s.critical).toBe(false);
  });
});

describe("trace: the critical path", () => {
  test("the child that ended last is waited for; the parallel branch that ended earlier is not", () => {
    const s = parseTrace(src(BIG));
    const names = s.path.map((i) => s.spans[i].name);
    expect(names).toEqual(["POST /checkout", "route /checkout", "verify.token", "SELECT sessions", "cart.load", "SELECT cart_items", "SELECT prices", "charge.card", "tls.connect", "provider.call", "publish.retry"]);
    expect(names).not.toContain("stock.reserve"); // ended at 171, while cart.load ran to 205
    expect(names).not.toContain("UPDATE stock");
  });
  test("parallel children that end together: the longer one is chosen", () => {
    const s = parseTrace(src(`web r 0 100\n  api long 10 100\n  api short 60 100`));
    expect(s.path.map((i) => s.spans[i].name)).toEqual(["r", "long"]);
  });
});

describe("trace: the LLM view", () => {
  test("indented lines with lengths, logs under their spans, the critical path, Slowest spans, Errors", () => {
    const t = traceLlm(parseTrace(src(BIG, { title: "POST /checkout" })));
    expect(t).toContain("web POST /checkout 0–842 (842 ms) user=u7 region=us-west-2");
    expect(t).toContain("      payment provider.call 258–804 (546 ms) attempt=1 ERROR: upstream timeout after 540 ms");
    expect(t).toContain("        log 804 error: upstream timeout after 540 ms, giving up");
    expect(t).toContain("Critical path (what the end waited for): POST /checkout > route /checkout > verify.token");
    expect(t).toContain("Slowest spans");
    expect(t).toContain("- provider.call (payment): 546 ms of its own, 546 ms in all");
    expect(t).toContain("Errors:\n- charge.card (payment) at 208–812: payment provider timed out");
    expect(traceLlm(parseTrace(src(`web a 0 5\n  api b 1 2`)))).toContain("Errors: none.");
  });
  test("the LLM view of the big sample is over 400 tokens, so the page gives it a :::llm block", () => {
    expect(traceLlm(parseTrace(src(BIG))).length / 4).toBeGreaterThan(400);
  });
});

describe("trace: every refusal names the line and the fix", () => {
  test("a child outside its parent's time", () => { const e = errs(`web a 0 10\n  api b 5 12`); expect(e.length).toBe(1); expect(e[0]).toMatch(/"b" \(5 to 12\) is outside its parent "a" \(0 to 10\).*fix a time or move the line/); });
  test("an end before its start", () => expect(errs(`web a 9 3`)[0]).toMatch(/ends \(3\) before it starts \(9\); swap them/));
  test("a log outside every span of its service", () => {
    const e = errs(`web a 0 10\n  api b 1 4\n@log api 8 warn "late"`);
    expect(e[0]).toMatch(/log at 8 is outside every api span \(they run 1–4\); fix the time or the service/);
  });
  test("a log for a service no span uses, a bad level, a bad @log", () => {
    expect(errs(`web a 0 10\n@log db 2 info "x"`)[0]).toMatch(/names the service "db", which no span uses/);
    expect(errs(`web a 0 10\n@log web 2 loud "x"`)[0]).toMatch(/level "loud" is not known; use debug, info, warn, error/);
    expect(errs(`web a 0 10\n@log web 2 info`)[0]).toMatch(/@log <service> <time> <level> "text"/);
  });
  test("a span= on a log that names no span of the service", () => expect(errs(`web a 0 10\n@log web 2 info "x" span=zzz`)[0]).toMatch(/span=zzz is not a web span/));
  test("a colour that is not a word, with the allowed words", () => { const e = errs(`web a 0 10 [#ff0000]`); expect(e[0]).toMatch(/not a colour word; use \[c1\]/); expect(errs(`web a 0 10\n@service web [pink]`)[0]).toMatch(/not a colour word/); });
  test("a line that is not a span, a tab, an unknown option, @step, an unknown @ line", () => {
    expect(errs(`web a ten 20`)[0]).toMatch(/a span line is "service name start end"/);
    expect(errs(`web a 0 9\n\tapi b 1 2`)[0]).toMatch(/indent with spaces, not tabs/);
    expect(errs(`web a 0 9`, { colour: "x" })[0]).toMatch(/unknown option "colour"/);
    fresh(); expect(parseTrace({ ...src(`web a 0 9`), steps: [{ title: "s", raw: "", line: 12 }] }).errors[0].msg).toMatch(/no @step/);
    expect(errs(`web a 0 9\n@note x`)[0]).toMatch(/unknown line "@note"/);
  });
  test("options with a bad value", () => {
    expect(errs(`web a 0 9`, { open: "0" })[0]).toMatch(/open= is how many levels/);
    expect(errs(`web a 0 9`, { critical: "yes" })[0]).toMatch(/critical= is on or off/);
    expect(errs(`web a 0 9`, { unit: "milli seconds" })[0]).toMatch(/unit= is a short word/);
    expect(errs(`web a 0 9`, { trace: "a b" })[0]).toMatch(/trace= is an id/);
  });
  test("the first span indented, no spans, a service that is not an id", () => {
    expect(errs(`  web a 0 9`)[0]).toMatch(/first span is not indented/);
    fresh(); expect(parseTrace(src("// nothing\n")).errors[0].msg).toMatch(/no spans; write "service name start end"/);
    expect(errs(`we"b a 0 9`)[0]).toMatch(/is an id: letters, digits/);
  });
  test("parent= that names nothing, an id used twice, an @service for a service no span uses", () => {
    expect(errs(`web a 0 9 id=a\napi b 1 2 parent=zz`)[0]).toMatch(/parent=zz names no span/);
    expect(errs(`web a 0 9 id=a\napi b 1 2 id=a`)[0]).toMatch(/id=a is used twice \(first on line 10\)/);
    expect(errs(`web a 0 9\n@service nope [c2]`)[0]).toMatch(/@service nope names a service no span uses/);
  });
  test("parents that go in a circle", () => {
    const e = errs(`web a 0 9 id=a parent=c\napi b 1 8 id=b parent=a\ndb c 2 7 id=c parent=b`);
    expect(e.length).toBe(1); expect(e[0]).toMatch(/go round in a circle.*remove one parent= link/);
  });
  test("a span nested deeper than the cap", () => {
    let body = ""; for (let i = 0; i <= TRACE_CAPS.depth + 1; i++) body += `${" ".repeat(i)}s${i} n${i} 0 100\n`;
    expect(errs(body).some((m) => /nested deeper than 80 levels/.test(m))).toBe(true);
  });
  test("a trace with no length warns, two roots warn", () => {
    fresh(); expect(parseTrace(src(`web a 5 5`)).warnings[0].msg).toMatch(/no length/);
    fresh(); expect(parseTrace(src(`web a 0 5\nweb b 6 9`)).warnings[0].msg).toMatch(/2 spans at the left edge/);
  });
});

describe("trace: the drawing, read back from the markup", () => {
  const draw = (spec: TraceSpec | null, error: string | null = null) => renderToStaticMarkup(React.createElement(TraceView, { spec, error, ui: UI.en, stage }));
  test("one row per visible span, one chip per service, a log diamond per log, error badge, critical outline", () => {
    const s = parseTrace(src(BIG, { title: "POST /checkout" }));
    const html = draw(s);
    expect((html.match(/data-sid="/g) ?? []).length).toBe(13);
    expect((html.match(/class="trace-chip"/g) ?? []).length).toBe(8);
    expect((html.match(/class="tr-log"/g) ?? []).length).toBe(5);
    expect((html.match(/class="tr-err"/g) ?? []).length).toBe(2);
    expect((html.match(/class="tr-crit"/g) ?? []).length).toBe(11);
    expect((html.match(/data-dh-slot="span-bar"/g) ?? []).length).toBe(13);
    expect(html).toContain('data-dh-slot="minimap"');
    expect(html).toContain("Postgres"); // the @service label
  });
  test("open=2 starts with the third level folded; a folded span says how many it hides", () => {
    const s = parseTrace(src(BIG, { open: "2" }));
    const html = draw(s);
    expect((html.match(/data-sid="/g) ?? []).length).toBe(2);
    expect(html).toContain(">+11<");
  });
  test("critical=off draws no outline", () => {
    expect(draw(parseTrace(src(BIG, { critical: "off" })))).not.toContain('class="tr-crit"');
  });
  test("a span's own colour word colours its bar", () => {
    expect(draw(parseTrace(src(`web a 0 9 [warn]`)))).toContain('fill="var(--warn-soft)"');
  });
  test("a refused part draws its refusal, not a crash", () => {
    const html = draw(null, "trace: boom"); expect(html).toContain("This part cannot be drawn:"); expect(html).toContain("trace: boom");
  });
  test("the flame view is the same spans: service.name frames, same times", () => {
    const s = parseTrace(src(BIG)); const f = traceToFlame(s);
    expect(f.frames.length).toBe(13); expect(f.frames[0]).toMatchObject({ name: "web.POST /checkout", start: 0, end: 842, total: 842 });
    expect(f.roots).toEqual(s.roots); expect(f.span).toBe(842);
  });
});

describe("trace: linear time (the work doubles when the input doubles)", () => {
  // time-free: the budget charges counted at n and at 2n; the larger may cost at most 2.3 times the smaller
  const used = (body: string, attrs: Record<string, string> = {}) => { const b = beginDocument(newBudget(1e9, 1e9)); const s = parseTrace(src(body, attrs)); expect(s.errors).toEqual([]); return { work: 1e9 - b.left().work, mem: 1e9 - b.left().memory }; };
  const wide = (n: number) => ["web root 0 100000"].concat(Array.from({ length: n }, (_, i) => `  api s${i % 50} ${i * 10} ${i * 10 + 8} k=${i}`)).join("\n");
  const deep = (n: number) => Array.from({ length: n }, (_, i) => `${" ".repeat(i % 40)}api s${i} 0 100000`).join("\n");
  const flat = (n: number) => Array.from({ length: n }, (_, i) => `api s${i} 0 10 id=i${i}${i ? ` parent=i${Math.floor((i - 1) / 4)}` : ""}`).join("\n");
  const logged = (n: number) => wide(n) + "\n" + Array.from({ length: n / 4 }, (_, i) => `@log api ${i * 40 + 2} info "x${i}"`).join("\n");
  for (const [name, make, ns] of [["many children", wide, [200, 400, 800]], ["deep, many roots", deep, [200, 400, 800]], ["a flat list with parent=", flat, [300, 600, 1200]], ["spans with logs", logged, [200, 400, 800]]] as const) {
    test(`${name}: charges at 2n are at most 2.3 times those at n`, () => {
      for (let k = 0; k + 1 < ns.length; k++) {
        const a = used(make(ns[k]), { critical: "on" }), c = used(make(ns[k + 1]), { critical: "on" });
        expect(c.work).toBeLessThanOrEqual(a.work * 2.3); expect(c.mem).toBeLessThanOrEqual(a.mem * 2.3);
      }
    });
  }
  test("a search at 2n spans costs at most 2.3 times the search at n", () => {
    const cost = (n: number) => { const s = parseTrace(src(wide(n))); const b = newBudget(1e9, 1e9); searchSpans(s, "k=1", b); return 1e9 - b.left().work; };
    expect(cost(800)).toBeLessThanOrEqual(cost(400) * 2.3);
  });
});

describe("trace: colours and the flame view", () => {
  test("family colours go to services in order of first use and skip the ones an @service line chose", () => {
    const s = parseTrace(src(BIG));
    expect(Object.fromEntries(s.services.map((x) => [x.id, x.colour]))).toEqual({ web: "c1", gateway: "c2", auth: "c3", db: "c5", cart: "c4", inventory: "c6", payment: "c7", queue: "c8" });
  });
  test("with more than 8 services the colours wrap", () => {
    const s = parseTrace(src(Array.from({ length: 10 }, (_, i) => `s${i} n 0 5`).join("\n")));
    expect(s.services.map((x) => x.colour).slice(7, 10)).toEqual(["c8", "c1", "c2"]);
  });
  test("in the flame view no two frames that overlap in time share a row, and a child is below its parent", () => {
    const f = traceToFlame(parseTrace(src(BIG)));
    for (const a of f.frames) {
      if (a.parent >= 0) expect(a.depth).toBeGreaterThan(f.frames[a.parent].depth);
      for (const b of f.frames) if (a.id < b.id && a.depth === b.depth) expect(a.end <= b.start || b.end <= a.start).toBe(true);
    }
    const by = (n: string) => f.frames.find((x) => x.name.endsWith(n))!;
    expect(by("cart.load").depth).not.toBe(by("stock.reserve").depth); // they ran in parallel
  });
  test("spans that never overlap keep their nesting depth in the flame view", () => {
    const s = parseTrace(src(`web a 0 100\n  api b 1 40\n    db c 2 20\n  api d 50 90`)); const f = traceToFlame(s);
    expect(f.frames.map((x) => x.depth)).toEqual(s.spans.map((x) => x.depth));
  });
});

describe("trace: package contract",()=>{
 test("plain JSON data, checks, exact page text and LLM replacement",()=>{
  const body="web a 0 5",doc=parse(fence(body,'title="T"')); const b=doc.blocks.find(b=>b.type==="trace");
  expect(b?.type).toBe("trace"); if(b?.type!=="trace")throw Error("missing trace");
  expect(check(doc)).toEqual([]);expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);
  const want='Trace: T. 1 span across 1 service (web); 5 ms in all. Each line is a span: its service, name, when it started and ended (ms) and how long it took; indented lines are inside the line above; "log" lines belong to the span above them.\n\nweb a 0–5 (5 ms)\n\nCritical path (what the end waited for): a\n\nSlowest spans (by the time each ran itself, children left out):\n- a (web): 5 ms of its own, 5 ms in all\n\nErrors: none.';
  expect(traceLlm(b.data)).toBe(want);expect(doc.llm).toContain(want);
  const over=parse(fence(body)+'\n:::llm\nOne span.\n:::\n');expect(over.llm).toContain("One span.");expect(over.llm).not.toContain("Slowest spans");
 });
 const caps:[string,number,string,RegExp][]=[
  ["traceSpans",1,"web root 0 5\n  api child 1 2",/more than 1 spans/],
  ["traceLines",1,"web root 0 5\n  api child 1 2",/at most 1 lines/],
  ["traceDepth",1,"web root 0 5\n  api child 1 4\n    db query 2 3",/deeper than 1/],
  ["traceName",1,"web root 0 5",/name is at most 1/],
  ["traceAttrs",1,"web root 0 5 a=1 b=2",/at most 1 key=value/],
  ["traceValue",1,"web root 0 5 a=ab",/value is at most 1/],
  ["traceLogs",1,'web root 0 5\n@log web 1 info "a"\n@log web 2 info "b"',/more than 1 @log/],
  ["traceServices",1,"web root 0 5\n  api child 1 2",/at most 1 \(merge/],
  ["traceText",1,'web root 0 5\n@log web 1 info "ab"',/text is at most 1/],
 ];
 for(const [key,value,body,re] of caps)test("host cap "+key,()=>{
  expect(check(parse(fence(body),{limits:{[key]:value}})).some(p=>re.test(p.message))).toBe(true);
  expect((UNTRUSTED_LIMITS as any)[key]).toBeLessThanOrEqual((LIMITS as any)[key]);
 });
 test("line, span and log caps at package defaults",()=>{
  for(const [body,re] of [
   [Array.from({length:2001},(_,i)=>`web s${i} ${i} ${i+1}`).join("\n"),/more than 2000 spans/],
   [Array.from({length:6001},()=>"web a 0 1").join("\n"),/at most 6000 lines/],
   ['web root 0 5\n'+Array.from({length:501},()=> '@log web 1 info "x"').join("\n"),/more than 500 @log/],
  ] as const){const ps=rawParse(src(body),LIMITS,newBudget()).errors;expect(ps.some(p=>re.test(p.msg))).toBe(true);expect(ps.every(p=>p.line>=1)).toBe(true)}
 });
 test("part work, memory and text budgets refuse without escaping parse",()=>{
  for(const limits of [{maxEvalSteps:10},{maxEvalValues:1},{maxEvalChars:1}]){
   const d=parse(fence(BIG),{limits});const e=d.blocks.find(b=>b.type==="error");expect(e?.type==="error"&&e.message).toMatch(/^the trace part/);expect(d.llm).toContain("[trace not shown: the trace part");
  }
 });
 test("static draws every span without interaction controls",()=>{
  const spec=parseTrace(src(BIG,{open:"2"}));
  const html=renderToStaticMarkup(React.createElement(TraceView,{spec,error:null,ui:UI.en,stage,static:""}));
  expect((html.match(/data-sid="/g)??[]).length).toBe(13);expect(html).not.toContain('class="trace-bar"');expect(html).not.toContain('data-dh-slot="minimap"');
 });
 test("non-finite trace lengths are refused as serializable data",()=>{
  const large="1"+"0".repeat(308);
  const s=parseTrace(src(`web a -${large} 0\nweb b 0 ${large}`));
  expect(s.errors.some(e=>e.msg.includes("trace length is not finite"))).toBe(true);expect(JSON.parse(JSON.stringify(s))).toEqual(s);
 });
 test("malformed quoted fields are refused",()=>{
  for(const body of ['web a 0 5 a="unterminated','web a 0 5\n@log web 1 info "x"oops','web a 0 5\n@service web "x"oops'])expect(errs(body).length).toBeGreaterThan(0);
 });
 test("a long single line has linear charges",()=>{
  const cost=(n:number)=>{const b=newBudget();rawParse(src("x".repeat(n)),LIMITS,b);return b.steps+b.values+b.chars};
  const ratio=cost(40000)/cost(20000);expect(ratio).toBeGreaterThan(1.5);expect(ratio).toBeLessThan(2.3);
 });
 test("overlapping log placement and parallel flame lanes double linearly",()=>{
  const cost=(n:number)=>{
   const body="web root 0 100\n"+Array.from({length:n},(_,i)=>`  api s${i} 1 99 id=s${i}`).join("\n")+"\n"+Array.from({length:n/4},(_,i)=>`@log api 50 info "x${i}"`).join("\n");
   const b=newBudget(),s=rawParse(src(body),LIMITS,b);expect(s.errors).toEqual([]);
   expect(s.logs.every(l=>l.span===1)).toBe(true);
   const f=traceToFlame(s,b);expect(new Set(f.frames.slice(1).map(f=>f.depth)).size).toBe(n);
   return b.steps+b.values+b.chars;
  };
  for(const n of [100,300,600]){const ratio=cost(2*n)/cost(n);expect(ratio).toBeGreaterThan(1.5);expect(ratio).toBeLessThan(2.3)}
 });
 test("definition",()=>{expect(trace.name).toBe("trace");expect(trace.steps).toBe(true)});
});
for(const f of readdirSync(join(import.meta.dir,"fixtures")))test(f,()=>{
 for(const limits of [LIMITS,UNTRUSTED_LIMITS]){
  const text=readFileSync(join(import.meta.dir,"fixtures",f),"utf8"),doc=parse(text,{path:f,limits}),ps=check(doc);
  if(f.startsWith("good-")){expect(ps).toEqual([]);expect(doc.blocks.some(b=>b.type==="trace")).toBe(true)}
  else{expect(ps.some(p=>p.level==="error")).toBe(true);expect(ps.every(p=>p.line>=1)).toBe(true)}
 }
});
test("sample page has no problems",()=>expect(check(parse(readFileSync(join(import.meta.dir,"sample.md"),"utf8")))).toEqual([]));
test("measure hostile inputs in both presets",()=>{
 const text=readFileSync(join(import.meta.dir,"fixtures/hostile-caps.dh.md"),"utf8");
 for(const [name,limits] of [["LIMITS",LIMITS],["UNTRUSTED_LIMITS",UNTRUSTED_LIMITS]] as const){let worst=0;for(let i=0;i<10;i++){const t=performance.now();expect(check(parse(text,{limits})).some(p=>p.level==="error")).toBe(true);worst=Math.max(worst,performance.now()-t)}console.log(`trace ${name} hostile worst of 10: ${worst.toFixed(2)} ms`)}
});

test("service label and initial open caps are configurable",()=>{
 const s=rawParse(src(`web a 0 5\n@service web \"Readable service\"`),{...LIMITS,traceServiceLabel:4},newBudget());expect(s.services[0].label).toBe("Read");
 expect(check(parse(fence("web root 0 5","open=2"),{limits:{traceOpen:1}})).some(p=>p.message.includes("from 1 to 1"))).toBe(true);
 expect(UNTRUSTED_LIMITS.traceOpen).toBeLessThanOrEqual(LIMITS.traceOpen);expect(UNTRUSTED_LIMITS.traceServiceLabel).toBeLessThanOrEqual(LIMITS.traceServiceLabel);
});
