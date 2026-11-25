// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
import {beforeEach,expect,test} from "bun:test";
import {compileStage,layoutStage} from "../../src/core/stage";
import {beginDocument} from "../../src/core/stage-budget";
import {measure,setPhoneFont,type Item} from "../../src/core/stage-core";
const roles={job:1,server:2};
const steps=Array.from({length:6},(_,i)=>({title:`Step ${i+1}`,raw:'',line:30+i*2}));
const compile=(head:string)=>compileStage(head,steps,1,{},roles);
const on=(i:Item,k:number)=>i.on?i.on.includes(k):k>=(i.from||1)&&(!i.to||k<=i.to);
beforeEach(()=>beginDocument());
test("a phone range caption uses the actual tick values, including a nonzero domain",()=>{
 const c=compile('time: 840..875\ncells: 1 | headers\nrow labels: beside\nrow job schedule "Schedule": after 869..872 [wide] @5');expect(c.errors).toEqual([]);
 for(const w of[356,326]){const p=layoutStage(c.model,w),words=p.items.filter((i):i is Extract<Item,{k:'text'}>=>i.k==='text'&&on(i,5));expect(words.some(t=>t.s==='869–871: after')).toBe(true);expect(words.some(t=>t.s==='30–32: after')).toBe(false);}
});
test("35 narrow counted cells keep one full word each with sufficient painted spacing",()=>{
 const c=compile('time: 840..875\ncells: 1 | headers\nrow job counts "Merger counts": ×1 840..848 @3; ×1 848..869 @4; ×1 869..872 @5; ×1 872..875 @6');expect(c.errors).toEqual([]);
 for(const w of[356,326,300]){const p=layoutStage(c.model,w);setPhoneFont(true);try{
  for(const k of[3,4,5,6]){const words=p.items.filter((i):i is Extract<Item,{k:'text'}>=>i.k==='text'&&i.s==='×1'&&on(i,k));expect(words.length).toBe([8,29,32,35][k-3]);
   for(let a=0;a<words.length;a++)for(let b=a+1;b<words.length;b++)if(words[a].y===words[b].y)expect(Math.abs(words[a].x-words[b].x)).toBeGreaterThanOrEqual(measure('×1','chip')*1.2+4);
  }
 }finally{setPhoneFont(false);}}
});
test("the time caption, headings and grid keep one place around different-height step panels",()=>{
 const head='panels\ntime: 840..875 | ticks, one column per second\ncells: 1 | headers\nrow job schedule "Schedule": after 869..872 [wide] @5\nrow server shard "Shard": _ 840..848 @3; _ 848..869 @4; _ 869..875 @5\nrow job counts "Merger counts": ×1 840..848 @3; ×1 848..869 @4; ×1 869..875 @5';
 const ss=steps.map((s,i)=>({...s,raw:(i===1?'foot: Ready for the new copies\n':'')+(i===3||i===4?'rows\n  job: Draft | ready\n  server: Copy | ready\n  job: Archive | ready\n':'')+(i===2?'keep at 848 [accent]: prepareTick 848 · 12:00:00\nkeep at 869 [bad]: finishTick 869 · 12:05:15':'')}));
 const c=compileStage(head,ss,1,{},roles);expect(c.errors).toEqual([]);
 for(const w of[1280,356,326]){const p=layoutStage(c.model,w),unit=p.items.filter((i):i is Extract<Item,{k:'text'}>=>i.k==='text'&&i.s==='ticks, one column per second');expect(unit).toHaveLength(1);expect(steps.every((_,i)=>on(unit[0],i+1))).toBe(true);
  const first=p.items.find((i):i is Extract<Item,{k:'box'}>=>i.k==='box'&&i.id?.includes(':header:'))!;expect(first).toBeDefined();expect(first.y-unit[0].y).toBeLessThan(w<480?140:90);
  for(const i of p.items.filter(i=>i.id?.includes(':header:')||i.k==='text'&&['Schedule','Shard','Merger counts'].includes(i.s)))expect(steps.every((_,k)=>on(i,k+1))).toBe(true);
 }
});
