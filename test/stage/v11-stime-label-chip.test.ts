// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
import {beforeEach,expect,test} from "bun:test";
import {compileStage,layoutStage} from "../../src/core/stage";
import {beginDocument} from "../../src/core/stage-budget";
import type {Item} from "../../src/core/stage-core";
const roles={job:1,server:2};
const steps=[{title:'Begin',raw:'',line:20},{title:'Copies',raw:'arrow old -> next at 2: copy',line:22},{title:'Hold',raw:'',line:24}];
const head='time: 0..4\ncells: 1 | headers\nrow job old "Draft owner" [chip]: +x1 0..2 @2; +x1 2..4 @3\nrow server next "Copy owner" [chip]: +x1 0..2 @2; +x1 2..4 @3\nrow job plain "Schedule": wait 0..4 [wide]';
const compile=(h=head)=>compileStage(h,steps,1,{},roles);
const on=(i:Item,k:number)=>i.on?i.on.includes(k):k>=(i.from||1)&&(!i.to||k<=i.to);
const boxes=(p:ReturnType<typeof layoutStage>)=>p.items.filter((i):i is Extract<Item,{k:'box'}>=>i.k==='box');
beforeEach(()=>beginDocument());
test("a time label chip is one painted role chip, separate from its worksheet endpoint",()=>{
 const c=compile();expect(c.errors).toEqual([]);
 for(const w of[1280,356,326]){const p=layoutStage(c.model,w);for(const [id,label,role]of[['old','Draft owner','job'],['next','Copy owner','server']]){
  const chip=boxes(p).filter(b=>b.id===`time:row-label:${id}`);expect(chip).toHaveLength(1);expect(chip[0].bar).toEqual({kind:'chip',id:`time:row-label:${id}`,label,role});expect(chip[0].fill).toBe(`role:${role}:soft`);expect(chip[0].stroke).toBe(`role:${role}:line`);expect(chip[0].h).toBe(18);expect(steps.every((_,k)=>on(chip[0],k+1))).toBe(true);
  const frames=boxes(p).filter(b=>b.bar?.id===id);expect(frames.length).toBeGreaterThan(0);for(const frame of frames){expect(frame.bar?.kind).toBe('worksheet-row');expect(frame.bar?.label).toBeUndefined();expect(frame.bar?.ignore).toBeUndefined();}
  const word=p.items.find((i):i is Extract<Item,{k:'text'}>=>i.k==='text'&&i.s===label)!;expect(word).toBeDefined();expect(word.ink).toBe(`role:${role}:ink`);expect(word.x-chip[0].x).toBe(3);expect(word.y-chip[0].y).toBe(13);
 }
 const ordinary=boxes(p).find(b=>b.bar?.id==='plain')!;expect(ordinary.bar?.kind).toBe('worksheet-row');expect(ordinary.bar?.label).toBe('Schedule');expect(boxes(p).some(b=>b.id==='time:row-label:plain')).toBe(false);
 const edge=p.items.find((i):i is Extract<Item,{k:'path'}>=>i.k==='path'&&!!i.arrow)!;expect(edge.bar?.from).toBe('old');expect(edge.bar?.to).toBe('next');}
});
test("chips hug their words while the grid retains one shared label column",()=>{
 const c=compile(head.replace('Draft owner','A').replace('Copy owner','A much longer copy owner'));expect(c.errors).toEqual([]);
 for(const mode of['','\nrow labels: beside']){const d=compile(head.replace('Draft owner','A').replace('Copy owner','A much longer copy owner')+mode);expect(d.errors).toEqual([]);for(const w of[1280,356]){const p=layoutStage(d.model,w),a=boxes(p).find(b=>b.id==='time:row-label:old')!,b=boxes(p).find(b=>b.id==='time:row-label:next')!;expect(a.w).toBeLessThan(b.w);expect(a.w).toBeLessThan(24);const cells=boxes(p).filter(b=>b.cls?.includes('stg-time-cell'));expect(cells.find(b=>b.id?.includes(':cell:old:'))!.x).toBe(cells.find(b=>b.id?.includes(':cell:next:'))!.x);}}
});
test("legacy boxed labels stay ignored and named-axis arrows still bind worksheet rows",()=>{
 const c=compile(head.replace('time:','time ticks:').replace('"Draft owner" [chip]','"| Draft owner"'));expect(c.errors).toEqual([]);const p=layoutStage(c.model,1280),legacy=boxes(p).find(b=>b.id==='time-axis-ticks:row-label:old')!;expect(legacy.bar?.ignore).toBe(1);expect(boxes(p).find(b=>b.bar?.id==='time-axis-ticks:old')?.bar?.kind).toBe('worksheet-row');const edge=p.items.find((i):i is Extract<Item,{k:'path'}>=>i.k==='path'&&!!i.arrow)!;expect(edge.bar?.from).toBe('time-axis-ticks:old');expect(edge.bar?.to).toBe('time-axis-ticks:next');
});
for(const row of['row job r [chip]: _ 0..1','row job r "" [chip]: _ 0..1','row job r "Owner" [chip] [chip]: _ 0..1','row job r "Owner" [other]: _ 0..1'])test(`refuses malformed label chip ${row}`,()=>expect(compile('time: 0..4\n'+row).errors.length).toBeGreaterThan(0));
