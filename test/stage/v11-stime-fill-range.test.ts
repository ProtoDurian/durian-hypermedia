// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
import {beforeEach,expect,test} from "bun:test";
import {compileStage,layoutStage,stageLlm} from "../../src/core/stage";
import {beginDocument} from "../../src/core/stage-budget";
import type {Item} from "../../src/core/stage-core";
const roles={job:1,server:2};
const points=Array.from({length:24},(_,i)=>-150+i*15).map(a=>`_ ${a}..${a+2} [dot]`).concat("_ 209..210 [dot]").join("; ");
const head='time: -150..210 | seconds\nruler: below\nrow job ep "Pushes": '+points;
const compile=(raw:string[],h=head)=>compileStage(h,raw.map((raw,i)=>({title:`Step ${i+1}`,raw,line:10+i*3})),1,{},roles);
const visible=(i:Item,k:number)=>i.on?i.on.includes(k):k>=(i.from||1)&&(!i.to||k<=i.to);
const dots=(p:ReturnType<typeof layoutStage>,k:number)=>p.items.filter((i):i is Extract<Item,{k:"box"}>=>i.k==="box"&&!!i.cls?.includes("stg-time-dot")&&visible(i,k));
beforeEach(()=>beginDocument());
test("a kept fill interval changes only the last twelve dot data, with no movement or new hooks",()=>{
 const c=compile(["","keep fill ep 45..210","","off ep"]);expect(c.errors).toEqual([]);
 const bare=compile(["","","",""]);expect(bare.errors).toEqual([]);
 for(const w of[1280,390,360]){
  const p=layoutStage(c.model,w),base=layoutStage(bare.model,w);
  for(let k=1;k<=4;k++){
   const ds=dots(p,k);expect(ds.length).toBe(25);expect(ds.filter(d=>d.fill===d.stroke).length).toBe(k===2||k===3?12:0);
   for(const d of ds){const old=dots(base,k).find(o=>o.id===d.id)!;expect([d.x,d.y,d.w,d.h,d.r,d.bar]).toEqual([old.x,old.y,old.w,old.h,old.r,old.bar]);expect(d.fill===d.stroke).toBe((k===2||k===3)&&Number(d.bar?.value)>=45);}
  }
 }
 expect(stageLlm(c)).toContain("ep: dots from 45 to 210 filled from this step onward.");
});
test("one-step range fills expire and off clears overlapping kept ranges",()=>{
 const c=compile(["fill ep 45..210","","keep fill ep -150..30\nkeep fill ep 45..210","off ep"]);expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,390);expect([1,2,3,4].map(k=>dots(p,k).filter(d=>d.fill===d.stroke).length)).toEqual([12,0,24,0]);
 // 30..32 has datum 31: a dot is selected by its actual midpoint, not its left edge.
 expect(dots(p,3).find(d=>d.bar?.value===31)?.fill).not.toBe(dots(p,3).find(d=>d.bar?.value===31)?.stroke);
});
test("a range includes boundary data and may fill dots revealed after the command",()=>{
 const h='time: 0..10\nrow job ep "Pushes": _ 0..2 [dot]; _ 4..6 [dot] @2; _ 8..10 [dot] @3';
 const c=compile(["keep fill ep 1..9","",""],h);expect(c.errors).toEqual([]);const p=layoutStage(c.model,390);
 for(let k=1;k<=3;k++){expect(dots(p,k).length).toBe(k);expect(dots(p,k).every(d=>d.fill===d.stroke)).toBe(true);}
});
test("a fill range routes to its row's clock, including an explicitly named clock",()=>{
 const h='time first: 0..10\nrow job a: _ 0..2 [dot]\ntime second: 40..50\nrow server b: _ 44..46 [dot]';
 for(const raw of["keep fill b 44..46","keep fill second b 44..46"]){const c=compile([raw,""],h);expect(c.errors).toEqual([]);const ds=dots(layoutStage(c.model,390),1);expect(ds.find(d=>d.bar?.value===45)?.fill).toBe(ds.find(d=>d.bar?.value===45)?.stroke);expect(ds.find(d=>d.bar?.value===1)?.fill).not.toBe(ds.find(d=>d.bar?.value===1)?.stroke);}
});
for(const raw of["fill ep 45..45","fill ep 210..45","fill ep -151..30","fill ep 45..211","fill ep 33..34","fill ep nope","fill ep 45..210 extra","off ep 45..210","keep off ep","fill ep 45..210: words"])test(`rejects invalid ranged fill: ${raw}`,()=>expect(compile([raw,""]).errors.length).toBeGreaterThan(0));
test("a range is refused on a row without dots",()=>expect(compile(["keep fill ep 1..3",""],'time: 0..4\nrow job ep: +ready 0..4').errors.length).toBeGreaterThan(0));
