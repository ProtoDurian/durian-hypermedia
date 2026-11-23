// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
import {beforeEach,expect,test} from "bun:test";
import {compileStage,layoutStage,stageLlm} from "../../src/core/stage";
import {beginDocument} from "../../src/core/stage-budget";
const roles={job:1,server:2};
const compile=(head:string,raw="")=>compileStage(head,[{title:"Begin",raw,line:20},{title:"Hold",raw:"",line:30}],1,{},roles);
const head='time: 0..40 | overview\nwindow: 0..40 | observation\nzoom: 38..42 | detail | bracket\nzoom row job receipt "Receipt: contents": +write 39..41';
beforeEach(()=>beginDocument());
test("an overview window is a panel with a stable identity and its own heading",()=>{
 const c=compile(head);expect(c.errors).toEqual([]);
 for(const w of[1158,1280,390]){const p=layoutStage(c.model,w),window=p.items.find(i=>i.k==="box"&&i.id==="time:window");expect(window?.bar).toEqual({kind:"panel",id:"time:window",label:"observation"});}
});
test("the outer inset owns its panel and the inset-only row background is a layout child",()=>{
 const c=compile(head);expect(c.errors).toEqual([]);
 for(const w of[1158,1280,390]){const p=layoutStage(c.model,w),panel=p.items.find(i=>i.k==="box"&&i.cls==="stg-time-inset"),row=p.items.find(i=>i.k==="box"&&i.id?.startsWith("time-inset:row:receipt:"));
  expect(panel?.bar).toEqual({kind:"panel",id:"time-inset:panel",label:"detail"});expect(row?.bar).toEqual({ignore:1});
  expect(panel?.bar?.id).not.toBe("time:window");
 }
});
test("the inset interval is one genuine time bar with its own identity, anchor words and numeric axis",()=>{
 const c=compile(head);expect(c.errors).toEqual([]);
 for(const w of[1158,1280,390]){const p=layoutStage(c.model,w),bars=p.items.filter(i=>i.k==="box"&&i.bar?.kind==="time-bar");expect(bars.length).toBe(1);expect(bars[0].bar).toEqual({kind:"time-bar",id:"time-inset:seg:receipt:39:1",label:"detail",track:"time-inset-x",value:40});}
});
test("the inset bracket and overview highlight are decorative while their words remain drawn",()=>{
 const c=compile(head);expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,1000);
 for(const id of["time-inset:bracket","time-zoom-window"])expect(p.items.find(i=>i.id===id)?.bar).toEqual({ignore:1});
 expect(p.items.some(i=>i.k==="text"&&i.s==="detail")).toBe(true);
});
test("a bordered grid item with a title is a card in roomy and compact forms",()=>{
 for(const raw of['grid 2\n  job: First | saved\n  server: Next | checked','grid 1\n  job: First | saved [+ kept]\n  server: Next | checked [- dropped]']){
  const c=compile("",raw);expect(c.errors).toEqual([]);
  for(const w of[1158,390]){const p=layoutStage(c.model,w),cards=p.items.filter(i=>i.k==="box"&&["First","Next"].includes(String(i.bar?.label)));expect(cards.length).toBe(2);expect(cards.every(i=>i.bar?.kind==="card")).toBe(true);expect(p.items.filter(i=>i.k==="box"&&i.cls==="stg-region").every(i=>i.bar?.ignore===1)).toBe(true);}
 }
});
test("a bordered list with a title is a card and plain worksheet rows retain their kind",()=>{
 const list=compile("","list Totals\n  saved: 2\n  checked: 3");expect(list.errors).toEqual([]);expect(layoutStage(list.model,390).items.find(i=>i.k==="box"&&!i.bar?.ignore&&i.bar?.label==="Totals")?.bar?.kind).toBe("card");
 const rows=compile('time: 0..4\nrow job a "Plain": +ready 0..4');expect(rows.errors).toEqual([]);expect(layoutStage(rows.model,390).items.find(i=>i.k==="box"&&i.bar?.id==="a")?.bar?.kind).toBe("worksheet-row");
});
test("legend tone flags match the named state paint in each legend placement",()=>{
 for(const where of["","key at: top right\n","key at: bottom right\n"]){
  const c=compile(where+'time: 0..4\ncells: 1\nrow job a "A": warming 0..4 [warn]',"key job [warn]: warming");expect(c.errors).toEqual([]);
  for(const w of[1158,390]){const p=layoutStage(c.model,w),cell=p.items.find(i=>i.k==="box"&&i.cls?.includes("stg-time-cell")),key=p.items.find(i=>i.k==="box"&&i.cls==="stg-key");if(cell?.k!=="box"||key?.k!=="box")throw Error("missing cell/key");expect(key.fill).toBe(cell.fill);expect(key.stroke).toBe(cell.stroke);}
  expect(stageLlm(c)).toContain("Key (job, warn): warming.");
 }
});
test("key tone flags preserve role defaults and geometry, and refuse more than one tone",()=>{
 for(const [flag,fill,stroke]of[["good","good:soft","good:line"],["bad","bad:soft","bad:line"],["accent","acc:soft","acc:line"],["plain","surface-2","muted"]]){
  const base=compile("time: 0..4","key job: state"),toned=compile("time: 0..4",`key job [${flag}]: state`);expect(toned.errors).toEqual([]);
  for(const w of[1158,390]){const a=layoutStage(base.model,w).items.find(i=>i.k==="box"&&i.cls==="stg-key"),b=layoutStage(toned.model,w).items.find(i=>i.k==="box"&&i.cls==="stg-key");if(a?.k!=="box"||b?.k!=="box")throw Error("missing swatch");expect([a.x,a.y,a.w,a.h]).toEqual([b.x,b.y,b.w,b.h]);expect(a.fill).toBe("role:job:soft");expect(b.fill).toBe(fill);expect(b.stroke).toBe(stroke);}
 }
 for(const raw of["key job [warn] [good]: state","key job [warn] [warn]: state","key job [unknown]: state","key job __proto__: state","key job constructor: state"])expect(compile("time: 0..4",raw).errors.length).toBeGreaterThan(0);
});
test("compact multi-column verdict grids are worksheet rows while separately boxed single-column summaries stay cards",()=>{
 const entries='\n  job: First | saved [+ kept]\n  server: Next | checked [- dropped]\n  job: Last | queued [+ kept]';
 for(const w of[1158,390])for(const cols of[1,2,3]){const c=compile('',`grid ${cols}`+entries);expect(c.errors).toEqual([]);const p=layoutStage(c.model,w),items=p.items.filter(i=>i.k==='box'&&['First','Next','Last'].includes(String(i.bar?.label)));expect(items.length).toBe(3);expect(items.every(i=>i.bar?.kind===(cols===1?'card':'worksheet-row'))).toBe(true);}
 const c=compile('', 'rows\n  title | value\n  first | saved');expect(c.errors).toEqual([]);for(const w of[1158,390]){const p=layoutStage(c.model,w);expect(p.items.filter(i=>i.k==='box'&&i.bar?.kind==='worksheet-row').length).toBe(2);expect(p.items.some(i=>i.k==='box'&&i.bar?.kind==='card')).toBe(false);}
});
