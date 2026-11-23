// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
import {beforeEach,expect,test} from "bun:test";
import {compileStage,layoutStage,stageLlm} from "../../src/core/stage";
import {beginDocument} from "../../src/core/stage-budget";
import type {Item} from "../../src/core/stage-core";
const roles={job:1,server:2};
const head='time: 0..10\nruler: below\nrow job r "Samples": first 1..2 [dot]; second 4..5 [dot]; last 7..8 [dot] [plain]';
const compile=(ops:string[],h=head)=>compileStage(h,(ops.length===1?[...ops,'']:ops).map((raw,i)=>({raw,title:`Step ${i+1}`,line:20+i*2})),1,{},roles);
const on=(i:Item,k:number)=>i.on?i.on.includes(k):k>=(i.from||1)&&(!i.to||k<=i.to);
const dots=(p:ReturnType<typeof layoutStage>,k:number)=>p.items.filter((i):i is Extract<Item,{k:'box'}>=>i.k==='box'&&!!i.cls?.includes('stg-time-dot')&&on(i,k));
beforeEach(()=>beginDocument());
test("one dot tone lasts one step and preserves each dot's identity and geometry",()=>{
 const c=compile(['','dot r 4 [bad]','']);expect(c.errors).toEqual([]);
 for(const w of[1280,356,326]){const p=layoutStage(c.model,w),a=dots(p,1),b=dots(p,2),z=dots(p,3);expect(a).toHaveLength(3);expect(b).toHaveLength(3);expect(z).toHaveLength(3);
  expect(b[1].stroke).toBe('bad:line');expect(b[1].fill).toBe('bad:soft');expect(a[1].stroke).toBe('role:job:line');expect(z[1].stroke).toBe(a[1].stroke);
  for(let j=0;j<3;j++){const geo=(i:typeof a[number])=>[i.id,i.x,i.y,i.w,i.h,i.r,i.bar?.value];expect(geo(b[j])).toEqual(geo(a[j]));expect(geo(z[j])).toEqual(geo(a[j]));}
  const word=p.items.find(i=>i.k==='text'&&i.s==='second'&&on(i,2));expect(word?.k==='text'&&word.ink).toBe('bad:ink');
 }
 expect(stageLlm(c)).toContain('painted bad this step only');
});
test("kept dot tones persist; a temporary tone reverts and off restores declared paint",()=>{
 const c=compile(['keep dot r 4 [accent]','dot r 4 [bad]','','off r','']);expect(c.errors).toEqual([]);const p=layoutStage(c.model,356);
 expect([1,2,3,4,5].map(k=>dots(p,k)[1].stroke)).toEqual(['acc:line','bad:line','acc:line','role:job:line','role:job:line']);
});
test("a dot range selects inclusive interval starts, keeping grey dots solid in a new role",()=>{
 const c=compile(['','keep dot r 4..7 (server)','','off r']);expect(c.errors).toEqual([]);
 for(const w of[1280,356]){const p=layoutStage(c.model,w),d=dots(p,2);expect(d[0].stroke).toBe('role:job:line');expect(d[1].stroke).toBe('role:server:line');expect(d[1].fill).toBe('role:server:soft');expect(d[2].stroke).toBe('role:server:line');expect(d[2].fill).toBe(d[2].stroke);expect(d[2].bar?.role).toBe('server');expect(dots(p,3)[2].fill).toBe(d[2].fill);expect(dots(p,4)[2].fill).toBe('muted');}
});
test("ranged fill and dot tone compose without filling an earlier hollow sample",()=>{
 const c=compile(['keep fill r 4..8\nkeep dot r 4 (server)','','off r','keep dot r 1 [warn]\nkeep fill r']);expect(c.errors).toEqual([]);const p=layoutStage(c.model,356);
 expect(dots(p,1)[0].fill).toBe('role:job:soft');expect(dots(p,1)[1].fill).toBe('role:server:line');expect(dots(p,2)[1].fill).toBe('role:server:line');expect(dots(p,3)[1].fill).toBe('role:job:soft');expect(dots(p,4)[0].fill).toBe('warn:line');
});
test("named axes route dot recolouring to the unique owning row",()=>{
 const c=compile(['dot ticks b 21 [good]'], 'time minutes: 0..10\nrow job a: _ 1..2 [dot]\ntime ticks: 20..30\nrow server b: _ 21..23 [dot]');expect(c.errors).toEqual([]);expect(dots(layoutStage(c.model,356),1).map(d=>d.stroke)).toEqual(['role:job:line','good:line']);
 const implicit=compile(['dot b 21 [good]'],'time minutes: 0..10\nrow job a: _ 1..2 [dot]\ntime ticks: 20..30\nrow server b: _ 21..23 [dot]');expect(implicit.errors).toEqual([]);
});
for(const op of['dot r 4','dot r 4 [bad] [good]','dot r 4 (server) [bad]','dot r 4 (missing)','dot r 4 [solid]','dot r 4: words','dot r 3 [bad]','dot r 4.5 [bad]','dot r 11 [bad]','dot r 8..4 [bad]','dot r 2..3 [bad]'])test(`dot tone refuses ${op}`,()=>expect(compile([op]).errors.length).toBeGreaterThan(0));
test("dot tone refuses an ordinary cell and preserves the existing numeric dot form",()=>{
 expect(compile(['dot r 4 [bad]'],'time: 0..10\nrow job r: word 4..5').errors.length).toBeGreaterThan(0);
 const c=compile(['dot 4 [bad]: checkpoint']);expect(c.errors).toEqual([]);expect(stageLlm(c)).toContain('checkpoint');
});
test("the seventeen-sample failover range recolours exactly twelve filled samples",()=>{
 const old=[-145,-115,-85,-55,-25],later=Array.from({length:12},(_,i)=>36+i*15),h='time: -150..210\nruler: below\nrow job ms "Stored": '+[...old,...later].map(a=>`_ ${a}..${a+2} [dot] [plain] @4`).join('; ');
 const c=compile(['','','','','','keep dot ms 36..201 (server)'],h);expect(c.errors).toEqual([]);
 for(const w of[1280,356,326]){const p=layoutStage(c.model,w);expect(dots(p,3)).toHaveLength(0);expect(dots(p,4)).toHaveLength(17);const final=dots(p,6);expect(final).toHaveLength(17);expect(final.filter(d=>d.stroke==='muted')).toHaveLength(5);expect(final.filter(d=>d.stroke==='role:server:line'&&d.fill===d.stroke)).toHaveLength(12);for(let j=0;j<17;j++)expect([final[j].id,final[j].x,final[j].y,final[j].w,final[j].h]).toEqual([dots(p,4)[j].id,dots(p,4)[j].x,dots(p,4)[j].y,dots(p,4)[j].w,dots(p,4)[j].h]);}
});
test("recolouring keeps the integrated two-line dot label beside its dot",()=>{
 const h='time: 0..15\nruler: below\nrow labels: beside\nrow job r "Samples": arrives: labels kept, values dropped 4.2..4.4 [dot]';
 const c=compile(['','dot r 4.2 (server)'],h),base=compile(['',''],h);expect(c.errors).toEqual([]);expect(base.errors).toEqual([]);
 for(const w of[356,326]){const p=layoutStage(c.model,w),q=layoutStage(base.model,w),words=p.items.filter((i):i is Extract<Item,{k:'text'}>=>i.k==='text'&&on(i,2)&&i.ink==='role:server:line');expect(words.map(i=>i.s).join(' ')).toBe('arrives: labels kept, values dropped');expect(words.length).toBe(2);const dot=dots(p,2)[0];for(const word of words){expect(word.x).toBeGreaterThan(dot.x+dot.w);expect(word.y).toBeLessThanOrEqual(dot.y+dot.h+8);}
  const geo=(items:Item[],k:number)=>items.filter(i=>on(i,k)).map(i=>i.k==='text'?['text',i.s,i.x,i.y,i.f]:i.k==='box'?['box',i.id,i.x,i.y,i.w,i.h,i.r]:i.k==='path'?['path',i.id,i.pts]:[i.k,i.id]);expect(geo(p.items,2)).toEqual(geo(q.items,2));
 }
});
