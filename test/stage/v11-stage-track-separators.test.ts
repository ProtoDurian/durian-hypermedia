// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
import { beforeEach, expect, test } from "bun:test";
import { beginDocument } from "../../src/core/stage-budget";
import { compileStage, layoutStage } from "../../src/core/stage";

beforeEach(()=>beginDocument());
for(const width of [1000,340])test(`phase separators are decorative at ${width}; actual connectors remain edges`,()=>{
  const c=compileStage('job a: First\njob b: Second\ntrack: job prepare, copy, check, finish\ntime: 0..4\nrow job r: work 0..4',[
    {title:"Start",raw:"at prepare\na -> b: copy",line:10},
    {title:"Done",raw:"at finish",line:14},
  ],1,{}, {job:1});
  expect(c.errors).toEqual([]);
  const p=layoutStage(c.model,width),separators=p.items.filter(i=>i.k==="tri");
  expect(separators.length).toBeGreaterThan(0);
  expect(separators.every(i=>i.bar?.edge===undefined)).toBe(true);
  expect(p.items.some(i=>i.k==="path"&&i.bar?.edge)).toBe(true);
});
for(const width of [1000,340])test(`public package journey stamps all adjacent links and its story arrow at ${width}`,()=>{
 const c=compileStage('job a: Package\nstore b: Registry\ntrack: job fetch, resolve | cache lookup | job build, test | store publish\ncarry: one package',[
  {title:"Resolve",raw:"at resolve",line:10},{title:"Publish",raw:"at publish\na -> b: published",line:13},
 ],1,{}, {job:1,cache:2,store:3});
 expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,width),links=p.items.filter(i=>String(i.bar?.edge||"").startsWith("phase:")),edges=p.items.filter(i=>i.k==="path"&&i.bar?.edge);
 expect(links.length).toBe(5);
 expect(links.map(i=>[i.bar?.from,i.bar?.to])).toEqual(Array.from({length:5},(_,i)=>[`phase:${i}`,`phase:${i+1}`]));
 expect(edges.some(i=>i.id==="a>b"&&i.bar?.from==="Package"&&i.bar?.to==="Registry")).toBe(true);
});
test("fourteen journey phases retain all thirteen links when wrapped; time before track stays decorative",()=>{
 const phases=Array.from({length:14},(_,i)=>"phase"+i),head="track: job "+phases.join(", ");
 for(const width of [1000,340]){
  const c=compileStage(head,[],1,{}, {job:1});expect(c.errors).toEqual([]);
  const links=layoutStage(c.model,width).items.filter(i=>String(i.bar?.edge||"").startsWith("phase:"));
  expect(links.length).toBe(13);
  for(const [i,link]of links.entries()){expect(link.bar?.from).toBe(`phase:${i}`);expect(link.bar?.to).toBe(`phase:${i+1}`);}
  const t=compileStage("time: 0..4\nrow job r: work 0..4\n"+head,[],1,{}, {job:1});expect(t.errors).toEqual([]);
  expect(layoutStage(t.model,width).items.filter(i=>String(i.bar?.edge||"").startsWith("phase:")).length).toBe(0);
 }
});
