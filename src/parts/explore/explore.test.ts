import {describe,test,expect} from "bun:test";
import {readFileSync,readdirSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {parse,check,LIMITS,UNTRUSTED_LIMITS} from "../../index";
import {Budget,BudgetError} from "../../core/budget";
import {compileJq,runJq,runReaderQuery,JqUnsupported,type J} from "../log/jq";
import {compileRegex,RegexError} from "../log/re";
import {DEFAULT_CAPS} from "../log/query";
import {readCsv,guardData} from "./data";
const newBudget=(steps=1e12,values=1e12)=>new Budget({steps,values,chars:1e12});
let active=newBudget();const beginDocument=(b=newBudget())=>active=b;const docBudget=()=>active;
const QUERY_LIMITS={...DEFAULT_CAPS,work:DEFAULT_CAPS.steps};
const fence=(lang:string,body:string,attrs="")=>`# Page\n\n\`\`\`${lang} explore ${attrs}\n${body}\n\`\`\`\n`;
const errs=(s:string,limits={})=>check(parse(s,{path:"p.dh.md",limits})).filter(p=>p.level==="error").map(p=>p.message);
const value=(s:string)=>{const b=parse(s,{path:"p.dh.md"}).blocks.find(b=>b.type==="explore")!;if(b?.type!=="explore")throw Error("explore missing");return b.data;};
describe("jq: deterministic work",()=>{
 for(const n of[100,400,1600])test(`map and sum double ${n}`,()=>{const cost=(n:number)=>{const b=newBudget();compileJq(`[range(${n})] | map(. + 1) | add`).run(null,b);return b.steps;};const r=cost(2*n)/cost(n);expect(r).toBeGreaterThan(1.5);expect(r).toBeLessThan(2.3);});
 test("indices do not repeatedly copy prefixes",()=>{const cost=(n:number)=>{const b=newBudget();compileJq('indices("a")').run("a".repeat(n),b);return b.steps;};expect(cost(4000)/cost(2000)).toBeLessThan(2.3);});
 test("an authored starting query can exceed the reader input length",()=>expect(runReaderQuery(" ".repeat(600)+".a",{a:1})).toEqual({ok:true,results:[1]}));
 test("derived result depth and object keys remain safe",()=>{const r=runReaderQuery("fromjson","[".repeat(110)+"0"+"]".repeat(110));expect(r.ok).toBe(false);const x=runReaderQuery('{"__proto__": {"safe": 1}}',null);expect(x.ok&&Object.keys(x.results[0] as object)).toEqual(["__proto__"]);});
 test("deep merge keeps a prototype-looking key as data",()=>{const r=runReaderQuery('{} * {"__proto__": {"safe": 1}}',null);expect(r.ok&&Object.keys(r.results[0] as object)).toEqual(["__proto__"]);});
});
describe("explore: formats and plain data",()=>{
 test("JSON, YAML, TOML and CSV",()=>{expect(value(fence("json",'{"a":[1,2]}')).value).toEqual({a:[1,2]});expect(value(fence("yaml","a:\n  - 1\n  - b: 2")).value).toEqual({a:[1,{b:2}]});expect(value(fence("csv","a,b\n1,x\n2,\"y, z\"")).value).toEqual([{a:1,b:"x"},{a:2,b:"y, z"}]);expect(value(fence("toml","a=1\n[t]\nb=[1,2]")).value).toEqual({a:1,t:{b:[1,2]}});});
 test("ordinary fences remain code",()=>{for(const lang of["json","yaml","toml","csv"]){const s=fence(lang,"{}").replace(" explore ","");expect(parse(s).blocks.some(b=>b.type==="explore")).toBe(false);}});
 test("exact LLM, author query, replacement and serializable data",()=>{const body='{"a":[1,2]}',src=fence("json",body,'query=".a | length"'),d=value(src);expect(d.results).toEqual([2]);expect(d.text).toBe('```json explore query=".a | length"\n'+body+'\n```\n\nQuery `.a | length` gives:\n2');expect(parse(src).llm).toContain(d.text);expect(JSON.parse(JSON.stringify(d))).toEqual(d);expect(check(parse(src,{path:"p.dh.md"}))).toEqual([]);const o=parse(src+"\n:::llm\nTwo items.\n:::\n");expect(o.llm).toContain("Two items.");expect(o.llm).not.toContain("Query `");});
 test("quoted strings survive in authored query attributes",()=>{const q='.[] | select(.name == "tea")';const src=fence("json",'[{"name":"tea"},{"name":"cup"}]',"query="+JSON.stringify(q));expect(check(parse(src,{path:"p.dh.md"}))).toEqual([]);expect(value(src).results).toEqual([{name:"tea"}]);});
 test("CSV quoting and safe header names",()=>{expect(readCsv('a,b\n"x ""q""",3\n"two\nlines",4.5\n',1).rows).toEqual([{a:'x "q"',b:3},{a:"two\nlines",b:4.5}]);expect(Object.keys(readCsv("__proto__,constructor\nx,y",1).rows[0] as object)).toEqual(["__proto__","constructor"]);});
 const cases:[string,string,string,string?][]=[
 ["json","{a:","does not parse"],["yaml","a: [1","does not parse"],["csv",'a,b\n"x,2',"never closed"],["csv","a\n","at least one row"],["csv","a,a\n1,2","same name"],["csv","a,b\n1,2,3","has 3 fields"],["json","{}","unknown option","bogus=1"],["json","{}","jq subset",'query="limit(3)"'],["json",'{"a":5}',"Cannot index",'query=".a.b"']];
 for(const[lang,body,msg,attrs]of cases)test(msg+":"+lang,()=>expect(errs(fence(lang,body,attrs)).join()).toContain(msg));
 test("caps in both sets and host overrides",()=>{expect([LIMITS.exploreChars,UNTRUSTED_LIMITS.exploreChars]).toEqual([262144,131072]);expect(errs(fence("json",JSON.stringify("x".repeat(262145)))).join()).toContain("at most 262144");expect(errs(fence("json",JSON.stringify("x".repeat(131073))),UNTRUSTED_LIMITS).join()).toContain("at most 131072");expect(errs(fence("json","[1,2]"),{exploreChars:3}).join()).toContain("at most 3");expect(errs(fence("json","[[[0]]]"),{exploreDepth:2}).join()).toContain("nested more than 2");expect(errs(fence("csv","a,b\n1,2"),{exploreCsvCols:1}).join()).toContain("columns; at most 1");expect(errs(fence("csv","a\n1\n2"),{exploreCsvRows:1}).join()).toContain("rows; at most 1");expect(errs(fence("json","{}",'query="length"'),{exploreQueryChars:3}).join()).toContain("query is too long");});
 test("part work and authored query share the page budget",()=>{const s=fence("json","{}",'query="range(1e9)"'),d=parse(s,{limits:{maxEvalSteps:100}});expect(d.blocks.some(b=>b.type==="error"&&b.message.startsWith("the explore part"))).toBe(true);expect(d.llm).toContain("[explore not shown: the explore part");});
 test("YAML aliases share its existing guards",()=>expect(errs(fence("yaml","x: &x [1,2,3]\ny: [*x,*x,*x]"),{maxYamlAliases:1}).join()).toMatch(/alias|anchors/));
 for(const n of[100,400,1600])test(`linear CSV and JSON ${n}`,()=>{const costs=(n:number)=>{const a=newBudget(),b=newBudget();readCsv("id,name\n"+Array.from({length:n},(_,i)=>`${i},row${i}`).join("\n"),1,a);guardData(Array.from({length:n},(_,i)=>({id:i,tags:["a","b"]})),b,64);return[a.steps,b.steps];};const a=costs(n),b=costs(2*n);for(let i=0;i<2;i++){expect(b[i]/a[i]).toBeGreaterThan(1.5);expect(b[i]/a[i]).toBeLessThan(2.3);}});
 test("long single CSV line stays linear",()=>{const a=newBudget(),b=newBudget();readCsv("a\n"+"x".repeat(20000),1,a);readCsv("a\n"+"x".repeat(40000),1,b);expect(b.steps/a.steps).toBeLessThan(2.3);});
 for(const file of readdirSync(new URL("./fixtures",import.meta.url)).filter(f=>f.endsWith(".dh.md")))test(file,()=>{const s=readFileSync(new URL("./fixtures/"+file,import.meta.url),"utf8");for(const limits of[LIMITS,UNTRUSTED_LIMITS]){const d=parse(s,{path:file,limits}),ps=check(d);if(file.startsWith("good-")){expect(ps).toEqual([]);expect(d.blocks.some(b=>b.type==="explore")).toBe(true);}else{expect(ps.some(p=>p.level==="error")).toBe(true);expect(ps.every(p=>p.line>=1)).toBe(true);}}});
});
describe("jq: proven query corpus against real jq",()=>{
 const inputs=JSON.parse(readFileSync(new URL("./fixtures/jq-inputs.json",import.meta.url),"utf8")) as Record<string,J>;
 const lines=readFileSync(new URL("./fixtures/jq-queries.txt",import.meta.url),"utf8").split("\n").filter(l=>l.trim()&&!l.startsWith("#"));
 expect(lines.length).toBeGreaterThanOrEqual(90);
 for(const line of lines)test(line,()=>{const at=line.indexOf(" :: "),key=line.slice(0,at),q=line.slice(at+4),r=runJq(q,inputs[key],newBudget(500000,500000));const real=spawnSync("jq",["-c",q],{input:JSON.stringify(inputs[key]),encoding:"utf8"});expect(real.status).toBe(0);expect(r.ok).toBe(true);if(r.ok)expect(r.results).toEqual(real.stdout.split("\n").filter(Boolean).map(s=>JSON.parse(s)));});
});
describe("jq subset: what it says it cannot do", () => {
  const unsupported: [string, string][] = [
    [".a |= 1", "assignment `|=`"], [".a = 1", "assignment `=`"], [".a += 1", "assignment `+=`"], ["reduce .[] as $x (0; . + $x)", "`reduce`"],
    ["foreach .[] as $x (0; . + $x)", "`foreach`"], ["def f: 1; f", "`def`"], ["import \"a\" as a; .", "`import`"], ["label $out | 1", "`label`"],
    ["paths", "`paths/0`"], ["path(.a)", "`path/1`"], ["del(.a)", "`del/1`"], ["walk(.)", "`walk/1`"], ["sub(\"a\"; \"b\")", "`sub/2`"], ["gsub(\"a\"; \"b\")", "`gsub/2`"],
    ["match(\"a\")", "`match/1`"], ["capture(\"(?<x>a)\")", "`capture/1`"], ["env", "`env/0`"], ["input", "`input/0`"], ["until(. > 3; . + 1)", "`until/2`"], ["limit(3)", "`limit/1`"],
    [". as [$a, $b] | $a", "destructuring"], ["$ENV", "`$ENV`"], ["@base64d", "`@base64d`"], [".a //= 1", "assignment `//=`"], ["$__loc__", "`$__loc__`"], ["# a comment\n.", "`#` comment"], ["recurse(.a)", "`recurse/1`"],
  ];
  test("20 or more unsupported forms, each says so by name", () => {
    expect(unsupported.length).toBeGreaterThanOrEqual(20);
    for (const [q, what] of unsupported) {
      const r = runJq(q, { a: 1 }, newBudget());
      expect(r.ok, q).toBe(false);
      if (!r.ok) { expect(r.kind, q).toBe("unsupported"); expect(r.message, q).toContain("jq subset"); expect(r.message, q).toContain(what); expect(r.message, q).toContain("is not supported"); }
    }
  });
  test("an unsupported form throws JqUnsupported when compiled", () => { expect(() => compileJq("limit(3)")).toThrow(JqUnsupported); });
  test("bad syntax gives a plain message with the place", () => {
    for (const q of [".a |", "[1, 2", "{a: }", "if . then 1", ".[", "\"abc"]) { const r = runJq(q, null, newBudget()); expect(r.ok, q).toBe(false); if (!r.ok) expect(r.message, q).toMatch(/jq subset|jq error/); }
  });
  test("an error from the data is plain words, not a crash", () => {
    const r = runJq(".a.b", { a: 5 }, newBudget()); expect(r.ok).toBe(false); if (!r.ok) expect(r.message).toContain("Cannot index number");
  });
});

describe("jq subset: work and memory budget", () => {
  const hostile: [string, J][] = [
    ["range(1e9)", null], ["[range(1e9)] | length", null], ["[range(1e6)] | map(. * 2) | add", null], ["\"x\" * 1e9", null],
    ["[range(100000)] | map([range(1000)]) | flatten | length", null], ["[.[] | range(1e6)]", [1, 2, 3]], ["range(0; 1e9; 1) | select(. < 0)", null], ["[limit(1e9; range(1e12))]", null],
  ];
  test("small input that asks for large work ends with BudgetError (the document's budget)", () => {
    for (const [q, input] of hostile) {
      beginDocument(newBudget(50_000, 100_000));
      const t = Date.now();
      let threw: unknown;
      try { compileJq(q).run(input, docBudget()); } catch (e) { threw = e; }
      expect(threw instanceof BudgetError || (threw as any)?.name === "RangeError" || /Budget|too much/i.test(String((threw as any)?.message)), q).toBe(true);
      expect(Date.now() - t, q).toBeLessThan(3000);
    }
  });
  test("the charge is really counted: a tiny budget refuses even a small range", () => {
    beginDocument(newBudget(20, 1000));
    expect(() => compileJq("[range(50)] | length").run(null, docBudget())).toThrow(BudgetError);
    beginDocument(newBudget(5000, 5000));
    expect(compileJq("[range(50)] | length").run(null, docBudget())).toEqual([50]);
  });
  test("a reader's query that is too much shows 'too much work', and the page stays live", () => {
    const t = Date.now();
    const r = runReaderQuery("range(1e9)", null);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.message).toBe("too much work: make it smaller"); expect(r.kind === "work" || r.kind === "memory").toBe(true); }
    expect(Date.now() - t).toBeLessThan(2000);
    expect(runReaderQuery(".a", { a: 1 })).toEqual({ ok: true, results: [1] });   // the next query works
  });
  test("a query with a regex that would backtrack is answered at once", () => {
    const t = Date.now();
    const r = runReaderQuery(`test("(a*)*b")`, "a".repeat(5000) as any);
    expect(r.ok).toBe(true);
    expect(Date.now() - t).toBeLessThan(2000);
  });
  test("a very long or very deeply nested query is refused plainly", () => {
    expect(runReaderQuery("(".repeat(500) + "1" + ")".repeat(500), null).ok).toBe(false);
    expect(runReaderQuery(".a".repeat(3000), {}).ok).toBe(false);
    expect(runReaderQuery("[".repeat(300) + "]".repeat(300), null).ok).toBe(false);
  });
  test("QUERY_LIMITS are named and a host can lower them", () => { expect(QUERY_LIMITS.work).toBeGreaterThan(0); expect(Object.keys(QUERY_LIMITS)).toContain("maxQueryChars"); });
});

describe("safe regex engine", () => {
  const t = (p: string, s: string, f = "") => compileRegex(p, f).test(s);
  test("the common forms", () => {
    expect(t("^foo$", "foo")).toBe(true); expect(t("^foo$", "xfoo")).toBe(false); expect(t("5\\d\\d", "status 503")).toBe(true); expect(t("(a|b)+c", "ababc")).toBe(true);
    expect(t("x{2,3}", "axxb")).toBe(true); expect(t("x{2,3}", "axb")).toBe(false); expect(t("\\bcat\\b", "a cat sat")).toBe(true); expect(t("\\bcat\\b", "concat")).toBe(false);
    expect(t("TIMEOUT", "a timeout", "i")).toBe(true); expect(t("[^a-c]+d", "abcd")).toBe(false); expect(t("(?i)error", "An ERROR")).toBe(true); expect(t("a.c", "a\nc")).toBe(false); expect(t("a.c", "a\nc", "s")).toBe(true);
  });
  test("matches report where they are", () => { expect(compileRegex("b+").exec("aabbbc")).toEqual({ start: 2, end: 5 }); expect(compileRegex("z").exec("abc")).toBeNull(); });
  test("a pattern that backtracks forever in other engines ends at once", () => {
    const t0 = Date.now(); expect(compileRegex("(a*)*b").test("a".repeat(100000))).toBe(false); expect(compileRegex("(a|aa)+$").test("a".repeat(5000) + "b")).toBe(false); expect(Date.now() - t0).toBeLessThan(5000);
  });
  test("every regex step is charged: a tiny budget refuses", () => { expect(() => compileRegex("a+b").test("a".repeat(1000), newBudget(100, 100))).toThrow(BudgetError); });
  test("forms that need backtracking are refused by name", () => {
    for (const [p, what] of [["(a)\\1", "back reference"], ["a(?=b)", "look-ahead"], ["(?<=a)b", "look-behind"], ["(?>a)", "atomic"], ["a*+", "possessive"], ["\\p{L}", "Unicode property"], ["[[:alpha:]]", "POSIX"]] as const)
      expect(() => compileRegex(p), p).toThrow(RegexError), expect(() => compileRegex(p), p).toThrow(new RegExp(what));
    expect(() => compileRegex("a", "q")).toThrow(/flag/); expect(() => compileRegex("(")).toThrow(RegexError); expect(() => compileRegex("a{1000}")).toThrow(/too large/);
  });
});

