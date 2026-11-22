import {describe,test,expect} from "bun:test";
import {readFileSync,readdirSync} from "node:fs";
import {parse,check,LIMITS,UNTRUSTED_LIMITS} from "../../index";
import {Budget,BudgetError} from "../../core/budget";
import {parseLog as readLog,parseLogLine,parseHighlight,logLlm,logRaws} from "./logview";
import {parseLogQL,filterEntries,LogQLError,type Entry} from "./logql";
import {compileRegex} from "./re";
import {DEFAULT_CAPS} from "./query";
const newBudget=(steps=500000,values=500000)=>new Budget({steps,values,chars:1e12});
const parseLog=(b:string,n:number,a:Record<string,string>={},budget=newBudget())=>readLog(b,n,a,budget);
const ENTRIES=(ss:string[])=>ss.map((s,i)=>parseLogLine(s,i+1));
const fence=(head:string,b:string)=>`# Page\n\n\`\`\`${head}\n${b}\n\`\`\`\n`;
const errs=(s:string,limits={})=>check(parse(s,{path:"p.dh.md",limits})).filter(p=>p.level==="error").map(p=>p.message);
test("regex compilation charges empty nested repeats and is deterministic",()=>{
 expect(()=>compileRegex("(?:){200}{200}{200}","",DEFAULT_CAPS,newBudget(100))).toThrow(BudgetError);
 const cost=()=>{const b=newBudget();compileRegex("[a-z]+","",DEFAULT_CAPS,b).test("hello",b);return[b.steps,b.values];};expect(cost()).toEqual(cost());
});
test("measured cap attempts in both presets",()=>{
 const measured: Record<string,number> = {};
 for(const [preset,limits] of [["authored",LIMITS],["untrusted",UNTRUSTED_LIMITS]] as const){
  const cases:Record<string,string[]>={
   log:[fence("log","a\n".repeat(limits.logLines+1)),fence("log",Array.from({length:1000},(_,i)=>`info request n=${i}`).join("\n"))],
  };
  for(const [part,sources]of Object.entries(cases)){let worst=0;for(const source of sources)for(let i=0;i<3;i++){const at=performance.now();parse(source,{limits,path:"p.dh.md"});worst=Math.max(worst,performance.now()-at);}measured[part+" "+preset]=Math.round(worst*100)/100;}
 }
 console.log("cap attempts, maximum milliseconds",JSON.stringify(measured));
});
describe("log: folder contract",()=>{
 const body="info request span=s1 trace=t1 status=200";
 test("plain JSON, exact LLM, document and replacement",()=>{const d=parse(fence("log",body),{path:"p.dh.md"});expect(check(d)).toEqual([]);const b=d.blocks.find(b=>b.type==="log")!;if(b.type!=="log")throw Error();expect(b.data.entries[0].fields).toMatchObject({span:"s1",trace:"t1"});expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);expect(b.llm).toBe("```log\n"+body+"\n```");expect(d.llm).toContain(b.llm!);const o=parse(fence("log",body)+"\n:::llm\nA request succeeded.\n:::\n");expect(o.llm).toContain("A request succeeded.");expect(o.llm).not.toContain("span=s1");});
 test("empty log and unknown option",()=>{expect(errs(fence("log","")).join()).toContain("empty");expect(errs(fence("log bogus=1",body)).join()).toContain("unknown option");});
 for(const [line,msg]of [["@highlight line 0 [bad] \"why\"","starting at 1"],["@highlight line 3-1 [bad] \"why\"","smaller to a larger"],["@highlight line 1 [bad] \"\"","empty"],["@highlight","reason in double quotes"]])test(msg,()=>expect(errs(fence("log",body+"\n"+line)).join()).toContain(msg));
 test("caps in both sets and host lower caps",()=>{expect(LIMITS.logLines).toBe(5000);expect(UNTRUSTED_LIMITS.logLines).toBe(2500);expect(errs(fence("log","a\n".repeat(5001))).join()).toContain("at most 5000");expect(errs(fence("log","a\n".repeat(2501)),UNTRUSTED_LIMITS).join()).toContain("at most 2500");expect(errs(fence("log","a\nb\nc"),{logLines:2}).join()).toContain("at most 2");expect(errs(fence('log filter="longquery"',body),{logQueryChars:3}).join()).toContain("query is too long");});
 test("page budget propagates with the part name",()=>{const d=parse(fence("log",body.repeat(100)),{limits:{maxEvalSteps:100}});expect(d.blocks.some(b=>b.type==="error"&&b.message.startsWith("the log part"))).toBe(true);expect(d.llm).toContain("[log not shown: the log part");});
 test("fresh reader budget recovers after a large query",()=>{const es=ENTRIES(["a".repeat(500)]);const bad=filterEntries('|~ "(a+)+b"',es,{},newBudget(10));expect(bad.ok).toBe(false);expect(filterEntries("a",es,{},newBudget()).ok).toBe(true);});
 test("serialized rows do not inherit Object prototype fields",()=>{const es=JSON.parse(JSON.stringify(ENTRIES(["info hello"])));expect(filterEntries('{constructor=~".*"}',es,{},newBudget()).ok).toBe(true);const r=filterEntries('| constructor = "Object"',es,{},newBudget());expect(r.ok&&r.out.keep).toEqual([false]);});
 for(const n of [100,400,1600])test(`doubling ${n}`,()=>{const cost=(n:number)=>{const b=newBudget();parseLog(Array.from({length:n},(_,i)=>`info request n=${i}`).join("\n"),1,{},b);return b.steps;};const r=cost(2*n)/cost(n);expect(r).toBeGreaterThan(1.5);expect(r).toBeLessThan(2.3);});
 test("linear regex, selectors and long lines",()=>{const cost=(n:number)=>{const b=newBudget();compileRegex("(a+)+b").test("a".repeat(n),b);return b.steps;};for(const n of [100,500,2000]){expect(cost(n*2)/cost(n)).toBeGreaterThan(1.5);expect(cost(n*2)/cost(n)).toBeLessThan(2.3);}const b=newBudget(100);expect(filterEntries('{msg=~"(a+)+b"}',ENTRIES(["a".repeat(2000)]),{},b).ok).toBe(false);const a=newBudget(),c=newBudget();parseLog("x".repeat(20000),1,{},a);parseLog("x".repeat(40000),1,{},c);expect(c.steps/a.steps).toBeLessThan(2.3);});
 for(const file of readdirSync(new URL("./fixtures",import.meta.url)).filter(f=>f.endsWith(".dh.md")))test(file,()=>{const text=readFileSync(new URL("./fixtures/"+file,import.meta.url),"utf8");for(const limits of[LIMITS,UNTRUSTED_LIMITS]){const d=parse(text,{limits,path:file}),ps=check(d);if(file.startsWith("good-")){expect(ps).toEqual([]);expect(d.blocks.some(b=>b.type==="log")).toBe(true);}else{expect(ps.some(p=>p.level==="error")).toBe(true);expect(ps.every(p=>p.line>=1)).toBe(true);}}});
});
describe("LogQL subset", () => {
  const log = ENTRIES([
    "2026-11-20T10:08:01Z info  deploy started version=1.4",
    "2026-11-20T10:09:03Z warn  cache miss rate high rate=0.41",
    "2026-11-20T10:09:05Z error request failed path=/cart status=500 err=\"timeout after 30s\" duration=31.2s",
    "2026-11-20T10:09:07Z error request failed path=/health status=503 duration=350ms",
    "{\"time\":\"2026-11-20T10:09:08Z\",\"level\":\"debug\",\"msg\":\"cache warm\",\"status\":200}",
  ]);
  const run = (q: string, labels: Record<string, string> = { app: "shop" }) => { const r = filterEntries(q, log, labels, newBudget()); if (!r.ok) throw new Error(r.message); return r.out.keep.map((k, i) => (k ? i + 1 : 0)).filter(Boolean); };
  test("reads time, level, message and fields from logfmt and JSON lines", () => {
    expect(log[2]).toMatchObject({ time: "2026-11-20T10:09:05Z", level: "error", msg: "request failed", fields: { path: "/cart", status: "500", err: "timeout after 30s" } });
    expect(log[4]).toMatchObject({ level: "debug", msg: "cache warm", fields: { status: "200" } });
  });
  test("stream selector: =, !=, =~, !~ on labels and fields", () => {
    expect(run('{level="error"}')).toEqual([3, 4]); expect(run('{level=~"warn|error"}')).toEqual([2, 3, 4]); expect(run('{level!="info", app="shop"}')).toEqual([2, 3, 4, 5]); expect(run('{app="cart"}')).toEqual([]);
    expect(run('{path!~"/h.*"}', {})).toEqual([1, 2, 3, 5].filter((n) => n !== 4)); expect(run('{status="503"}')).toEqual([4]);
  });
  test("line filters: |= != |~ !~", () => {
    expect(run('|= "timeout"')).toEqual([3]); expect(run('!= "request"')).toEqual([1, 2, 5]); expect(run('|~ "5\\d\\d"')).toEqual([3, 4]); expect(run('!~ "status"')).toEqual([1, 2]);
    expect(run('{level="error"} != "health" |= "failed"')).toEqual([3]);
  });
  test("field filters with numbers, durations and strings; json and logfmt are accepted", () => {
    expect(run("| json | status >= 500")).toEqual([3, 4]); expect(run("| logfmt | duration > 2s")).toEqual([3]); expect(run("| duration < 1s")).toEqual([4]);
    expect(run('| status = 200')).toEqual([5]); expect(run('| path =~ "/c.*"')).toEqual([3]); expect(run('| status >= 500 and path != "/health"')).toEqual([3]); expect(run('| status = 200 or status = 503')).toEqual([4, 5]);
    expect(run("| status >= 500, duration > 1s")).toEqual([3]);
  });
  test("plain words mean |= \"words\"; an empty box keeps everything", () => { expect(run("cache")).toEqual([2, 5]); expect(run("")).toEqual([1, 2, 3, 4, 5]); });
  test("matched words are reported for line filters", () => {
    const r = filterEntries('|= "failed"', log, {}, newBudget()); expect(r.ok && r.out.marks[2].length).toBeGreaterThan(0);
    const raw = log[2].raw, m = r.ok ? r.out.marks[2][0] : [0, 0]; expect(raw.slice(m[0], m[1])).toBe("failed");
  });
  test("metric queries and other stages are refused by name", () => {
    for (const [q, what] of [['rate({app="shop"}[5m])', "rate"], ['count_over_time({app="shop"}[1m])', "count_over_time"], ['sum by (level) (rate({a="b"}[1m]))', "sum"], ["| line_format \"{{.msg}}\"", "line_format"], ["| label_format a=b", "label_format"], ["| unwrap duration", "unwrap"], ["| pattern \"<a>\"", "pattern"], ["| regexp \"(?P<a>.)\"", "regexp"], ["| drop a", "drop"]] as const) {
      expect(() => parseLogQL(q), q).toThrow(LogQLError); expect(() => parseLogQL(q), q).toThrow(/LogQL subset/); expect(() => parseLogQL(q), q).toThrow(new RegExp(what));
    }
  });
  test("syntax errors name the place", () => {
    for (const q of ['{level="error"', '{level=error}', '|= timeout', '| status >', '|~ "("', '{level="error"} ~ "x"']) { let e: any; try { parseLogQL(q); } catch (x) { e = x; } expect(e, q).toBeInstanceOf(LogQLError); expect(e.message, q).toMatch(/at character \d+|not supported/); }
  });
  test("a filter that needs too much work shows 'too much work'", () => {
    const big = ENTRIES(Array.from({ length: 3000 }, (_, i) => `line ${i} ${"a".repeat(200)}`));
    const r = filterEntries('|~ "(a|aa)+b"', big, {}, newBudget(2000, 1000)); expect(r.ok).toBe(false); if (!r.ok) expect(r.message).toBe("too much work: make it smaller");
    const t = Date.now(); filterEntries('|~ "(a*)*b"', big, {}, newBudget()); expect(Date.now() - t).toBeLessThan(5000);
  });
});

describe("log view", () => {
  const body = [
    "2026-11-20T10:08:01Z info  deploy started version=1.4",
    "2026-11-20T10:08:12Z info  migration applied name=0042",
    "2026-11-20T10:09:03Z warn  cache miss rate high rate=0.41",
    "2026-11-20T10:09:05Z error request failed path=/cart status=500 err=\"timeout after 30s\"",
    "2026-11-20T10:09:06Z error request failed path=/cart status=500 err=\"timeout after 30s\"",
    '@highlight |= "timeout" [bad] "every failure is the same timeout"',
    '@highlight line 3 [warn] "the first sign"',
  ].join("\n");
  const attrs = { title: "x", labels: "app=shop, env=prod", filter: '{level=~"warn|error"}' };
  test("lines, labels, folded repeats, highlights with the lines they match", () => {
    const s = parseLog(body, 10, attrs);
    expect(s.errors).toEqual([]); expect(s.lines).toBe(5); expect(s.labels).toEqual({ app: "shop", env: "prod" }); expect(s.entries.length).toBe(4); expect(s.entries[3].repeat).toBe(2);
    expect(s.highlights.map((h) => h.matched)).toEqual([[4, 5], [3]]);
  });
  test("the LLM view: highlights first, lines as written, repeats as (×2)", () => {
    const s = parseLog(body, 10, attrs), t = logLlm(s, attrs, logRaws(body));
    expect(t.startsWith("Highlights: lines 4-5 match |= \"timeout\": every failure is the same timeout; line 3: the first sign.")).toBe(true);
    expect(t).toContain("(×2)"); expect(t).toContain("```log"); expect(t).not.toContain("@highlight");
  });
  test("llm=highlights keeps the lit lines and 2 around, and says how many were left out", () => {
    const long = Array.from({ length: 30 }, (_, i) => `2026-11-20T10:00:${String(i).padStart(2, "0")}Z info  tick n=${i}`).concat(['@highlight line 15 [bad] "the odd one"']).join("\n");
    const a = { llm: "highlights" }, t = logLlm(parseLog(long, 1, a), a, logRaws(long));
    expect(t).toContain("n=14"); expect(t).toContain("n=16"); expect(t).not.toContain("n=2\n"); expect(t).toMatch(/\(\d+ other lines left out/);
  });
  test("refusals name the line: bad filter=, bad highlight, no match, line past the end, too many lines", () => {
    const m = (b: string, a: Record<string, string> = {}) => parseLog(b, 10, a).errors.map((e) => e.msg);
    expect(m("a line", { filter: "{level=" }).join()).toContain("filter=");
    expect(m('a line\n@highlight |= "zzz" [bad] "x"').join()).toContain("matches no line");
    expect(m('a line\n@highlight line 9 [bad] "x"').join()).toContain("past the end");
    expect(m('a line\n@highlight |= "line" [pink] "x"').join()).toContain("unknown colour");
    expect(m('a line\n@highlight |= "line"').join()).toContain("reason in double quotes");
    expect(m('a line\n@highlight rate({a="b"}[1m]) [bad] "x"').join()).toContain("LogQL subset");
    expect(m(Array.from({ length: 5001 }, (_, i) => `l${i}`).join("\n")).join()).toContain("at most 5000");
  });
  test("highlight lines parse", () => {
    expect(parseHighlight('@highlight line 3-5 [good] "ok"')).toMatchObject({ hl: { kind: "lines", from: 3, to: 5, colour: "good" } });
    expect(parseHighlight('@highlight |~ "5\\d\\d" "why"')).toMatchObject({ hl: { kind: "filter", colour: "warn" } });
  });
  test("a log that needs more work than the document's budget is refused", () => {
    expect(() => parseLog(Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n"), 1, {}, newBudget(50,1000))).toThrow(BudgetError);
  });
  test("doccheck: the sample shape passes; bad parts are refused with the part's line", () => {
    expect(errs(fence('log title="x" filter="{level=\\"error\\"}"', body))).toEqual([]);
    expect(errs(fence("log", 'a\n@highlight |= "nope" [bad] "x"')).join()).toContain("matches no line");
    expect(errs(fence("log color=red", "a")).join()).toContain('unknown option "color"');
  });
});

