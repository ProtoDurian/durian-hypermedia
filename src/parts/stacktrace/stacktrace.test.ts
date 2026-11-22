import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, BudgetError } from "../../core/budget";
import { parseTrace, markApp, detectLang, TRACE_LANGS, traceLlm, secretIn } from "./trace";
import { parseStack } from "./part";
const trace=(n:string)=>readFileSync(new URL(`./fixtures/${n}.txt`,import.meta.url),"utf8");
const fence=(head:string,body:string)=>`# Page\n\n\`\`\`${head}\n${body}\n\`\`\`\n`;
const big=()=>new Budget({steps:1e12,values:1e12,chars:1e12});
const errs=(s:string,limits={})=>check(parse(s,{path:"p.dh.md",limits})).filter(p=>p.level==="error").map(p=>p.message);
describe("stack traces", () => {
  const t = (n: string, app?: string) => { const x = parseTrace(trace(n), null); markApp(x, app); return x; };
  test("every language is detected and read: frames, error line, causes", () => {
    const want: Record<string, { lang: string; blocks: number; frames: number }> = { go: { lang: "go", blocks: 2, frames: 4 }, dotnet: { lang: "dotnet", blocks: 2, frames: 4 }, js: { lang: "js", blocks: 2, frames: 5 }, dart: { lang: "dart", blocks: 1, frames: 4 }, java: { lang: "java", blocks: 2, frames: 4 }, python: { lang: "python", blocks: 2, frames: 3 } };
    for (const n of TRACE_LANGS) { const x = t(n); expect(String(x.lang), n).toBe(want[n].lang); expect(x.blocks.length, n).toBe(want[n].blocks); expect(x.blocks.reduce((a, b) => a + b.frames.length, 0), n).toBe(want[n].frames); expect(detectLang(trace(n)), n).toBe(n); }
  });
  test("Go: panic line, goroutine group, file and line, no standard library as app", () => {
    const x = t("go"); expect(x.blocks[0].head).toContain("index out of range"); expect(x.blocks[1].kind).toBe("thread");
    const f = x.blocks[1].frames[0]; expect([f.file, f.line]).toEqual(["/src/shop/cart/cart.go", 42]); expect(x.blocks[1].frames.find((q) => q.fn.startsWith("net/http"))!.lib).toBe(true); expect(f.app).toBe(true);
  });
  test(".NET: the inner exception is its own block with its own frames", () => {
    const x = t("dotnet"); expect(x.blocks[0].type).toBe("System.InvalidOperationException"); expect(x.blocks[1].type).toBe("System.ArgumentException");
    expect(x.blocks[1].frames[0].line).toBe(42); expect(x.blocks[0].frames[0].fn).toContain("Api.GetItem"); expect(x.blocks[1].frames[1].lib).toBe(true);
  });
  test("JS: node:, node_modules and async frames; a cause", () => {
    const x = t("js"); expect(x.blocks[1].kind).toBe("cause"); expect(x.blocks[0].frames[2].lib).toBe(true); expect(x.blocks[0].frames[3].lib).toBe(true); expect(x.blocks[0].frames[1].fn).toBe("handler"); expect(x.blocks[0].frames[0].col).toBe(11);
  });
  test("Dart: package, dart: and flutter frames, an async gap", () => { const x = t("dart"); expect(x.blocks[0].gaps).toEqual([2]); expect(x.blocks[0].frames[2].lib).toBe(true); expect(x.blocks[0].frames[3].lib).toBe(true); expect(x.blocks[0].frames[0].app).toBe(true); });
  test("Java: java.base frames are library, '... 12 more' kept, Caused by block", () => { const x = t("java"); expect(x.blocks[0].omitted).toBe(12); expect(x.blocks[1].omitted).toBe(5); expect(x.blocks[0].frames[2].lib).toBe(true); expect(x.blocks[1].type).toBe("java.io.IOException"); });
  test("Python: the last exception is the error, the earlier traceback is its cause, source lines kept", () => {
    const x = t("python"); expect(x.blocks[0].type).toBe("ValueError"); expect(x.blocks[1].kind).toBe("cause"); expect(x.blocks[1].type).toBe("OSError"); expect(x.blocks[1].frames[0].code).toBe('raise OSError("boom")'); expect(x.blocks[0].frames[1].lib).toBe(true);
  });
  test("app= marks the author's frames by prefix; with none, what is not a library", () => {
    const x = t("go", "example.com/shop"); expect(x.blocks[1].frames.filter((f) => f.app).length).toBe(2); expect(markApp(t("go"), "no/such")).toBe(0);
  });
});
describe("stacktrace: integration, refusals, caps and budget", () => {
 test("secret guards cover embedded keys and spaced assignments",()=>{expect(secretIn("path/AKIAABCDEFGHIJKLMNOP/end")).toBe("an AWS access key");expect(secretIn("token = abcdefghijklmnop")).toBe("a key, token or password");});
 const body="Error: x\n    at mine (/src/shop/a.ts:1:1)";
 test("plain JSON data, exact LLM and replacement",()=>{const doc=parse(fence("stacktrace",body),{path:"p.dh.md"});const b=doc.blocks.find(b=>b.type==="stacktrace")!;expect(check(doc)).toEqual([]);expect(b.type).toBe("stacktrace");if(b.type!=="stacktrace")throw Error();expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);expect(b.llm).toBe("```stacktrace\n"+body+"\n```");expect(doc.llm).toContain(b.llm!);const other=parse(fence("stacktrace",body)+"\n:::llm\nA short trace.\n:::\n");expect(other.llm).toContain("A short trace.");expect(other.llm).not.toContain("at mine");});
 const cases:[string,string,string][]=[
 ["stacktrace bogus=1",body,"unknown option"],["stacktrace lang=rust",body,"unknown lang"],["stacktrace strip=/src/",body,"strip= needs repo="],["stacktrace",body+"\npassword=hunter2hunter2xx","looks like it holds"],["stacktrace","nothing","could not tell"],["stacktrace lang=go","nothing","no stack frame"],["stacktrace lang=dotnet","    at System.Foo()","before any exception"]];
 for(const [head,text,msg] of cases)test(msg,()=>expect(errs(fence(head,text)).join()).toContain(msg));
 test("unmatched app warns",()=>{const issues=check(parse(fence("stacktrace app=zzz",body)));expect(issues.some(p=>p.level==="warn"&&p.message.includes("matches no frame"))).toBe(true);});
 test("line caps in both sets and host override",()=>{expect([LIMITS.stacktraceLines,UNTRUSTED_LIMITS.stacktraceLines]).toEqual([2000,1000]);const lines=(n:number)=>"Error: x\n"+"    at mine (a.ts:1:1)\n".repeat(n);expect(errs(fence("stacktrace",lines(2001))).join()).toContain("at most 2000");expect(errs(fence("stacktrace",lines(1001)),UNTRUSTED_LIMITS).join()).toContain("at most 1000");expect(errs(fence("stacktrace",lines(4)),{stacktraceLines:3}).join()).toContain("at most 3");});
 test("work overrun propagates and the page names the part",()=>{const d=parse(fence("stacktrace",body),{limits:{maxEvalSteps:10}});expect(d.blocks.some(b=>b.type==="error"&&b.message.startsWith("the stacktrace part"))).toBe(true);expect(d.llm).toContain("[stacktrace not shown: the stacktrace part");});
 test("long LLM folds library runs and llm=full keeps them",()=>{const text=body+"\n"+Array.from({length:80},(_,i)=>`    at lib${i} (/src/shop/node_modules/x/f${i}.js:1:1)`).join("\n");const t=parseTrace(text,"js");expect(traceLlm(text,"stacktrace",{},t)).toContain("... 80 library frames");expect(traceLlm(text,"stacktrace",{llm:"full"},t)).toContain("lib40");});
 test("vendored paths stay library and Go receivers survive",()=>{const t=parseTrace(trace("js"),"js");markApp(t,"/src/shop");expect(t.blocks[0].frames.find(f=>f.fn==="run")).toMatchObject({lib:true,app:false});expect(parseTrace(trace("go"),"go").blocks[1].frames[0].fn).toContain("(*Cart).Item");});
});
describe("stacktrace: deterministic linear work",()=>{
 const cost=(n:number)=>{const b=big();parseTrace("Error: x\n"+"    at fn (a.ts:1:1)\n".repeat(n),"js",b,100000);return b.steps;};
 for(const n of [100,500,2000])test(`double ${n}`,()=>{const r=cost(n*2)/cost(n);expect(r).toBeGreaterThan(1.5);expect(r).toBeLessThan(2.3);});
 test("a long line of parentheses is scanned once",()=>{const cost=(n:number)=>{const b=big();parseTrace("panic: x\ngoroutine 1 [running]:\npkg.F"+"(".repeat(n)+"\n\t/src/a.go:1","go",b);return b.steps;};expect(cost(40000)/cost(20000)).toBeLessThan(2.3);});
});
for(const file of readdirSync(new URL("./fixtures",import.meta.url)).filter(f=>f.endsWith(".dh.md")))test(file,()=>{const s=readFileSync(new URL("./fixtures/"+file,import.meta.url),"utf8");for(const limits of [LIMITS,UNTRUSTED_LIMITS]){const d=parse(s,{limits,path:file});const issues=check(d);if(file.startsWith("good-")){expect(issues).toEqual([]);expect(d.blocks.some(b=>b.type==="stacktrace")).toBe(true);}else{expect(issues.some(p=>p.level==="error")).toBe(true);expect(issues.every(p=>p.line>=1)).toBe(true);}}});
