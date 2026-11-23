// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
import {beforeEach,expect,test} from "bun:test";
import {compileStage,layoutStage} from "../../src/core/stage";
import {beginDocument} from "../../src/core/stage-budget";
import {measure,type Item} from "../../src/core/stage-core";
const roles={job:1,server:2};
const head='time: 6..12 | one tick per column\ncells: 1 | roomy\nticks: 6.5 t7, 7.5 t8, 8.5 t9, 9.5 t10, 10.5 t11, 11.5 t12\nrow job ra "(a) Writer | the writer": +x1 6..7; +x1 7..8 @2; +x1 8..12 @3\nrow server rb "(b) Copy | backup writer": +x1 6..7; +x1 7..8 @2; +x1 8..12 @3\nrow job rm "| Archive": +x1 6..7; +x1 7..8 @2; +x1 8..12 @3';
const compile=(h=head)=>compileStage(h,[{title:"Begin",raw:"",line:10},{title:"Input",raw:"arrow above -> ra at 7.5 [dashed] [accent]: new parcel",line:12},{title:"Copy",raw:"arrow rb -> ra at 8.5 [accent]: fetch once",line:14}],1,{},roles);
const boxes=(p:ReturnType<typeof layoutStage>)=>p.items.filter((i):i is Extract<Item,{k:"box"}>=>i.k==="box");
beforeEach(()=>beginDocument());
test("desktop roomy row cards use one label column, full subtitles and an even row pitch",()=>{
 const c=compile();expect(c.errors).toEqual([]);
 for(const w of[1158,1280]){const p=layoutStage(c.model,w),row=(id:string)=>boxes(p).find(i=>i.bar?.id===id)!,rs=[row('ra'),row('rb'),row('rm')];
  expect(rs[0].h).toBe(rs[1].h);expect(rs[1].h).toBe(rs[2].h);expect(rs[1].y-rs[0].y).toBe(rs[2].y-rs[1].y);
  for(const s of['the writer','backup writer','Archive'])expect(p.items.some(i=>i.k==='text'&&i.s===s)).toBe(true);
  const card=boxes(p).find(i=>i.id==='time:row-label:rb')!,title=p.items.find((i):i is Extract<Item,{k:'text'}>=>i.k==='text'&&i.s==='Copy')!,badge=p.items.find((i):i is Extract<Item,{k:'badge'}>=>i.k==='badge'&&i.s==='b')!;
  expect(title.x).toBeGreaterThan(badge.x+20);expect(title.y).toBeLessThan(badge.y+20);expect(card.w).toBeGreaterThan(110);expect(card.w).toBeLessThanOrEqual(240);
  for(const id of['ra','rb','rm']){const variants=boxes(p).filter(i=>i.bar?.id===id);expect(new Set(variants.map(i=>`${i.x},${i.y},${i.h}`)).size).toBe(1);}
 }
});
// the input from above runs down to its row's top (a stub over the tick words never
// reached it); the tick word it passes is drawn over it with a halo; its label stays beside the unit caption
test("an above input arrow runs from beside the unit caption down to its row, over the tick word, its label beside the unit caption",()=>{
 const c=compile();expect(c.errors).toEqual([]);
 for(const w of[1158,1280]){const p=layoutStage(c.model,w),arrow=p.items.find((i):i is Extract<Item,{k:'path'}>=>i.k==='path'&&i.arrow&&i.from===2)!,tick=p.items.find((i):i is Extract<Item,{k:'text'}>=>i.k==='text'&&i.s==='t8')!,unit=p.items.find((i):i is Extract<Item,{k:'text'}>=>i.k==='text'&&i.s==='one tick per column')!,label=p.items.find((i):i is Extract<Item,{k:'text'}>=>i.k==='text'&&i.s==='new parcel')!;
  const ra=boxes(p).filter(i=>i.bar?.id==='ra'&&i.x<arrow.pts[0][0]&&i.x+i.w>arrow.pts[0][0]).sort((u,v)=>u.y-v.y)[0]??boxes(p).find(i=>i.bar?.id==='ra')!;
  expect(arrow.head).toBe(8);expect(arrow.pts[1][1]).toBeGreaterThan(tick.y);expect(Math.abs(arrow.pts[1][1]-ra.y)).toBeLessThanOrEqual(3);expect((tick as {halo?:boolean}).halo).toBe(true);expect(label.x).toBeGreaterThan(arrow.pts[0][0]);expect(label.y).toBe(unit.y);expect(label.ink).toBe('acc:ink');expect(arrow.bar?.to).toBe('ra');
 }
});
test("desktop labels wrap only at their shared width cap and taller cell states keep every row at that height",()=>{
 const title='A very long archive heading with enough words to exceed the label column width';
 const c=compile(head.replace('| Archive', '| '+title).replace('+x1 8..12 @3','+a longer cell state 8..12 @3 [soft] [bad]'));expect(c.errors).toEqual([]);
 for(const w of[1158,1280]){const p=layoutStage(c.model,w),rs=['ra','rb','rm'].map(id=>boxes(p).find(i=>i.bar?.id===id)!);expect(new Set(rs.map(r=>r.h)).size).toBe(1);expect(rs[1].y-rs[0].y).toBe(rs[2].y-rs[1].y);const label=boxes(p).find(i=>i.id==='time:row-label:rm')!;expect(label.w).toBe(237);const words=p.items.filter((i):i is Extract<Item,{k:'text'}>=>i.k==='text'&&i.x<label.x+label.w&&i.y>=label.y&&i.y<=label.y+label.h).map(i=>i.s).join(' ');expect(words).toContain(title);expect(words).not.toContain('…');}
});

test("a band gutter and roomy row cards keep their own label columns together",()=>{
 const c=compile(head+'\nband job owners "Owners": ra..rm');expect(c.errors).toEqual([]);
 for(const w of[1158,1280]){const p=layoutStage(c.model,w),cards=boxes(p).filter(i=>i.id?.startsWith('time:row-label:')),gutter=p.items.find((i):i is Extract<Item,{k:'text'}>=>i.k==='text'&&i.s==='Owners')!;
  expect(cards.length).toBe(3);for(const card of cards)expect(gutter.x+measure(gutter.s,gutter.f)).toBeLessThan(card.x);
  const first=cards.find(i=>i.id==='time:row-label:ra')!,badge=p.items.find((i):i is Extract<Item,{k:'badge'}>=>i.k==='badge'&&i.s==='a')!,title=p.items.find((i):i is Extract<Item,{k:'text'}>=>i.k==='text'&&i.s==='Writer')!;
  expect(badge.x-first.x).toBe(6);expect(title.x-first.x).toBe(34);expect(cards[1].y-cards[0].y).toBe(cards[2].y-cards[1].y);
 }
});
