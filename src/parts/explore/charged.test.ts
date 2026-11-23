// The jq subset and its regex engine charge every unit of work and every character they make, before they do it:
// a query's real work grows with what it is charged, so twice the input is about twice the work.
import {describe,test,expect} from "bun:test";
import {parse,check,LIMITS,UNTRUSTED_LIMITS} from "../../index";
import {Budget} from "../../core/budget";
import {compileJq,runReaderQuery,type J} from "../log/jq";
import {compileRegex} from "../log/re";
import {DEFAULT_CAPS} from "../log/query";
import {exploreCaps} from "./part";
const free=()=>new Budget({steps:1e12,values:1e12,chars:1e12});
const steps=(q:string,input:J)=>{const b=free();compileJq(q).run(input,b);return b.steps;};
const chars=(q:string,input:J)=>{const b=free();compileJq(q).run(input,b);return b.chars;};
const UNTRUSTED=exploreCaps(UNTRUSTED_LIMITS);
const doubles=(cost:(n:number)=>number,n:number)=>{const r=cost(2*n)/cost(n);expect(r).toBeGreaterThan(1.5);expect(r).toBeLessThan(2.3);};
const shared=(n:number)=>Array(n).fill("[.,.]").join("|");
const fence=(body:string,attrs:string)=>`# Page\n\n\`\`\`json explore ${attrs}\n${body}\n\`\`\`\n`;

describe("jq: conversions are charged by the text they make",()=>{
 const CONVERSIONS=["tostring","tojson","@json","@text","@html","@uri",'"\\(.)"',"@json \"x\\(.)\"","error"];
 const wrap=(f:string)=>f==="error"?"try error catch length":f;
 for(const f of CONVERSIONS){
  test(`${f} is charged`,()=>{
   const r=runReaderQuery(`${shared(22)} | ${wrap(f)} | length`,1,UNTRUSTED);
   expect(r.ok).toBe(false);if(!r.ok)expect(r.kind).toBe("work");
  });
  test(`${f} work doubles with its output`,()=>{const cost=(n:number)=>steps(`${shared(n)} | ${wrap(f)} | length`,1);for(const n of[6,8,10]){const r=cost(n+1)/cost(n);expect(r).toBeGreaterThan(1.5);expect(r).toBeLessThan(2.3);}});
 }
 test("a shared value in an error message is charged",()=>{
  for(const q of[`${shared(24)} | try (-.) catch length`,`${shared(24)} | try tonumber catch length`,`${shared(24)} | try ({} + .) catch length`]){const r=runReaderQuery(q,1,UNTRUSTED);expect(r.ok,q).toBe(true);if(r.ok)expect(r.results[0] as number,q).toBeLessThan(200);}
 });
 test("an author query that converts is charged by the page",()=>{
  for(const limits of[LIMITS,UNTRUSTED_LIMITS]){const d=parse(fence("1",`query='${shared(22)}|tostring|length'`),{path:"p.dh.md",limits});expect(d.blocks.some(b=>b.type==="error"&&b.message.startsWith("the explore part"))).toBe(true);}
 });
 test("conversions charge characters before the text exists",()=>{
  expect(chars("tojson",{a:"x".repeat(1000)})).toBeGreaterThanOrEqual(1000);
  expect(chars("@html","<".repeat(1000))).toBeGreaterThanOrEqual(4000);
  expect(chars("@uri","é".repeat(1000))).toBeGreaterThanOrEqual(6000);
 });
});

describe("jq: every builtin charges by the length it reads",()=>{
 const S="aé ".repeat(4);
 const OPS:[string,(n:number)=>J][]=[
  ["@uri",(n)=>S.repeat(n)],["@html",(n)=>S.repeat(n)],["@text",(n)=>[S.repeat(n)]],["@json",(n)=>S.repeat(n)],["@sh",(n)=>S.repeat(n)],["[.] | @csv",(n)=>S.repeat(n)],["[.] | @tsv",(n)=>S.repeat(n)],
  ["reverse",(n)=>S.repeat(n)],["reverse",(n)=>Array(n*12).fill(1)],[".[1:]",(n)=>S.repeat(n)],[".[1:]",(n)=>Array(n*12).fill(1)],[".[{\"start\":1}]",(n)=>Array(n*12).fill(1)],
  ["explode",(n)=>S.repeat(n)],["explode | implode",(n)=>S.repeat(n)],["length",(n)=>S.repeat(n)],["length",(n)=>Object.fromEntries(Array.from({length:n*12},(_,i)=>["k"+i,1]))],
  ["ascii_downcase",(n)=>S.repeat(n)],["ascii_upcase",(n)=>S.repeat(n)],["trim",(n)=>S.repeat(n)],["ltrim",(n)=>S.repeat(n)],["rtrim",(n)=>S.repeat(n)],
  ["ltrimstr(\"a\")",(n)=>S.repeat(n)],["rtrimstr(\" \")",(n)=>S.repeat(n)],["startswith(.)",(n)=>S.repeat(n)],["endswith(.)",(n)=>S.repeat(n)],
  ["try tonumber catch 0",(n)=>"1".repeat(n*12)],["tostring",(n)=>Array(n*12).fill(1)],["tojson",(n)=>S.repeat(n)],
  ["any",(n)=>Array(n*12).fill(false)],["all",(n)=>Array(n*12).fill(true)],[". as $p | null | getpath($p)",(n)=>Array(n*12).fill(0)],["join(\",\")",(n)=>Array(n*12).fill("ab")],
  [". + .",(n)=>Array(n*12).fill(1)],[". + .",(n)=>Object.fromEntries(Array.from({length:n*12},(_,i)=>["k"+i,1]))],["transpose",(n)=>[Array(n*12).fill(1)]],
  ["add",(n)=>[Array(n*12).fill(1),[1]]],["keys",(n)=>Array(n*12).fill(1)],["to_entries",(n)=>Array(n*12).fill(1)],
 ];
 for(const[op,data]of OPS)test(`${op} on ${Array.isArray(data(1))?"an array":typeof data(1)==="object"?"an object":"a string"} is charged by length`,()=>{
  doubles((n)=>steps(`[range(20) as $i | ${op} | type] | length`,data(n) as J),200);
 });
 test("a reader query over long data ends within its budget",()=>{
  for(const op of["@uri","reverse",".[1:]","explode","length","tostring","ascii_downcase"]){const r=runReaderQuery(`[.s | range(3000) as $i | ${op} | length] | length`,{s:"a".repeat(40000)},UNTRUSTED);expect(r.ok,op).toBe(false);}
 });
 test("ordinary queries keep their answers",()=>{
  const run=(q:string,v:J)=>{const r=runReaderQuery(q,v,UNTRUSTED);if(!r.ok)throw Error(r.message);return r.results;};
  expect(run("@uri","a b/é~")).toEqual(["a%20b%2F%C3%A9~"]);expect(run("@html","<a href='x'>&\"</a>")).toEqual(["&lt;a href=&#39;x&#39;&gt;&amp;&quot;&lt;/a&gt;"]);
  expect(run("@sh",["a'b",1])).toEqual(["'a'\\''b' 1"]);expect(run("@csv",["a\"b",1,null,true])).toEqual(["\"a\"\"b\",1,,true"]);expect(run("@tsv",["a\tb\\",1])).toEqual(["a\\tb\\\\\t1"]);
  expect(run("tostring",{a:[1,"x"]})).toEqual(['{"a":[1,"x"]}']);expect(run('"v=\\(.a)"',{a:[1]})).toEqual(["v=[1]"]);expect(run("[.[] | length]",["a😀",[1,2],{a:1},null,-3])).toEqual([[2,2,1,0,3]]);
  expect(run("reverse",["ab😀"])).toEqual([["ab😀"]]);expect(run("reverse","ab😀")).toEqual(["😀ba"]);expect(run(".[1:3]","a😀bc")).toEqual(["😀b"]);expect(run("explode | implode","a😀")).toEqual(["a😀"]);
  expect(run("try (-.) catch .",{a:"x".repeat(50)})).toEqual(['object ({"a":"xxxx...) cannot be negated']);expect(run("try error catch .",{a:1})).toEqual([{a:1}]);
 });
});

describe("regex: compiling is linear in the pattern",()=>{
 test("a repeat count is read once",()=>{
  const cost=(n:number)=>{const b=free();compileRegex("a"+"{".repeat(n),"",DEFAULT_CAPS,b);return b.steps;};doubles(cost,500);
  const t0=performance.now();for(let i=0;i<20;i++)compileRegex("a"+"{".repeat(1999),"",DEFAULT_CAPS,free());expect(performance.now()-t0).toBeLessThan(400);
 });
 test("a reader query that compiles patterns ends quickly",()=>{
  let best=Infinity;for(let k=0;k<3;k++){const t0=performance.now();const r=runReaderQuery(`[.p as $p | range(1000) | "" | test($p)] | length`,{p:"a"+"{".repeat(1990)},UNTRUSTED);best=Math.min(best,performance.now()-t0);expect(r.ok).toBe(false);}
  expect(best).toBeLessThan(400);
 });
 test("repeat counts keep their meaning",()=>{
  const t=(p:string,s:string)=>compileRegex(p).test(s,free());
  expect(t("^a{2}$","aa")).toBe(true);expect(t("^a{2}$","aaa")).toBe(false);expect(t("^a{1,}$","aaaa")).toBe(true);expect(t("^a{1,2}$","aaa")).toBe(false);expect(t("^a{,2}$","a{,2}")).toBe(true);expect(t("a{","a{")).toBe(true);expect(t("^x{2}y{3}$","xxyyy")).toBe(true);
  expect(()=>compileRegex("a{3,1}")).toThrow(/smaller/);expect(()=>compileRegex("a{999}")).toThrow(/too large/);
 });
});

describe("log: the line cap holds in the parsed document",()=>{
 const log=(n:number)=>"# Page\n\n```log\n"+Array.from({length:n},(_,i)=>i.toString(36)).join("\n")+"\n```\n";
 for(const[name,limits]of[["LIMITS",LIMITS],["UNTRUSTED_LIMITS",UNTRUSTED_LIMITS]]as const)test(`${name}: at most logLines lines are kept`,()=>{
  for(const n of[limits.logLines+1,limits.logLines*2]){
   const d=parse(log(n),{path:"p.dh.md",limits}),b=d.blocks.find(b=>b.type==="log");
   // either the lines past the cap are not kept, or the part's budget ends first and the part is an error block
   if(b?.type==="log"){expect(b.data.entries.length).toBeLessThanOrEqual(limits.logLines);expect(b.data.lines).toBeLessThanOrEqual(limits.logLines);expect(check(d).some(p=>p.level==="error"&&p.message.includes(`at most ${limits.logLines}`))).toBe(true);}
   else expect(d.blocks.some(b=>b.type==="error"&&b.message.startsWith("the log part"))).toBe(true);
   if(n===limits.logLines+1)expect(b?.type).toBe("log");
  }
  const ok=parse(log(limits.logLines),{path:"p.dh.md",limits}).blocks.find(b=>b.type==="log");expect(ok?.type==="log"&&ok.data.entries.length).toBe(limits.logLines);
 });
 test("explore: CSV columns past the cap are not kept",()=>{
  const csv=["a,b,c","1,2,3"].join("\n");const d=parse(`# Page\n\n\`\`\`csv explore\n${csv}\n\`\`\`\n`,{path:"p.dh.md",limits:{exploreCsvCols:2}}),b=d.blocks.find(b=>b.type==="explore");
  if(b?.type==="explore")for(const r of b.data.value as J[])expect(Object.keys(r as object).length).toBeLessThanOrEqual(2);
  expect(check(d).some(p=>p.message.includes("at most 2"))).toBe(true);
 });
});
