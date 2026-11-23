// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
import { beforeEach, expect, test } from "bun:test";
import { compileStage, layoutStage, stageLlm } from "../../src/core/stage";
import { blockFor, FONT, measure, setPhoneFont, type Item } from "../../src/core/stage-core";
/** a word's width as a layout at width w measures it (a phone stage: its phone type sizes) */
const measureAt = (s: string, f: Parameters<typeof measure>[1], w: number) => { setPhoneFont(w < 480); try { return measure(s, f); } finally { setPhoneFont(false); } };
import { beginDocument, newBudget, BudgetError } from "../../src/core/stage-budget";
import { tickStep } from "../../src/core/stage-time";
const roles = { job: 1, server: 2 };
const head = `time: 0..60 | seconds
row job j1 "build": queued 0..4; +running 4..31; done 31..60
row server j2 "test": waiting 0..31; +running 31..52; done 52..60
ticks: 0, 20, 40, 60
at 31: handoff
zoom: 24..36 | Close-up
plot: 0..100 | progress
point job p1 at 0: 0 | begin
point job p2 at 30: 50 | halfway
point job p3 at 60: 100 | finish`;
const steps = [{ title: "Build", raw: "span j1 4..31: 27 s", line: 20 }, { title: "Test", raw: "at 31: ready\nat 52: pass", line: 23 }];
const compile = (h = head, ss = steps) => compileStage(h, ss, 1, {}, roles);
beforeEach(() => beginDocument());
test("a short tick stays below the last row while full markers cross the grid",()=>{
 const h='time: 0..7\ncells: 1 | headers\nticks: 0.5 first, 3.5 middle, 6.5 last\nrow job a "A": +saved 0..7\nrow server b "B": +ready 0..7';
 const c=compile(h,[{title:"Start",raw:"keep at 3 [bad]: full",line:10},{title:"End",raw:"keep at 4 [tick] [below] [bad]: short",line:12}]);expect(c.errors).toEqual([]);
 for(const w of[1158,1280,390,360]){
  const p=layoutStage(c.model,w),paths=p.items.filter((i):i is Extract<Item,{k:"path"}>=>i.k==="path"&&!!i.id?.includes(":at:")),full=paths.find(i=>i.bar?.value===3)!,tick=paths.find(i=>i.bar?.value===4)!,label=p.items.find(i=>i.k==="text"&&i.s==="short"),rows=p.items.filter((i):i is Extract<Item,{k:"box"}>=>i.k==="box"&&!!i.cls?.includes("stg-time-row")),headers=p.items.filter((i):i is Extract<Item,{k:"box"}>=>i.k==="box"&&i.bar?.kind==="band");
  expect(tick.pts[1][1]-tick.pts[0][1]).toBe(6);expect(full.pts[1][1]-full.pts[0][1]).toBeGreaterThan(40);
  expect(tick.pts[0][1]).toBeGreaterThan(Math.max(...rows.map(i=>i.y+i.h)));expect(headers.every(i=>i.y<Math.min(...rows.map(i=>i.y)))).toBe(true);
  if(label?.k!=="text")throw Error("missing tick label");expect(label.y-12).toBeGreaterThan(tick.pts[1][1]);expect(tick.from).toBe(2);expect(tick.to).toBe(0);expect(tick.dash).toBe(true);expect(tick.arrow).toBeUndefined();
  const bare=layoutStage(compile(h,[{title:"Start",raw:"keep at 3 [bad]: full",line:10},{title:"End",raw:"",line:12}]).model,w);
  expect(p.items.filter(i=>i.k==="box"&&i.cls?.includes("stg-time-cell"))).toEqual(bare.items.filter(i=>i.k==="box"&&i.cls?.includes("stg-time-cell")));
  bounded(p.items,w,p.h);
 }
});
test("short marker ticks support setup, caption words and a bottom ruler",()=>{
 for(const h of['time: 0..4\nat 2 [tick]: check','time: 0..4\nruler: below\nrow job a "A": +ready 0..4\nat 2 [tick] [below]: check'])expect(compile(h,[]).errors).toEqual([]);
 expect(compile('time: 0..4',[{title:"Check",raw:"keep at 2 [tick] [caption]: check",line:5},{title:"Hold",raw:"",line:7}]).errors).toEqual([]);
 expect(compile('time: 0..4\ndot 2 [tick]: check',[]).errors.length).toBeGreaterThan(0);
});
test("a marker breaks behind cell words with the cell fill and leaves its edge geometry intact",()=>{
 const h='time: 0..4\ncells: 1\nrow job a "Draft": +stored 0..4 [wide]';
 const c=compile(h,[{title:"Begin",raw:"keep at 2 [guide] [below]: check",line:8},{title:"Hold",raw:"",line:10}]);expect(c.errors).toEqual([]);
 for(const w of[1158,390,360]){
  const p=layoutStage(c.model,w),mask=p.items.find(i=>i.k==="box"&&i.cls==="stg-time-word-mask"),cell=p.items.find(i=>i.k==="box"&&i.cls?.includes("stg-seg")),marker=p.items.find(i=>i.k==="path"&&i.bar?.value===2),word=p.items.find(i=>i.k==="text"&&i.s==="stored");
  if(mask?.k!=="box"||cell?.k!=="box"||marker?.k!=="path"||word?.k!=="text")throw Error("missing masked cell");
  expect(mask.fill).toBe(cell.fill);expect(mask.bar).toEqual({ignore:1});expect(mask.stroke).toBe("none");expect(mask.from).toBe(cell.from);expect(mask.to).toBe(cell.to);
  expect(marker.pts[0][0]).toBeGreaterThan(mask.x);expect(marker.pts[0][0]).toBeLessThan(mask.x+mask.w);expect(mask.y).toBeLessThan(word.y);expect(mask.y+mask.h).toBeGreaterThan(word.y);
  expect(p.items.indexOf(cell)).toBeLessThan(p.items.indexOf(marker));expect(p.items.indexOf(marker)).toBeLessThan(p.items.indexOf(mask));expect(p.items.indexOf(mask)).toBeLessThan(p.items.indexOf(word));
  bounded(p.items,w,p.h);
 }
 const heading=layoutStage(compile(h,[{title:"Begin",raw:"keep at 0 [guide]: heading",line:8},{title:"Hold",raw:"",line:10}]).model,390);expect(heading.items.some(i=>i.k==="box"&&i.cls==="stg-time-word-mask"&&i.fill==="surface")).toBe(true);
 for(const raw of["keep at 4 [guide]: away","keep at 2 [tick] [below]: short"]){const p=layoutStage(compile(h,[{title:"Begin",raw,line:8},{title:"Hold",raw:"",line:10}]).model,390);expect(p.items.some(i=>i.k==="box"&&i.cls==="stg-time-word-mask")).toBe(false);}
 const late=compile('time: 0..4\ncells: 1\nrow job a "A": +stored 0..4 [wide] @2',[{title:"First",raw:"at 2: gone",line:8},{title:"Next",raw:"",line:10}]);expect(late.errors).toEqual([]);expect(layoutStage(late.model,390).items.some(i=>i.k==="box"&&i.cls==="stg-time-word-mask")).toBe(false);
});
test("time marker strokes paint over state fills and under row words",()=>{
 const c=compile('time: 0..4\ncells: 1\nrow job a "Draft": +stored 0..4 [wide]\nrow server b "Copy": +saved 0..4',[{title:"One",raw:"keep at 1 [accent] [guide] [below]: first check\nkeep at 3 [bad] [guide] [below]: final check",line:10},{title:"Two",raw:"",line:14}]);expect(c.errors).toEqual([]);
 for(const w of[1280,390,360]){
  const p=layoutStage(c.model,w),markers=p.items.map((it,i)=>({it,i})).filter(({it})=>it.k==="path"&&!!it.id?.includes(":at:")),background=p.items.map((it,i)=>({it,i})).filter(({it})=>it.k==="box"&&(it.cls?.includes("stg-seg")||it.cls?.includes("stg-time-cell"))),words=p.items.map((it,i)=>({it,i})).filter(({it})=>it.k==="text"&&["stored","saved"].includes(it.s));
  expect(markers.length).toBe(2);expect(background.length).toBe(5);expect(words.length).toBe(5);
  for(const marker of markers){expect(marker.i).toBeGreaterThan(Math.max(...background.map(b=>b.i)));expect(marker.i).toBeLessThan(Math.min(...words.map(b=>b.i)));if(marker.it.k==="path"){expect(marker.it.dash).toBe(true);expect(marker.it.w).toBe(2);expect(marker.it.arrow).toBeUndefined();expect(marker.it.from).toBe(1);expect(marker.it.to).toBe(0);}}
  bounded(p.items,w,p.h);
 }
});
test("an exact-range replacement may follow all the later cells in a row",()=>{
 const base=['_ 0..2 [plain] [numbered]','_ 2..3 [plain] [numbered]','_ 3..6 [plain] [numbered]','_ 6..7 [plain] [numbered]','_ 7..8 [plain] [numbered]'],replacement='_ 2..3 [accent] [lit] [numbered] @3..4',ss=Array.from({length:4},(_,i)=>({title:String(i+1),raw:"",line:10+i}));
 const compileRow=(segments:string[])=>compile('time: 0..8\ncells: 1\nrow job a "": '+segments.join("; "),ss),late=compileRow([...base,replacement]),near=compileRow([base[0],base[1],replacement,...base.slice(2)]);
 expect(late.errors).toEqual([]);expect(near.errors).toEqual([]);
 for(const w of[1000,390,360]){
  const p=layoutStage(late.model,w),q=layoutStage(near.model,w),cells=(plan:typeof p,step:number)=>plan.items.filter((i):i is Extract<Item,{k:"box"}>=>i.k==="box"&&!!i.cls?.includes("stg-time-cell")&&(i.from??1)<=step&&(!i.to||i.to>=step)).map(i=>[i.bar?.label,i.x,i.y,i.w,i.h,i.fill]).sort((a,b)=>Number(a[1])-Number(b[1]));
  for(let step=1;step<=4;step++){expect(cells(p,step).length).toBe(8);expect(cells(p,step)).toEqual(cells(q,step));}bounded(p.items,w,p.h);
 }
 const overlap=compileRow([...base,'_ 1..4 [accent] @3..4']);expect(overlap.errors.some(e=>e.msg.includes("without overlap"))).toBe(true);
});
test("different state ranges may overlap only when their step windows never meet",()=>{
 const h='time: 0..8\nrow job a "Batch": waiting 0..6 [wide] @1..2; complete 0..8 [wide] @3..3; holding 0..6 [wide] @4; saved 6..8 [good] [wide] @4',ss=Array.from({length:4},(_,i)=>({title:String(i+1),raw:"",line:10+i})),c=compile(h,ss);expect(c.errors).toEqual([]);
 for(const w of[1000,340]){const p=layoutStage(c.model,w),bars=p.items.filter((i):i is Extract<Item,{k:"box"}>=>i.k==="box"&&!!i.cls?.includes("stg-seg"));expect(bars.map(i=>[i.bar?.label,i.from,i.to])).toEqual([["waiting",1,2],["complete",3,3],["holding",4,0],["saved",4,0]]);expect(new Set(bars.map(i=>i.y)).size).toBe(1);expect(bars[1].w).toBeCloseTo(bars[2].w+bars[3].w,6);bounded(p.items,w,p.h);}
 for(const raw of[h.replace("@3..3","@2..3"),h.replace("holding 0..6 [wide] @4","holding 0..6 [wide] @3"),'time: 0..8\nrow job a "Batch": right 4..8; left 0..4'])expect(compile(raw,ss).errors.some(e=>e.msg.includes("without overlap"))).toBe(true);
});
test("state step-window validation stays bounded as a row doubles",()=>{
 const ss=Array.from({length:8},(_,i)=>({title:String(i),raw:"",line:10+i}));
 const work=(n:number)=>{const budget=beginDocument(),c=compile("time: 0.."+n+"\nrow job a \"Batch\": "+Array.from({length:n},(_,i)=>`saved ${i}..${i+1} @1..8`).join("; "),ss);expect(c.errors).toEqual([]);return 2_000_000-budget.left().work;};
 const a=work(128),b=work(256);expect(b).toBeGreaterThan(a*1.7);expect(b).toBeLessThan(a*2.2);
});
test("time arrow tones override role colour and keep direction and dash",()=>{
 for(const [flag,ink]of[["plain","ink"],["accent","acc:line"],["good","good:line"],["bad","bad:line"],["warn","warn:line"]]){
  const c=compile('time: 0..4\nrow job a "A": ready 0..4\nrow server b "B": ready 0..4',[{title:"One",raw:`arrow above -> a at 1 [dashed] [${flag}]: input`,line:8},{title:"Two",raw:`arrow b -> a at 2 [${flag}]: receipt`,line:10}]);expect(c.errors).toEqual([]);
  const p=layoutStage(c.model,340),arrows=p.items.filter((i):i is Extract<Item,{k:"path"}>=>i.k==="path"&&!!i.arrow);expect(arrows.map(i=>[i.ink,i.dash,i.bar?.from,i.bar?.to])).toEqual([[ink,true,"above","a"],[ink,false,"b","a"]]);
 }
 for(const flags of["[plain] [accent]","[bad] [good]","[plain] [plain]","[dashed] [dashed]","[soft]"])expect(compile('time: 0..4\nrow job a "A": ready 0..4',[{title:"One",raw:"arrow above -> a at 1 "+flags+": input",line:8},{title:"Two",raw:"",line:10}]).errors.length).toBeGreaterThan(0);
});
test("soft time cells show only the explicit tone's fill without changing geometry",()=>{
 const ss=[{title:"One",raw:"",line:10},{title:"Two",raw:"",line:12},{title:"Three",raw:"",line:14}];
 for(const tone of["bad","good","warn","accent"]){
  const h=`time: 0..3\ncells: 1 | roomy\nrow job a "Draft": held 0..1 [${tone}] [lit]; held 1..2 @2 [soft] [${tone}] [lit]; held 2..3 @3 [${tone}] [soft]`,c=compile(h,ss),base=compile(h.replaceAll("[soft]",""),ss);expect(c.errors).toEqual([]);expect(stageLlm(c)).toContain("[soft]");
  for(const w of[1000,356,326]){
   const p=layoutStage(c.model,w),b=layoutStage(base.model,w),cells=p.items.filter((i):i is Extract<Item,{k:"box"}>=>i.k==="box"&&!!i.cls?.includes("stg-time-cell"));
   expect(cells.length).toBe(3);expect(cells.slice(1).every(i=>i.fill===`${tone==="accent"?"acc":tone}:soft`&&i.stroke==="line"&&!i.thick&&!i.hot)).toBe(true);
   const texts=p.items.filter((i):i is Extract<Item,{k:"text"}>=>i.k==="text"&&i.tip==="held"&&(i.from??1)>1);expect(texts.every(i=>i.ink==="ink")).toBe(true);
   const geometry=(items:Item[])=>items.filter(i=>i.k!=="path"||i.ink!=="bad:line").map(i=>i.k==="path"?[i.k,i.pts]:[i.k,i.x,i.y,"w" in i?i.w:0,"h" in i?i.h:0,i.k==="text"?i.s:""]);
   expect(p.h).toBe(b.h);expect(geometry(p.items)).toEqual(geometry(b.items));expect(p.items.filter(i=>i.k==="path"&&i.ink==="bad:line").length).toBe(tone==="bad"?2:0);bounded(p.items,w,p.h);
  }
 }
});
for(const flags of["[soft]","[plain] [soft]","[dashed] [soft]","[dot] [soft]"])test("soft cells refuse a missing tone "+flags,()=>{
 const c=compile("time: 0..2\ncells: 1\nrow job a \"Draft\": held 0..2 "+flags,[]);expect(c.errors.some(e=>e.msg.includes("[soft] needs a tone"))).toBe(true);
});
test("roomy phone cells use the stage width and foot words start at the first column",()=>{
 const c=compile('time: 0..6\ncells: 1 | roomy\nrow job a "Draft": +reads a 0..2; +dies 2..3 @2 [bad]; +ready 3..6 @4',[{title:"One",raw:"foot: The draft is ready.",line:10},{title:"Two",raw:"foot: The draft is ready.",line:12},{title:"Three",raw:"foot: The draft is ready.",line:14},{title:"Four",raw:"foot: The draft is ready.",line:16}]);
 expect(c.errors).toEqual([]);
 for(const w of[1000,356,326]){
  const p=layoutStage(c.model,w),cells=p.items.filter((i):i is Extract<Item,{k:"box"}>=>i.k==="box"&&!!i.cls?.includes("stg-time-cell")),foot=p.items.filter((i):i is Extract<Item,{k:"text"}>=>i.k==="text"&&i.s==="The draft is ready.");
  expect(cells.length).toBe(6);expect(foot.length).toBe(4);expect(foot.every(i=>Math.abs(i.x-cells[0].x)<.01)).toBe(true);expect(new Set(foot.map(i=>i.y)).size).toBe(1);
  if(w<480){expect(cells[0].x).toBe(8);expect(w-cells.at(-1)!.x-cells.at(-1)!.w).toBe(8);expect(p.items.filter(i=>i.k==="text"&&i.s==="reads a").length).toBe(2);}
  bounded(p.items,w,p.h);
 }
 const later=compile('time: 0..6\ncells: 1 | roomy\nrow job a "Draft": +ready 0..6\nunits 2: kept 2',[{title:"One",raw:"foot: A fresh summary.",line:10},{title:"Two",raw:"",line:12}]);
 expect(later.errors).toEqual([]);expect(layoutStage(later.model,356).items.find(i=>i.k==="text"&&i.s==="A fresh summary.")?.x).toBe(14);
});
test("roomy row and lane bounds follow visible cells without moving existing cells",()=>{
 const c=compile('time: 0..8\ncells: 1 | roomy\nrow job a "A": +x 0..2; +y 2..4 @2; +z 4..8 @3\nrow server b "B": +x 0..1; +y 1..3 @2; +z 3..7 @3',[{title:"One",raw:"",line:10},{title:"Two",raw:"",line:11},{title:"Three",raw:"",line:12}]);
 expect(c.errors).toEqual([]);
 for(const w of [1000,340]){
  const p=layoutStage(c.model,w),visible=(i:Item,s:number)=>(!i.from||i.from<=s)&&(!i.to||i.to>=s);
  for(const kind of ["worksheet-row","lane"]){
   const boxes=p.items.filter(i=>i.k==="box"&&i.bar?.kind===kind&&(kind==="lane"||i.bar?.id==="a"));
   const widths=[1,2,3].map(s=>{const b=boxes.filter(i=>visible(i,s));expect(b.length).toBe(1);return b[0].k==="box"?b[0].w:0;});
   expect(widths[0]).toBeLessThan(widths[1]);expect(widths[1]).toBeLessThan(widths[2]);
  }
  const cell=p.items.find(i=>i.k==="box"&&i.cls?.includes("stg-time-cell")&&i.bar?.label==="x");
  expect(cell?.from).toBe(1);expect(cell?.to).toBe(0);
  for(const [row,counts]of[["a",[2,4,8]],["b",[1,3,7]]] as const)for(let step=1;step<=3;step++)expect(p.items.filter(i=>i.k==="box"&&i.id?.includes(":cell:"+row+":")&&visible(i,step)).length).toBe(counts[step-1]);
 }
});
test("ordinary cell reveals, persistent markers and transfers keep frames and existing cells fixed",()=>{
 const c=compile('track: job start, work, finish\ntime: 0..8\ncells: 1\nrow job a "A": waiting 0..2 @1; +x 0..2 @2; +y 2..4 @2; +z 4..8 @3\nrow server b "B": +x 0..1; +y 1..3 @2; +z 3..7 @3',[{title:"One",raw:"at start\nkeep at 1: first",line:10},{title:"Two",raw:"at work\nkeep at 2: second\narrow above -> a at 3.5 [dashed]: input",line:13},{title:"Three",raw:"at finish\nkeep at 3: last\narrow b -> a at 5.5: saved copy",line:18}]);
 expect(c.errors).toEqual([]);
 for(const w of [1000,340]){
  const p=layoutStage(c.model,w),frames=p.items.filter(i=>i.k==="box"&&(i.bar?.kind==="worksheet-row"||i.bar?.kind==="lane"));
  expect(frames.length).toBe(3);expect(frames.every(i=>i.from===1&&i.to===0)).toBe(true);
  const cells=(name:string)=>p.items.filter(i=>i.k==="box"&&i.id?.includes(":cell:a:")&&i.bar?.label===name).map(i=>i.k==="box"?[i.x,i.y,i.w,i.h]:[]);
  expect(cells("waiting").length).toBe(2);expect(cells("waiting")).toEqual(cells("x"));
  const markers=p.items.filter(i=>i.k==="path"&&i.id?.includes(":at:"));expect(markers.length).toBe(3);
  expect(new Set(markers.map(i=>i.k==="path"?i.pts[1][1]:0)).size).toBe(1);
 }
});
test("short numbered cell rows use a compact pitch on desktop and phone",()=>{
 const c=compile('time: 0..8\nruler: none\ncells: 1\nrow job a "": +_ 0..8 [numbered]\nrow server b "": +_ 0..8 [numbered]',[]);
 expect(c.errors).toEqual([]);
 for(const w of [1000,340]){
  const p=layoutStage(c.model,w),rows=p.items.filter(i=>i.k==="box"&&i.bar?.kind==="worksheet-row");
  if(rows[0].k!=="box"||rows[1].k!=="box")throw new Error("missing rows");
  expect(rows[1].y-rows[0].y).toBeLessThanOrEqual(30);
 }
});
test("dense phone numbered cells: numbers too wide for their cell, level or on end, stand level on staggered rows (on end only when level does not fit 3 rows); every cell keeps its number drawn",()=>{
 const c=compile('time ticks: 200..232 | ticks\nruler: none\ncells: 1\nrow job a "": +_ 200..232 [numbered]',[]);expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,340),cells=p.items.filter(i=>i.k==="box"&&i.cls?.includes("stg-time-cell"));expect(cells.length).toBe(32);
 expect(cells.every(i=>i.k==="box"&&i.h<=64&&i.h===(cells[0] as Extract<Item,{k:"box"}>).h)).toBe(true); // two staggered rows (3 px apart) when a turned number is wider than its cellexpect(cells.map(i=>i.bar?.label)).toEqual(Array.from({length:32},(_,i)=>String(200+i)));
 expect(p.items.some(i=>i.k==="text"&&i.s==="ticks")).toBe(true);
 expect(cells.map(i=>i.bar?.label)).toEqual(Array.from({length:32},(_,i)=>String(200+i))); // every cell keeps its number for the bar and readers
 const drawn=p.items.filter(i=>i.k==="text"&&/^2\d\d$/.test(i.s));expect(drawn.some(i=>i.k==="text"&&i.rotate)).toBe(false);expect(drawn.length).toBeGreaterThanOrEqual(8); // on end only inside its own cell: these are thinner than turned digits
 expect(new Set(drawn.map(i=>i.k==="text"?i.s:"")).size).toBe(32); // never fewer
bounded(p.items,340,p.h);
 const desktop=layoutStage(c.model,1000);expect(desktop.items.some(i=>i.k==="text"&&i.s==="231")).toBe(true);expect(desktop.items.some(i=>i.k==="text"&&i.rotate)).toBe(false);
});
test("numeric header rotation is phone-only and words and fitting numbers stay level",()=>{
 const h='time: 924..956\ncells: 1 | headers\nrow job a "": +_ 924..956 [numbered]';
 const c=compile(h,[]);expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,340),numbers=p.items.filter(i=>i.k==="text"&&/^9\d\d$/.test(i.s));
 expect(numbers.some(i=>i.k==="text"&&i.rotate)).toBe(false);expect(new Set(numbers.map(i=>i.k==="text"?i.s:"")).size).toBe(32); // headers that fit neither level nor on end stand level on staggered rows; numbered cells too (on end only inside their own cell)
 for(const source of ['time: 0..4\ncells: 1 | headers\nrow job a "": 1 0..4','time: 0..32\nruler: none\ncells: 1\nrow job a "": word 0..32']){
  const x=compile(source,[]);expect(x.errors).toEqual([]);expect(layoutStage(x.model,340).items.some(i=>i.k==="text"&&i.rotate)).toBe(false);
 }
 expect(layoutStage(c.model,1000).items.some(i=>i.k==="text"&&i.rotate)).toBe(false);
});
test("phone ruler labels retain every authored word and complete numeric tick",()=>{
 const c=compile('time: 0..32\nticks: 0 p0, 4 p4 ▲ parcel ready, 8 p8, 28 p28, 30 p30, 32 p32\nrow job a: +x 0..32\nat 4: copy lost',[]);expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,340),words=p.items.filter(i=>i.k==="text").map(i=>i.k==="text"?i.s:"").join(" ");
 for(const word of ['p0','p4','▲','parcel ready','p8','p28','p30','p32','copy lost'])expect(words).toContain(word);
 bounded(p.items,340,p.h);
 const numeric=compile('time: 841..871\nticks: '+Array.from({length:31},(_,i)=>String(841+i)).join(', '),[]);expect(numeric.errors).toEqual([]);
 const n=layoutStage(numeric.model,340);expect(n.items.filter(i=>i.k==="text").map(i=>i.k==="text"?i.s:"")).toEqual(Array.from({length:31},(_,i)=>String(841+i)));
});
test("above arrows reserve one label line without enlarging transfer gaps",()=>{
 const head='time: 0..8\ncells: 1 | roomy\nrow job a "A": +x 0..8\nrow server b "B": +x 0..8';
 const p=layoutStage(compile(head,[{title:'Input',raw:'arrow above -> a at 6.5 [dashed]: senders push to it directly',line:8}]).model,1000);
 const plain=layoutStage(compile(head,[{title:'Input',raw:'',line:8}]).model,1000);
 expect(p.h-plain.h).toBeLessThanOrEqual(50);
 expect(p.items.filter(i=>i.k==="text"&&i.s==='senders push to it directly').length).toBe(1);
});
test("phone cells and boxed headers never split a word inside its letters",()=>{
 const h='time: 0..8\ncells: 1 | headers\nticks: 0.5 first, 1.5 receiptTick, 2.5 third, 3.5 fourth, 4.5 fifth, 5.5 sixth, 6.5 seventh, 7.5 eighth\nrow job a "": operators 0..4; /receipt 4..5; archived, 5..6; payload 6..7; paused 7..8';
 const c=compile(h,[]);expect(c.errors).toEqual([]);const p=layoutStage(c.model,340),words=p.items.filter(i=>i.k==="text").map(i=>i.k==="text"?i.s:"");
 expect(words.filter(s=>s==='operators'||s.endsWith(': operators')).length).toBe(4);
 for(const word of ['receiptTick','receipt','archived,','payload','paused'])expect(words.join(' ')).toContain(word);
 expect(words.some(s=>s.includes('…'))).toBe(false);bounded(p.items,340,p.h);
});
test("phone captions reuse fixed shelves across mutually exclusive states",()=>{
 const steps=[{title:"First",raw:"",line:8},{title:"Second",raw:"",line:10}];
 const source=(states:string)=>'time: 0..32\nruler: none\ncells: 1\nrow job a "": '+states;
 const single=layoutStage(compile(source('transferred 0..4'),steps).model,340);
 const c=compile(source('transferred 0..4 @1..1; processing 0..4 @2..2'),steps);expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,340);expect(p.h).toBe(single.h);
 const texts=p.items.filter(i=>i.k==='text');expect(texts.filter(i=>i.k==='text'&&i.s.endsWith(': transferred')).length).toBe(4);expect(texts.filter(i=>i.k==='text'&&i.s.endsWith(': processing')).length).toBe(4);
 const ys=(word:string)=>texts.filter(i=>i.k==='text'&&i.s.endsWith(': '+word)).map(i=>i.k==='text'?i.y:0);expect(ys('processing')).toEqual(ys('transferred'));bounded(p.items,340,p.h);
});
test("a narrow bar caption uses spare space beside a plain row heading",()=>{
 const c=compile('time: 0..32\nruler: none\ncells: 1\nrow job a "schedule": after 28..29 [wide]',[]);expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,340),heading=p.items.find(i=>i.k==='text'&&i.s==='schedule'),caption=p.items.find(i=>i.k==='text'&&i.s.endsWith(': after'));
 if(heading?.k!=='text'||caption?.k!=='text')throw Error('missing words');expect(caption.y).toBe(heading.y);expect(caption.x).toBeGreaterThan(heading.x+measureAt(heading.s,heading.f,340));bounded(p.items,340,p.h);
});
test("complete dense phone ruler numbers share a compact shelf",()=>{
 const values=Array.from({length:31},(_,i)=>String(841+i));const c=compile('time: 841..871\nticks: '+values.join(', '),[]);expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,340),words=p.items.filter(i=>i.k==='text');expect(words.map(i=>i.k==='text'?i.s:'')).toEqual(values);
 const axis=p.items.find(i=>i.k==='path'&&i.bar?.axis==='time-x');if(axis?.k!=='path')throw Error('missing axis');expect(axis.pts[0][1]).toBeLessThanOrEqual(48);expect(words.every(i=>i.k==='text'&&i.rotate===90)).toBe(true);bounded(p.items,340,p.h);
});
test("fitting phone cell words remain inside the cell",()=>{
 const c=compile('time: 0..8\nruler: none\ncells: 1\nrow job a "": ready 0..1',[]);expect(c.errors).toEqual([]);const p=layoutStage(c.model,340),cell=p.items.find(i=>i.k==='box'&&i.cls?.includes('stg-time-cell')),word=p.items.find(i=>i.k==='text'&&i.s==='ready');
 if(cell?.k!=='box'||word?.k!=='text')throw Error('missing cell words');expect(word.y).toBeGreaterThan(cell.y);expect(word.y).toBeLessThan(cell.y+cell.h);expect(word.tip).toBe('ready');
});
test("phone transfers keep their strokes outside row heading cards",()=>{
 const h='time: 0..7\ncells: 1 | roomy\nrow job a "(a) Draft | writer": +x1 0..4\nrow server b "(b) Copy | second writer": +x1 0..4';
 const c=compile(h,[{title:'Copy',raw:'arrow b -> a at 0.5: no reply',line:8},{title:'Hold',raw:'',line:10}]);expect(c.errors).toEqual([]);
 for(const w of [356,326]){const p=layoutStage(c.model,w),arrow=p.items.find(i=>i.k==='path'&&i.arrow),heads=p.items.filter(i=>i.k==='box'&&i.bar?.ignore&&i.fill.startsWith('role:'));if(arrow?.k!=='path')throw Error('missing arrow');expect(heads.length).toBe(2);
  for(const head of heads)if(head.k==='box')for(let j=1;j<arrow.pts.length;j++){const [a,b]=[arrow.pts[j-1],arrow.pts[j]];expect(a[0]>head.x&&a[0]<head.x+head.w&&Math.min(a[1],b[1])<head.y+head.h&&Math.max(a[1],b[1])>head.y).toBe(false);}
  const cells=p.items.filter(i=>i.k==='box'&&i.cls?.includes('stg-time-cell'));expect(cells.every(i=>i.k==='box'&&Math.abs(i.w-((w-28+16)/7-4))<.01)).toBe(true);
 }
});
test("an above callout near the right edge places its words left of the stroke",()=>{
 const c=compile('time: 0..7\ncells: 1 | roomy\nrow job a "(a) Draft | first writer": +x1 0..7',[{title:'Input',raw:'arrow above -> a at 5.5: a new parcel',line:8},{title:'Hold',raw:'',line:10}]);expect(c.errors).toEqual([]);
 for(const w of [356,326]){const p=layoutStage(c.model,w),arrow=p.items.find(i=>i.k==='path'&&i.arrow),word=p.items.find(i=>i.k==='text'&&i.s==='a new parcel');if(arrow?.k!=='path'||word?.k!=='text')throw Error('missing callout');expect(word.x+measureAt(word.s,word.f,w)).toBeLessThan(arrow.pts[0][0]-6);}
});
test("a row arrow label uses the right without inflating earlier visible bounds",()=>{
 const h='time: 0..8\ncells: 1 | roomy\nrow job a "(a) Draft | writer": +x1 0..4; +x2 4..8 @3\nrow server b "(b) Copy | spare writer": +x1 0..4; +x2 4..8 @3';
 const steps=[{title:'Draft',raw:'',line:8},{title:'Copy',raw:'arrow b -> a at 3.5 [dashed]: fetch /parcel/state, once',line:10},{title:'Next',raw:'',line:12}];const c=compile(h,steps);expect(c.errors).toEqual([]);
 for(const w of [1000,356,326]){const p=layoutStage(c.model,w),arrow=p.items.find(i=>i.k==='path'&&i.arrow),labels=p.items.filter(i=>i.k==='text'&&i.from===2&&i.to===2&&!i.tip),frame=p.items.find(i=>i.k==='box'&&i.bar?.id==='a'&&i.from===1);
  if(arrow?.k!=='path'||frame?.k!=='box')throw Error('missing reveal');expect(labels.length).toBeGreaterThan(0);
  for(const word of labels)if(word.k==='text'){const end=word.x+measureAt(word.s,word.f,w);if(w>326)expect(word.x).toBeGreaterThan(arrow.pts[0][0]+6);else expect(end).toBeLessThan(arrow.pts[0][0]-6);expect(end).toBeLessThanOrEqual(w);}
  expect(labels.map(i=>i.k==='text'?i.s:'').join(' ')).toBe('fetch /parcel/state, once');bounded(p.items,w,p.h);
 }
});
test("setup dot lists preserve individual numeric markers and optional shared colour",()=>{
 const lists=compile('time: -120..0\ndot -105, -90, -75, -60 [plain]',[]),singles=compile('time: -120..0\ndot -105 [plain]\ndot -90 [plain]\ndot -75 [plain]\ndot -60 [plain]',[]);expect(lists.errors).toEqual([]);expect(singles.errors).toEqual([]);
 for(const w of[1000,340]){const dots=(c:typeof lists)=>layoutStage(c.model,w).items.filter(i=>i.k==='box'&&i.cls?.includes('stg-ruler-dot'));expect(dots(lists)).toEqual(dots(singles));}
 for(const raw of['dot -105, -105','dot -121, -90','dot -105, nope','dot -105, -90 [wat]'])expect(compile('time: -120..0\n'+raw,[]).errors.length).toBeGreaterThan(0);
});
test("window endpoint tick words keep clear of the window's vertical borders",()=>{
 const c=compile('time: -120..0\nwindow: -120..0 | observation\nticks: -120 start, -60 middle, 0 end',[]);expect(c.errors).toEqual([]);
 for(const w of[1000,340]){const p=layoutStage(c.model,w),frame=p.items.find(i=>i.k==='box'&&i.bar?.id==='time:window'),start=p.items.find(i=>i.k==='text'&&i.s==='start'),end=p.items.find(i=>i.k==='text'&&i.s==='end'),axis=p.items.find(i=>i.k==='path'&&i.bar?.axis==='time-x');if(frame?.k!=='box'||start?.k!=='text'||end?.k!=='text'||axis?.k!=='path')throw Error('missing window');expect(start.x).toBeGreaterThanOrEqual(frame.x+4);expect(end.x+measureAt(end.s,end.f,w)).toBeLessThanOrEqual(frame.x+frame.w-4);expect(axis.pts[1][0]).toBe(frame.x+frame.w);bounded(p.items,w,p.h);}
});
test("bottom-ruler lanes start at zero, with per-lane tick guides and right-aligned labels",()=>{
 const c=compile('time: 0..15 | parcel spacing\nruler: below\nrow labels: beside\nticks: 0, 5, 10, 15\nrow job a "First": arrived 3.9..4.1 [dot]\nrow server b "Second": saved 7.9..8.1 [dot]\nat 12: storage ready',[]);expect(c.errors).toEqual([]);
 for(const w of[1000,356,326]){const p=layoutStage(c.model,w),axis=p.items.find(i=>i.k==='path'&&i.bar?.axis==='time-x'),unit=p.items.find(i=>i.k==='text'&&i.s==='parcel spacing'),row=p.items.find(i=>i.k==='box'&&i.bar?.id==='a'),heading=p.items.find(i=>i.k==='text'&&i.s==='storage ready'),guides=p.items.filter(i=>i.k==='path'&&i.bar?.ignore);if(axis?.k!=='path'||unit?.k!=='text'||row?.k!=='box'||heading?.k!=='text')throw Error('missing strip');expect(row.x).toBe(axis.pts[0][0]);expect(row.y).toBeGreaterThan(heading.y);expect(heading.y).toBeGreaterThan(unit.y);expect(guides.length).toBe(8);for(const guide of guides)if(guide.k==='path'){expect(guide.pts[0][0]).toBe(guide.pts[1][0]);expect(guide.bar?.edge).toBeUndefined();}const label=p.items.find(i=>i.k==='text'&&i.s==='First');expect(label?.k==='text'&&label.anchor).toBe('end');const word=p.items.find(i=>i.k==='text'&&i.s==='arrived');expect(word?.k==='text'&&word.ink).toBe('role:job:line');bounded(p.items,w,p.h);}
});
test("phone interval captions pack whole range entries into shared lines",()=>{
 const c=compile('time: 0..24\nruler: none\nrow job a "Pings": R 0..0.6; R 2..2.6; R 4..4.6; R 6..6.6',[]);expect(c.errors).toEqual([]);const p=layoutStage(c.model,356),captions=p.items.filter(i=>i.k==='text'&&/^R /.test(i.s));expect(captions.map(i=>i.k==='text'?i.s:'')).toEqual(['R 0..0.6','R 2..2.6','R 4..4.6','R 6..6.6']);expect(new Set(captions.map(i=>i.k==='text'?i.y:0)).size).toBeLessThanOrEqual(2);expect(p.items.some(i=>i.k==='text'&&i.s==='·')).toBe(true);bounded(p.items,356,p.h);
});
test("plain dot rows use neutral filled circles beside open role dots",()=>{
 const c=compile('time: 0..8\nrow job root "Root": arrived 1..2 [dot] [plain]\nrow server engine "Engine": running 3..4 [dot]\nrow job store "Store": saved 5..6 [dot] [plain]',[]);expect(c.errors).toEqual([]);const dots=layoutStage(c.model,340).items.filter(i=>i.k==='box'&&i.cls?.includes('stg-time-dot'));expect(dots.length).toBe(3);for(const i of[0,2]){const dot=dots[i];if(dot.k!=='box')throw Error('missing dot');expect(dot.fill).toBe('muted');expect(dot.stroke).toBe('muted');expect(dot.bar?.role).toBeUndefined();}expect(dots[1].k==='box'&&dots[1].fill).toBe('role:server:soft');expect(dots[1].k==='box'&&dots[1].stroke).toBe('role:server:line');
});
test("a range tag is one persistent chip with no new marker path",()=>{
 const head='time: 0..8\ncells: 1\nrow job a "A": +x 0..8';const steps=[{title:'One',raw:'',line:8},{title:'Two',raw:'tag a 2..4: copy is ready',line:10},{title:'Three',raw:'tag a 2..4: copy is ready',line:12}];const c=compile(head,steps);expect(c.errors).toEqual([]);
 for(const w of[1000,356,326]){const p=layoutStage(c.model,w),tags=p.items.filter(i=>i.k==='box'&&i.bar?.label==='copy is ready'),paths=p.items.filter(i=>i.k==='path'&&i.bar?.edge);expect(tags.length).toBe(1);expect(paths.length).toBe(0);const tag=tags[0];if(tag.k!=='box')throw Error('missing tag');expect(tag.bar?.kind).toBe('chip');expect(tag.from).toBe(2);expect(tag.to).toBe(0);const cells=p.items.filter(i=>i.k==='box'&&i.cls?.includes('stg-time-cell'));expect(cells.every(i=>i.k==='box'&&i.y>=tag.y+tag.h)).toBe(true);bounded(p.items,w,p.h);}
 expect(stageLlm(c)).toContain('copy is ready');
});
test("tag checks row coverage and routes card tags and named time rows separately",()=>{
 for(const raw of['tag a 1..5: gap','tag a -1..1: outside','tag a 0..9: outside','tag a 0..1:']){const c=compile('time: 0..8\nrow job a "A": x 0..2; x 4..8',[{title:'One',raw,line:8},{title:'Two',raw:'',line:10}]);expect(c.errors.length).toBeGreaterThan(0);}
 const c=compile('job c1: First\njob c2: Second\ntime clock: 10..18\nrow job a "A": x 10..18',[{title:'One',raw:'tag c1..c2: cards note\ntag clock a 12..14: row note',line:8},{title:'Two',raw:'',line:12}]);expect(c.errors).toEqual([]);expect(c.model.steps[0].tags[0][0]).toEqual(['c1','c2']);const p=layoutStage(c.model,356);expect(p.items.some(i=>i.k==='box'&&i.bar?.label==='row note'&&i.bar?.kind==='chip')).toBe(true);
});
test("caption markers draw their lines and put words only in the existing step captions",()=>{
 const c=compile('time: 0..8\nat 2 [caption]: setup words',[{title:'One: first',raw:'at 4 [caption]: transient words',line:8},{title:'Two: second',raw:'keep at 6 [solid] [caption]: persistent words',line:10},{title:'Three: third',raw:'',line:12}]);expect(c.errors).toEqual([]);
 expect(c.model.steps.map(s=>s.caption)).toEqual(['first setup words transient words','second setup words persistent words','third setup words persistent words']);
 for(const w of [1000,340]){const p=layoutStage(c.model,w);expect(p.items.filter(i=>i.k==='path'&&i.bar?.edge).length).toBe(3);expect(p.items.some(i=>i.k==='text'&&/setup words|transient words|persistent words/.test(i.s))).toBe(false);bounded(p.items,w,p.h);}
 expect(stageLlm(c)).toContain('persistent words');
 for(const raw of ['at 2 [caption] [below]: words','keep at 2 [below] [caption]: words','at 2 [caption]'])expect(compile('time: 0..8',[{title:'One',raw,line:8},{title:'Two',raw:'',line:10}]).errors.length).toBeGreaterThan(0);
 expect(compile('time: 0..8\nat 2 [caption] [below]: words',[]).errors.length).toBeGreaterThan(0);
 expect(compile('time: 0..8\nat 2 [caption]: words',[]).errors.length).toBeGreaterThan(0);
});
test("default marker labels are exactly their authored words, including any authored number",()=>{
 const c=compile('time: 0..12\nat 2: source boundary\nat 6: 6 s, copied\nat 8: R: lane',[{title:'One',raw:'keep at 10 [below]: finish',line:8},{title:'Two',raw:'at 4',line:10}]);expect(c.errors).toEqual([]);
 for(const w of [1000,340]){const p=layoutStage(c.model,w),words=p.items.filter(i=>i.k==='text').map(i=>i.k==='text'?i.s:'');for(const text of ['source boundary','6 s, copied','R: lane','finish'])expect(words).toContain(text);expect(words.some(s=>s==='2: source boundary'||s==='8: R: lane'||s==='10: finish')).toBe(false);bounded(p.items,w,p.h);}
});
test("a bottom ruler follows the state rows, with 16 px role dots and crossing markers",()=>{
 const c=compile('time: 0..12 | seconds\nruler: below\nticks: 0, 4, 8, 12\nrow job a "First": arrives 3.9..4.1 [dot]\nrow server b "Second": applied 7.9..8.1 [dot]\nat 6 [solid]: checkpoint',[{title:'One',raw:'',line:10},{title:'Two',raw:'',line:12}]);expect(c.errors).toEqual([]);
 for(const w of [1000,340]){
  const p=layoutStage(c.model,w),axis=p.items.find(i=>i.k==='path'&&i.bar?.axis==='time-x'),dots=p.items.filter(i=>i.k==='box'&&i.cls?.includes('stg-time-dot')),mark=p.items.find(i=>i.k==='path'&&i.bar?.value===6&&i.bar?.edge);
  if(axis?.k!=='path'||mark?.k!=='path')throw Error('missing ruler or marker');const ay=axis.pts[0][1];
  expect(dots.length).toBe(2);for(const d of dots)if(d.k==='box'){expect(d.w).toBe(16);expect(d.h).toBe(16);expect(d.y+d.h).toBeLessThan(ay);expect(d.fill).toBe(`role:${d.bar!.role}:soft`);expect(d.stroke).toBe(`role:${d.bar!.role}:line`);const text=p.items.find(i=>i.k==='text'&&i.s===d.bar!.label);if(text?.k!=='text')throw Error('missing dot label');expect(text.x).toBeGreaterThan(d.x+d.w);expect(Math.abs(text.y-(d.y+d.h/2)-4)).toBeLessThan(.01);}
  expect(mark.pts[0][1]).toBeLessThan(Math.min(...dots.map(d=>d.k==='box'?d.y:Infinity)));expect(mark.pts[1][1]).toBe(ay);
  const zero=p.items.find(i=>i.k==='text'&&i.s==='0');expect(zero?.k==='text'&&zero.y>ay).toBe(true);bounded(p.items,w,p.h);
 }
 expect(compile('time: 0..8\ncells: 1 | headers\nruler: below',[]).errors.length).toBeGreaterThan(0);
});
test("row labels beside keeps the heading beside full numeric cell words",()=>{
 const row=Array.from({length:31},(_,i)=>`${i} ${i}..${i+1}`).join('; '),head=`time: 0..31 | reads\nruler: none\ncells: 1\nrow server r "reads": ${row}`;
 const above=compile(head.replace('cells: 1','cells: 1\nrow labels: above'),[]),beside=compile(head.replace('cells: 1','cells: 1\nrow labels: beside'),[]);expect(above.errors).toEqual([]);expect(beside.errors).toEqual([]);
 const a=layoutStage(above.model,340),b=layoutStage(beside.model,340);expect(a.items.some(i=>i.k==="text"&&i.s==="reads")).toBe(true);
 const heading=b.items.find(i=>i.k==="text"&&i.s==="reads"&&i.tip),cells=b.items.filter(i=>i.k==="box"&&i.cls?.includes("stg-time-cell"));expect(cells.length).toBe(31);
 if(heading?.k!=="text"||cells[0].k!=="box")throw Error("missing row");expect(heading.y).toBeGreaterThan(cells[0].y);expect(heading.x+measure(heading.s,heading.f)).toBeLessThan(cells[0].x);
 expect(cells.map(i=>i.bar?.label)).toEqual(Array.from({length:31},(_,i)=>String(i)));bounded(b.items,340,b.h);
});
for(const src of ['row labels: near','row labels: above\nrow labels: beside'])test(`refuses invalid row label placement ${src}`,()=>expect(compile('time: 0..4\n'+src,[]).errors.length).toBeGreaterThan(0));
test("ordinary cell headers align with column centres and wrap their complete labels",()=>{
 const c=compile('time: 0..7\ncells: 1 | headers\nticks: 0.5 first, 1.5 second, 2.5 third check, 3.5 fourth, 4.5 fifth, 5.5 sixth switch, 6.5 seventh\nrow job a "": +ready 0..7',[]);expect(c.errors).toEqual([]);
 for(const w of [1000,340]){
  const p=layoutStage(c.model,w);bounded(p.items,w,p.h);
  const headers=p.items.filter(i=>i.k==="box"&&i.id?.includes(":header:")),cells=p.items.filter(i=>i.k==="box"&&i.cls?.includes("stg-time-cell"));expect(headers.length).toBe(7);expect(cells.length).toBe(7);
  for(let j=0;j<7;j++){const h=headers[j],c=cells[j];if(h.k!=="box"||c.k!=="box")throw Error("missing column");expect(h.bar?.kind).toBe("band");expect(h.x+h.w/2).toBeCloseTo(c.x+c.w/2,6);expect(h.w).toBeCloseTo(c.w+Math.min(1.5,h.w*.25),6);expect(h.bar?.value).toBe(j+.5);}
  expect(p.items.filter(i=>i.k==="path"&&i.id?.includes(":tick:")).length).toBe(0);
  expect(p.items.some(i=>i.k==="path"&&i.bar?.axis==="time-x"&&i.ink==="none")).toBe(true);
  const words=p.items.filter(i=>i.k==="text").map(i=>i.k==="text"?i.s:"").join(" ");expect(words).toContain("third check");expect(words).toContain("sixth switch");
 }
});
test("cell header defaults include a short final interval",()=>{
 const c=compile('time: 0..2.5\ncells: 1 | headers\nrow job a: +x 0..2.5',[]);expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,340),headers=p.items.filter(i=>i.k==="box"&&i.id?.includes(":header:"));expect(headers.length).toBe(3);expect(headers.map(i=>i.bar?.value)).toEqual([.5,1.5,2.25]);
 if(headers[0].k!=="box"||headers[2].k!=="box")throw Error("missing header");expect(headers[2].w*2).toBeCloseTo(headers[0].w,6);
});
for(const src of ['cells: 1 | headers\nticks: 0, 1, 2','ticks: 0, 1, 2\ncells: 1 | headers','cells: 1 | headers\nticks: 0.5, 4','cells: 1 | headers | roomy'])test(`refuses invalid cell headers ${src}`,()=>expect(compile('time: 0..4\n'+src,[]).errors.length).toBeGreaterThan(0));
test("window ruler edges keep stable unbound self endpoints",()=>{
 const c=compile('time: 0..20\nwindow: 0..20 | samples\nzoom: 18..22 | detail | below\nzoom ticks: 20\nzoom row job q "write": +writing 19..21',[]);
 expect(c.errors).toEqual([]);
 const edges=layoutStage(c.model,340).items.filter(i=>i.k==="path"&&i.bar?.edge);
 expect(edges.length).toBe(3);
 for(const e of edges){expect(e.bar?.from).toBe(e.bar?.edge);expect(e.bar?.to).toBe(e.bar?.edge);}
});
test("axis interval spans carry time-bar kinds on their actual paths",()=>{
 const c=compile('time: 0..20\nrow job a: x 0..20',[{title:"One",raw:"span axis 0..10: first half\nkeep span axis 10..20 [line]: next half\nspan a 0..10 [line]: row remark",line:8},{title:"Two",raw:"",line:13}]);expect(c.errors).toEqual([]);
 for(const w of [1000,340]){
  const p=layoutStage(c.model,w),spans=p.items.filter(i=>i.k==="path"&&i.id?.includes(":span:"));
  expect(spans.length).toBe(3);expect(spans.filter(i=>i.bar?.kind==="time-bar").length).toBe(2);
  expect(spans.filter(i=>i.bar?.edge).length).toBe(2);expect(spans.filter(i=>i.bar?.kind==="time-bar").map(i=>i.bar?.label)).toEqual(["first half","next half"]);
 }
});
test("repeated axis spans share one path, id, slot and inline label across steps",()=>{
 const c=compile('time: 0..40\nrow job a: x 0..40',[{title:"One",raw:"",line:8},{title:"Two",raw:"span axis 0..20 [line]: first half\nspan axis 20..30 [line]: next part",line:10},{title:"Three",raw:"span axis 0..20 [line]: first half\nspan axis 20..30 [line]: next part",line:14}]);expect(c.errors).toEqual([]);
 for(const w of [1000,340]){
  const p=layoutStage(c.model,w),spans=p.items.filter(i=>i.k==="path"&&i.bar?.kind==="time-bar");expect(spans.length).toBe(2);expect(new Set(spans.map(i=>i.bar?.id)).size).toBe(2);
  expect(spans.every(i=>i.from===2&&i.to===0)).toBe(true);
  for(const span of spans){const label=p.items.find(i=>i.k==="text"&&i.s===span.bar?.label);if(span.k!=="path"||label?.k!=="text")throw Error("missing span");expect(label.y-span.pts[0][1]).toBe(4);expect(label.from).toBe(2);expect(label.to).toBe(0);}
 }
});
test("repeated nonconsecutive axis spans stay one item with a visibility gap",()=>{
 const c=compile('time: 0..20',[{title:"One",raw:"span axis 0..10 [line]: half",line:8},{title:"Two",raw:"",line:10},{title:"Three",raw:"span axis 0..10 [line]: half",line:12}]);expect(c.errors).toEqual([]);
 const spans=layoutStage(c.model,340).items.filter(i=>i.k==="path"&&i.bar?.kind==="time-bar");expect(spans.length).toBe(1);expect(spans[0].on).toEqual([1,3]);
});
test("hush at retires a kept marker label while its stable line stays",()=>{
 const c=compile('time ticks: 0..8\nrow job a: x 0..8',[{title:"One",raw:"keep at ticks 3: checkpoint",line:8},{title:"Two",raw:"",line:10},{title:"Three",raw:"hush at ticks 3",line:12}]);expect(c.errors).toEqual([]);expect(stageLlm(c)).toContain("Marker label at 3 hidden; its line stays.");
 for(const w of [1000,340]){
  const p=layoutStage(c.model,w),line=p.items.find(i=>i.k==="path"&&i.bar?.edge&&i.bar?.value===3),text=p.items.find(i=>i.k==="text"&&i.s==="checkpoint");expect(line?.from).toBe(1);expect(line?.to).toBeFalsy();expect(text?.from).toBe(1);expect(text?.to).toBe(2);
 }
});
test("hush at may retire a setup marker label at the first step",()=>{
 const c=compile('time: 0..8\nat 3: checkpoint',[{title:"One",raw:"hush at 3",line:8},{title:"Two",raw:"",line:10}]);expect(c.errors).toEqual([]);const p=layoutStage(c.model,340);expect(p.items.find(i=>i.k==="text"&&i.s==="checkpoint")?.on).toEqual([]);expect(p.items.some(i=>i.k==="path"&&i.bar?.value===3)).toBe(true);
});
for(const raw of ['hush 3','hush at 9','hush at 3: no','hush at 2'])test(`refuses invalid marker hush ${raw}`,()=>expect(compile('time: 0..8\nat 3: checkpoint',[{title:"One",raw,line:8},{title:"Two",raw:"",line:10}]).errors.length).toBeGreaterThan(0));
test("roomy above-arrow labels stay inside the stage (they may reach past the revealed columns) without widening row frames",()=>{
 const c=compile('time: 0..8\ncells: 1 | roomy\nrow job a "A": +a 0..4; +b 4..6 @2; +c 6..8 @3\nrow server b "B": +a 0..4; +b 4..6 @2; +c 6..8 @3',[{title:"One",raw:"",line:8},{title:"Two",raw:"arrow above -> a at 5.5 [dashed]: one saved page",line:10},{title:"Three",raw:"",line:12}]);expect(c.errors).toEqual([]);
 for(const w of [1000,340]){
  const p=layoutStage(c.model,w);bounded(p.items,w,p.h);const frame=p.items.find(i=>i.k==="box"&&i.bar?.id==="a"&&i.from===2);if(frame?.k!=="box")throw Error("missing revealed frame");
  const labels=p.items.filter(i=>i.k==="text"&&i.from===2&&i.to===2&&!i.tip);expect(labels.length).toBeGreaterThan(0);
  for(const label of labels)if(label.k==="text")expect(label.x+measureAt(label.s,label.f,w)).toBeLessThanOrEqual(w);
  const bare=layoutStage(compile('time: 0..8\ncells: 1 | roomy\nrow job a "A": +a 0..4; +b 4..6 @2; +c 6..8 @3\nrow server b "B": +a 0..4; +b 4..6 @2; +c 6..8 @3',[{title:"One",raw:"",line:8},{title:"Two",raw:"",line:10},{title:"Three",raw:"",line:12}]).model,w).items.find(i=>i.k==="box"&&i.bar?.id==="a"&&i.from===2);
  if(bare?.k!=="box")throw Error("missing bare frame");expect(frame.w).toBe(bare.w); // the words do not widen the frame
 }
});
test("phone transfer labels stay above the next row heading when placed to the left",()=>{
 const c=compile('time: 0..4\ncells: 1 | roomy\nrow job a "(a) Draft | writes": +a 0..2\nrow server b "(b) Copy | stores": +a 0..2',[{title:"One",raw:"",line:8},{title:"Two",raw:"arrow b -> a at 1.5: saved copy",line:10}]);expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,340),heading=p.items.find(i=>i.k==="text"&&i.s==="Copy"),label=p.items.find(i=>i.k==="text"&&i.s==="saved copy");
 if(heading?.k!=="text"||label?.k!=="text")throw Error("missing label or heading");expect(label.y+3).toBeLessThan(heading.y-10);
});
test("row arrow words stay inside the stage and clear of revealed frame edges",()=>{
 const c=compile('time: 0..8\ncells: 1 | roomy\nrow job a "A": +a 0..4\nrow server b "B": +a 0..6',[{title:"One",raw:"arrow b -> a at 3.5: a saved working copy",line:8},{title:"Two",raw:"",line:10}]);expect(c.errors).toEqual([]);
 for(const w of [1000,340]){const p=layoutStage(c.model,w),arrow=p.items.find(i=>i.k==="path"&&i.arrow),lane=p.items.find(i=>i.k==="box"&&i.bar?.kind==="lane"),labels=p.items.filter(i=>i.k==="text"&&i.from===1&&i.to===1&&!i.tip);if(arrow?.k!=="path"||lane?.k!=="box")throw Error("missing arrow or group");expect(labels.length).toBeGreaterThan(0);for(const label of labels)if(label.k==="text"){expect(label.x).toBeGreaterThan(arrow.pts[0][0]+6);expect(label.x+measureAt(label.s,label.f,w)).toBeLessThanOrEqual(w);}}
});
test("time transfer arrows use the source role; above arrows use their target role",()=>{
 const c=compile('time: 0..4\nrow job a: x 0..4\nrow server b: x 0..4',[{title:"One",raw:"arrow b -> a at 1.5: copy",line:8},{title:"Two",raw:"arrow above -> a at 2.5: input",line:10}]);expect(c.errors).toEqual([]);
 const arrows=layoutStage(c.model,340).items.filter(i=>i.k==="path"&&i.arrow);expect(arrows.map(i=>i.k==="path"?i.ink:"")).toEqual(["role:server:line","role:job:line"]);
});
test("bad cells keep a corner cross clear of their words and first-step border emphasis (a light lasts one step: )",()=>{
 const c=compile('time: 0..2\ncells: 1 | roomy\nrow job a: stopped 0..1 [bad]; _ 1..2 [bad]',[]);expect(c.errors).toEqual([]);
 for(const w of [1000,340]){const p=layoutStage(c.model,w),cells=p.items.filter(i=>i.k==="box"&&i.cls?.includes("stg-time-cell")),crosses=p.items.filter(i=>i.k==="path"&&i.ink==="bad:line");expect(cells.length).toBe(2);expect(crosses.length).toBe(4);expect(cells.every(i=>i.k==="box"&&i.thick&&!i.cls?.includes("stg-hot")&&JSON.stringify(i.hot)==="[1]")).toBe(true);for(const cross of crosses)if(cross.k==="path"){expect(Math.abs(cross.pts[1][0]-cross.pts[0][0])).toBeLessThanOrEqual(30);expect(Math.abs(cross.pts[1][1]-cross.pts[0][1])).toBeLessThanOrEqual(30);}bounded(p.items,w,p.h);}
});
test("active cells keep the card palette and regular coloured words",()=>{
 const c=compile('time: 0..2\ncells: 1 | roomy\nrow job a "Draft": +ready 0..2',[]);expect(c.errors).toEqual([]);for(const w of[1000,340]){const p=layoutStage(c.model,w),cells=p.items.filter(i=>i.k==='box'&&i.cls?.includes('stg-time-cell')),words=p.items.filter(i=>i.k==='text'&&i.s==='ready');expect(cells.length).toBe(2);expect(cells.every(i=>i.k==='box'&&i.fill==='role:job:soft')).toBe(true);expect(words.every(i=>i.k==='text'&&i.f==='sub'&&i.ink==='role:job:ink')).toBe(true);}
});
test("dot rows use their own light role fill and coloured outline above or below the ruler",()=>{
 for(const ruler of ['', 'ruler: below\n']){const c=compile('time: 0..8\n'+ruler+'row job a "First": arrived 2..3 [dot]\nrow server b "Second": saved 5..6 [dot]',[]);expect(c.errors).toEqual([]);const dots=layoutStage(c.model,340).items.filter(i=>i.k==='box'&&i.cls?.includes('stg-time-dot'));expect(dots.length).toBe(2);for(const [i,role]of['job','server'].entries()){const dot=dots[i];if(dot.k!=='box')throw Error('missing dot');expect(dot.fill).toBe('role:'+role+':soft');expect(dot.stroke).toBe('role:'+role+':line');expect(dot.bar?.role).toBe(role);}}
});
test("phone row cards keep second lines and multiplied cell words above the font floor",()=>{
 const c=compile('time: 0..4\ncells: 1 | roomy\nrow job a "(a) Draft | the author": +×1 0..2; +×2 2..4\nrow server b "| Archive | saved copies for later": +×1 0..1',[]);expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,340);bounded(p.items,340,p.h);for(const s of ['the author','saved copies for later','×1','×2'])expect(p.items.some(i=>i.k==="text"&&i.s===s)).toBe(true);
 for(const i of p.items)if(i.k==="text")expect(FONT[i.f].size).toBeGreaterThanOrEqual(11);
 const archive=p.items.find(i=>i.k==="text"&&i.s==="Archive");expect(archive).toBeTruthy();expect(p.items.filter(i=>i.k==="badge").length).toBe(1);
 expect(p.items.filter(i=>i.k==="box"&&i.fill==="role:server:soft"&&i.bar?.ignore===1).length).toBe(1);
 const frame=p.items.find(i=>i.k==="box"&&i.bar?.id==="b"),subtitle=p.items.find(i=>i.k==="text"&&i.s==="saved copies for later");if(frame?.k!=="box"||subtitle?.k!=="text")throw Error("missing subtitle or row");expect(subtitle.x+measure(subtitle.s,subtitle.f)).toBeLessThanOrEqual(frame.x+frame.w);
 expect(stageLlm(c)).toContain("Archive | saved copies for later");expect(stageLlm(c)).not.toContain("| Archive");
});
test("boxed row labels need visible words",()=>expect(compile('time: 0..4\nrow job a "|": x 0..4',[]).errors.length).toBeGreaterThan(0));
test("inset labels retain their words and visibility without adding tick lines or edges",()=>{
 const c=compile('time: 0..40\nwindow: 0..40 | samples\nzoom: 38..42 | detail | below @1..2\nzoom ticks: 40 check\nzoom labels: 38 early, 39 next, 41 later, 42 end\nzoom row job q "write": +writing 39..41',[{title:"One",raw:"",line:12},{title:"Two",raw:"",line:14},{title:"Three",raw:"",line:16}]);expect(c.errors).toEqual([]);
 expect(stageLlm(c)).toContain("Zoom ticks: 40 (check).");expect(stageLlm(c)).toContain("Zoom labels: 38 (early), 39 (next), 41 (later), 42 (end).");
 for(const width of [1000,340]){
  const p=layoutStage(c.model,width);bounded(p.items,width,p.h);
  const lines=p.items.filter(i=>i.k==="path"&&i.id?.startsWith("time-inset:tick:"));expect(lines.length).toBe(1);expect(lines[0].bar?.edge).toBeTruthy();expect(lines[0].bar?.value).toBe(40);
  const labels=p.items.filter(i=>i.k==="text"&&i.id?.startsWith("time-inset:label:"));expect(labels.length).toBe(4);
  expect(labels.map(i=>i.k==="text"?i.s:"")).toEqual(["early","next","later","end"]);
  expect(labels.every(i=>i.from===1&&i.to===2&&!i.bar?.edge)).toBe(true);
  expect(p.items.filter(i=>i.bar?.edge).length).toBe(3);
  expect(p.items.filter(i=>i.k==="text"&&["early","next","later","end"].includes(i.s)).length).toBe(4);
 }
});
for(const src of ["zoom labels: 0 start","zoom: 2..4\nzoom labels:","zoom: 2..4\nzoom labels: 2","zoom: 2..4\nzoom labels: 2 start, 2 end","zoom: 2..4\nzoom labels: 4 end, 2 start","zoom: 2..4\nzoom labels: 5 outside","zoom: 2..4\nzoom labels: 2 start\nzoom labels: 4 end"])
 test(`refuses invalid inset labels ${src}`,()=>expect(compile("time: 0..60\n"+src,[]).errors.length).toBeGreaterThan(0));
test("window brackets and inset captions reserve a compact, stable stack",()=>{
 const c=compile('time: 0..40 | minutes\nwindow: 0..40 | observation\nzoom: 38..42 | detail | below\nzoom ticks: 40\nzoom row job q "three entries": +write 39..41',[{title:"Watch",raw:"",line:12},{title:"Check",raw:"keep span axis 0..40 [line]: full range\nkeep span axis 30..40 [line]: last ten",line:14}]);
 expect(c.errors).toEqual([]);
 for(const w of [1000,340]){
  const p=layoutStage(c.model,w);bounded(p.items,w,p.h);
  const inset=p.items.find(i=>i.bar?.axis==="time-inset-x"),main=p.items.find(i=>i.bar?.axis==="time-x");
  if(inset?.k!=="path"||main?.k!=="path")throw new Error("missing rulers");
  expect(inset.pts[0][1]-main.pts[0][1]).toBeLessThan(150);
 }
});
test("a bounded inset hides its rulers, rows and highlight together without moving the overview",()=>{
 const h='time: 0..40\nwindow: 0..40 | samples\nzoom: 38..42 | detail | below @1..2\nzoom ticks: 40\nzoom row job q "write": +writing 39..41';
 const ss=Array.from({length:4},(_,i)=>({title:String(i+1),raw:"",line:10+i}));
 const c=compile(h,ss);expect(c.errors).toEqual([]);
 expect(stageLlm(c)).toContain("Inset shown.");expect(stageLlm(c)).toContain("Inset hidden.");
 const p=layoutStage(c.model,340),inset=p.items.filter(i=>i.bar?.axis==="time-inset-x"||i.bar?.track==="time-inset-x"||i.k==="box"&&i.id==="time-zoom-window");
 expect(inset.length).toBeGreaterThan(2);expect(inset.every(i=>i.from===1&&i.to===2)).toBe(true);
 expect(p.h).toBe(layoutStage(compile(h.replace(" @1..2",""),ss).model,340).h);
 for(const suffix of ["@0","@3..2","@1..5","@no"])expect(compile(h.replace("@1..2",suffix),ss).errors.length).toBeGreaterThan(0);
});
test("plot names sit beside their data points; a matching marker does not repeat in a footer",()=>{
 const c=compile('time: 0..20\nplot: 0..100 | percent\npoint job a at 0: 0 | Start\npoint job b at 10: 50 | Halfway\npoint job c at 20: 100 | Finish',[{title:"Midway",raw:"at 10: halfway",line:10},{title:"Done",raw:"",line:12}]);expect(c.errors).toEqual([]);
 for(const w of [1000,340]){
  const p=layoutStage(c.model,w);bounded(p.items,w,p.h);
  for(const [id,name]of [["a","Start"],["b","Halfway"],["c","Finish"]]){
   const dot=p.items.find(i=>i.k==="box"&&i.id===`time:point:${id}`),label=p.items.find(i=>i.k==="text"&&i.s===name);
   if(dot?.k!=="box"||label?.k!=="text")throw new Error("missing labelled dot");
   expect(Math.abs(label.y-dot.y)).toBeLessThan(50);
  }
  expect(p.items.some(i=>i.k==="text"&&(i.s==="10: halfway"||/ at \d+$/.test(i.s)))).toBe(false);
 }
});
test("row remarks in distinct steps share a slot against the bar",()=>{
 const c=compile('time: 0..10\nrow job a "A": +work 0..10',[{title:"First",raw:"span a 0..4: early",line:10},{title:"Last",raw:"span a 4..10: late",line:12}]);expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,1000),paths=p.items.filter(i=>i.k==="path"&&i.id?.includes(":span:"));
 if(paths[0]?.k!=="path"||paths[1]?.k!=="path")throw new Error("missing remarks");
 expect(paths[0].pts[0][1]).toBe(paths[1].pts[0][1]);
 const bar=p.items.find(i=>i.k==="box"&&i.cls?.includes("stg-seg"));if(bar?.k!=="box")throw new Error("missing bar");
 expect(paths[0].pts[0][1]-bar.y-bar.h).toBeLessThan(6);
});
test("roomy grids have no painted frame and arrows cannot change row top, bottom or revealed width",()=>{
 const c=compile('time: 0..12\ncells: 1 | roomy\nrow job a "(a) Draft": +a 0..4; +b 4..8 @2; +c 8..12 @3\nrow server b "(b) Copy": +a 0..4; +b 4..8 @2; +c 8..12 @3',[{title:"Start",raw:"",line:10},{title:"Input",raw:"arrow above -> a at 7.5 [dashed]: new saved page",line:12},{title:"Copy",raw:"arrow b -> a at 8.5: read one saved page",line:14}]);expect(c.errors).toEqual([]);
 for(const w of [1000,340]){
  const p=layoutStage(c.model,w);bounded(p.items,w,p.h);
  for(const id of ["a","b","lane"]){
   const frames=p.items.filter(i=>i.k==="box"&&(id==="lane"?i.bar?.kind==="lane":i.bar?.id===id));
   expect(frames.length).toBe(3);
   expect(new Set(frames.map(i=>i.k==="box"?[i.x,i.y,i.h].join(":"):"")).size).toBe(1);
   expect(frames.every(i=>i.k==="box"&&i.fill==="none"&&i.stroke==="none")).toBe(true);
   expect(frames[0].from).toBe(1);expect(frames[0].to).toBe(1);
  }
 }
});
test("roomy grid tick labels and painted ruler reveal with their first cells",()=>{
 const c=compile('time: 0..4\ncells: 1 | roomy\nticks: 0.5 first, 1.5 next, 3.5 last\nrow job a "A": +a 0..1; +b 1..2 @2; +c 2..4 @3',[{title:"One",raw:"",line:10},{title:"Two",raw:"",line:12},{title:"Three",raw:"",line:14}]);expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,340),labels=["first","next","last"].map(s=>p.items.find(i=>i.k==="text"&&i.s===s));
 expect(labels.map(i=>i?.from)).toEqual([1,2,3]);
 const axis=p.items.find(i=>i.bar?.axis==="time-x");expect(axis?.k==="path"&&axis.ink==="none").toBe(true);
 const paint=p.items.filter(i=>i.k==="path"&&i.id?.startsWith("time-x:paint:"));
 expect(paint.length).toBe(3);
 const widths=paint.map(i=>i.k==="path"?i.pts[1][0]-i.pts[0][0]:0);
 expect(widths[0]).toBeLessThan(widths[1]);expect(widths[1]).toBeLessThan(widths[2]);
});
function bounded(items: Item[], w: number, h: number) {
  for (const it of items) {
    const pts = it.k === "path" ? it.pts : it.k === "text" ? (() => { const tw = measure(it.s, it.f), left = it.x - (it.anchor === "middle" ? tw / 2 : it.anchor === "end" ? tw : 0); expect(FONT[it.f].size).toBeGreaterThanOrEqual(11); return it.rotate===90?[[it.x-FONT[it.f].size,it.y-tw/2],[it.x,it.y+tw/2]]:[[left, it.y - FONT[it.f].size], [left + tw, it.y]]; })() : it.k === "box" ? [[it.x, it.y], [it.x + it.w, it.y + it.h]] : [[it.x, it.y]];
    for (const [x, y] of pts) { expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true); expect(x).toBeGreaterThanOrEqual(-0.01); expect(x).toBeLessThanOrEqual(w + 0.01); expect(y).toBeGreaterThanOrEqual(-0.01); expect(y).toBeLessThanOrEqual(h + 0.01); }
  }
}
test("keeps existing time, row, at and span grammar and facts", () => {
  const c = compile(); expect(c.errors).toEqual([]);
  const llm = stageLlm(c); expect(llm).toContain("build: queued 0 to 4, running 4 to 31, done 31 to 60");
  for (const text of ["Ticks: 0, 20, 40, 60", "Marker 31: handoff", "Zoom 24 to 36", "Values from 0 to 100 progress", "halfway: 50 at 30", "At 52 seconds: pass", "build, 4 to 31: 27 s"]) expect(llm).toContain(text);
});
for (const w of [1000, 340]) test(`time layout stays inside ${w} with exact axes and enlarged inset`, () => {
  const plan = layoutStage(compile().model, w); bounded(plan.items, w, plan.h);
  const axes = plan.items.filter((i) => i.k === "path" && i.bar?.min !== undefined);
  expect(axes.length).toBe(4);
  for (const it of plan.items) {
    if (it.bar?.value === undefined) continue;
    const ax = axes.find((a) => a.bar?.axis === it.bar!.track)!; expect(ax).toBeTruthy();
    if (ax.k !== "path") continue;
    const ratio = (+it.bar.value - +ax.bar!.min) / (+ax.bar!.max - +ax.bar!.min), [a, b] = ax.pts;
    const expected = [a[0] + ratio * (b[0] - a[0]), a[1] + ratio * (b[1] - a[1])];
    const actual = it.k === "path" ? it.pts[0] : it.k === "box" ? [it.x + it.w / 2, it.y + it.h / 2] : [];
    if (a[0] !== b[0]) expect(Math.abs(actual[0] - expected[0])).toBeLessThan(0.001); else expect(Math.abs(actual[1] - expected[1])).toBeLessThan(0.001);
  }
  const full = axes.find((a) => a.bar?.axis === "time-x")!, inset = axes.find((a) => a.bar?.axis === "time-inset-x")!;
  if (full.k === "path" && inset.k === "path") expect((inset.pts[1][0] - inset.pts[0][0]) / 12).toBeGreaterThan((full.pts[1][0] - full.pts[0][0]) / 60);
});
const refusals: [string, string][] = [
  ["time: 60..0", "increasing"], ["time: 0..1\n  bad", "one line"],
  ["row job 3bad: a 0..3", "a time row"], ["row job r \"x\":", "at least one"],
  ["row job r \"x\": state 0..61", "runs off"], ["row job r \"x\": + 0..4", "needs a name"],
  ["row job r \"x\": bad", "a state"], ["row job r \"x\": a 0..4; b 3..7", "without overlap"],
  ["row job r \"x\": a 0..4\nrow job r \"x\": a 4..7", "declared twice"],
  ["row missing r \"x\": a 0..4", "not a role"], ["row job r \"x\": a 0..4\n  bad", "one line"],
  ["ticks:", "at least one"], ["ticks: 3, 3", "without repeats"], ["ticks: 61", "within"], ["ticks: no", "increase"], ["ticks: 0\nticks: 1", "once"],
  ["zoom: 0..60", "smaller"], ["zoom: -9..-1", "overlapping"], ["zoom: 3..3", "increasing"], ["zoom: 2..4\nzoom: 3..5", "once"],
  ["plot: 3..1", "increasing"], ["plot: 0..3\nplot: 1..4", "once"],
  ["at 61: no", "marker"], ["at 3:", "marker"],
  ["point job p at 0: 1", "declare plot"], ["point job: 1", "a point"],
  ["plot: 0..100\npoint job p at 61: 1", "within"], ["plot: 0..100\npoint job p at 1: 101", "within"],
  ["plot: 0..100\npoint job p at 1: 1\npoint job p at 2: 2", "declared twice"],
  ["plot: 0..100\npoint job p at 2: 1\npoint job q at 1: 2", "increase in time"],
  ["plot: 0..100\npoint missing p at 2: 1", "not a role"],
];
for (const [src, match] of refusals) test(`refuses ${src.replaceAll("\n", " / ")}`, () => { const c = compile(src.startsWith("time:") ? src : "time: 0..60\n" + src, []); expect(c.errors.some((e) => e.msg.includes(match) && e.line > 0)).toBe(true); });
for (const [raw, match] of [["at 61: no", "point on the axis"], ["span missing 1..3: no", "not a row"], ["span j1 0..61: no", "range on the axis"], ["at 1: no\n  bad", "one line"]]) test(`refuses operation ${raw}`, () => expect(compile(head, [{ title: "one", raw, line: 20 }, steps[1]]).errors.some((e) => e.msg.includes(match))).toBe(true));
test("retains existing row limit", () => expect(compile("time: 0..60\n" + Array.from({ length: 17 }, (_, i) => `row job r${i}: work 0..60`).join("\n"), []).errors.some((e) => e.msg.includes("16 rows"))).toBe(true));
test("tiny finite axes do not create nonfinite positions", () => { const c = compile("time: 0..0.000000000001\nrow job r: work 0..0.000000000001", []); expect(c.errors).toEqual([]); const p = layoutStage(c.model, 340); bounded(p.items, 340, p.h); expect(tickStep(1e-12)).toBeGreaterThan(0); });
test("hostile number and huge source stop on document budget", () => {
  beginDocument(newBudget(100)); expect(() => compile("time: 0..60\nat 3: " + "word ".repeat(500), [])).toThrow(BudgetError);
  beginDocument(); expect(compile("time: 0.." + "9".repeat(1000), []).errors.length).toBeGreaterThan(0);
});
test("time work doubles linearly", () => {
  const work = (n: number) => { const b = beginDocument(newBudget()), c = compile("time: 0..60\n" + Array.from({ length: n }, (_, i) => `at 30: sample ${i}`).join("\n"), []); layoutStage(c.model, 1000); stageLlm(c); return 2_000_000 - b.left().work; };
  const a = work(20), b = work(40); expect(b).toBeGreaterThan(a * 1.7); expect(b).toBeLessThan(a * 2.2);
});
// one-step marker words are headings by their lines, so two can share a row; they never overlap
test("multiple marker labels reserve distinct places and stable geometry", () => { const p = layoutStage(compile().model, 340); const labels = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && ["ready", "pass"].includes(i.s)); expect(labels.length).toBe(3); for (const a of labels) for (const b of labels) if (a !== b && a.y === b.y) expect(a.x + measure(a.s, "sub") <= b.x || b.x + measure(b.s, "sub") <= a.x).toBe(true); });
test("per-tick state cells count independently and keep true positions", () => {
 const c = compile("time: 0..12 | hours\ncells: 1\nrow job batch: queued 0..3; +working 3..9; done 9..12", []); expect(c.errors).toEqual([]);
 expect(stageLlm(c)).toContain("State cells every 1 hours");
 for (const w of [1000, 340]) { const p = layoutStage(c.model, w), cells = p.items.filter((i) => i.k === "box" && i.cls?.includes("stg-time-cell")); expect(cells.length).toBe(12); expect(cells.filter((i) => i.bar?.label === "working").length).toBe(6); bounded(p.items, w, p.h); }
});
for (const value of ["0", "-1", "13", "no", "1\ncells: 1"]) test(`refuses cell interval ${value}`, () => expect(compile(`time: 0..12\ncells: ${value}`, []).errors.some((e) => e.msg.includes("positive interval"))).toBe(true));
test("tiny source cannot request billions of row cells", () => { beginDocument(newBudget(1000)); expect(() => compile("time: 0..12\ncells: 0.000000001\nrow job r: work 0..12", [])).toThrow(BudgetError); });
test("cell reveal and replacement keep geometry while changing words", () => {
 const ss = [{ title: "Start", raw: "", line: 10 }, { title: "Wait", raw: "keep at 1 [bad]: boundary\nkeep span r 0..2: held", line: 12 }, { title: "Done", raw: "", line: 15 }];
 const c = compile("time: 0..4\ncells: 1\nrow job r: wait 0..1 @1; +a 0..1 @2 [lit]; _ 1..2 @2 [dashed]; b 2..3 @2 [bad]; ready 3..4 @3 [good]", ss);
 expect(c.errors).toEqual([]);
 const p = layoutStage(c.model, 340);
 bounded(p.items, 340, p.h);
 const cells = p.items.filter((i) => i.k === "box" && i.cls?.includes("stg-time-cell"));
 const wait = cells.find((i) => i.bar?.label === "wait")!, a = cells.find((i) => i.bar?.label === "a")!;
 expect(wait.from).toBe(1); expect(wait.to).toBe(1); expect(a.from).toBe(2); expect(a.to).toBe(0);
 if (wait.k === "box" && a.k === "box") expect([wait.x,wait.y,wait.w,wait.h]).toEqual([a.x,a.y,a.w,a.h]);
 expect(cells.some((i) => i.k === "box" && i.dash)).toBe(true);
 expect(cells.some((i) => i.k === "box" && i.thick)).toBe(true);
 expect(p.items.some((i) => i.k === "path" && i.ink === "bad:line" && i.from === 2)).toBe(true);
 const marker = p.items.find((i) => i.k === "path" && i.id?.includes(":at:2:1:"));
 expect(marker?.to).toBe(0); expect(marker?.from).toBe(2);
 const bracket = p.items.find((i) => i.k === "path" && i.id?.includes(":span:2:r:"));
 expect(bracket?.to).toBe(0);
 expect(stageLlm(c)).toContain("steps 2 onward");
});
for (const suffix of ["@0", "@3", "@2..1", "@1..3", "[unknown]"]) test(`refuses invalid state suffix ${suffix}`, () => expect(compile(`time: 0..4\nrow job r: word 0..1 ${suffix}`).errors.length).toBeGreaterThan(0));
test("same-range override must begin later", () => expect(compile("time: 0..4\nrow job r: a 0..1 @2; b 0..1 @1").errors.some((e) => e.msg.includes("replacement"))).toBe(true));
test("wide cells preserve one labelled span, and phone grids keep one ruler", () => {
 const c = compile("time: 0..34\ncells: 1\nrow job r: a 0..5; held 5..22 [wide]; b 22..34", []);
 for (const width of [1000,340]) { const p=layoutStage(c.model,width); bounded(p.items,width,p.h); if (width === 1000) expect(p.items.filter((i) => i.k === "box" && i.cls?.includes("stg-seg")).length).toBe(1); else expect(p.items.filter((i) => i.bar?.min !== undefined).length).toBe(1); }
});
for (const raw of ["keep at 1 [wrong]: no", "keep span j1 0..2 [wrong]: no"]) test(`refuses marker paint ${raw}`, () => expect(compile(head,[{title:"one",raw,line:20},steps[1]]).errors.some((e) => e.msg.includes("marker colour"))).toBe(true));
test("time-specific operations coexist with a phase track", () => {
 const c=compile("track: job prepare, finish\ntime: 0..4\nrow job r: work 0..4",[{title:"Prepare",raw:"at prepare\nkeep at 2: midway",line:10},{title:"Finish",raw:"at finish\nkeep span r 0..4: all",line:13}]);
 expect(c.errors).toEqual([]);
});
test("phase separators remain decorative beside true time edges",()=>{
 const c=compile("track: job prepare, copy, check, finish\ntime: 0..4\nrow job r: work 0..4",[{title:"Start",raw:"at prepare\nkeep at 2: boundary",line:10},{title:"Done",raw:"at finish",line:14}]);
 const p=layoutStage(c.model,1000),separators=p.items.filter(i=>i.k==="tri");
 expect(separators.length).toBe(3);expect(separators.every(i=>!i.bar?.edge)).toBe(true);
 expect(p.items.filter(i=>i.bar?.edge).length).toBe(1);
});
test("whole-block reveal reserves its place and clamps all child visibility",()=>{
 const ss=[{title:"Start",raw:"keep at clock 2: boundary",line:10},{title:"Wait",raw:"",line:12},{title:"Show",raw:"show clock",line:14}];
 const text='time clock: 0..6 | seconds\nrow job r "": +a 0..3 @1..2; +b 0..3 @3; _ 3..6 [dashed]';
 const c=compile(text,ss);expect(c.errors).toEqual([]);const p=layoutStage(c.model,340),ordinary=layoutStage(compile(text,ss.map(s=>({...s,raw:s.raw.replace("show clock","")}))).model,340);
 expect(p.h).toBe(ordinary.h);expect(stageLlm(c)).toContain("from step 3");
 expect(p.items.find(i=>i.bar?.axis==="time-axis-clock-x")?.from).toBe(3);
 for(const i of p.items.filter(i=>i.bar?.track==="time-axis-clock-x"))expect(i.from).toBeGreaterThanOrEqual(3);
 const expired=p.items.find(i=>i.bar?.label==="a");expect(expired?.from).toBe(3);expect(expired?.to).toBe(2);
 expect(p.items.some(i=>i.k==="text"&&i.s==="r")).toBe(false);
});
test("show reaches one named clock and declines other block ids",()=>{
 const c=compile('time one: 0..4\nrow job a: x 0..4\ntime two: 4..8\nrow server b: y 4..8',[{title:"Start",raw:"",line:10},{title:"Show",raw:"show two",line:14}]);expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,340);expect(p.items.find(i=>i.bar?.axis==="time-axis-one-x")?.from).toBe(1);expect(p.items.find(i=>i.bar?.axis==="time-axis-two-x")?.from).toBe(2);
 expect(compile('time one: 0..4',[{title:"Start",raw:"show missing",line:10},{title:"Done",raw:"",line:14}]).errors.length).toBeGreaterThan(0);
});
test("phone dot rows put a fitting word beside the true-position dot in forty pixels",()=>{
 const c=compile('time: 0..10 | seconds\nruler: none\nrow job draft "Draft": +draft 2.9..3.1 @1..1 [dot]; +stored 2.9..3.1 @2 [dot]\nrow server copy "Copy": +copy 4.9..5.1 @1..1 [dot]; +saved 4.9..5.1 @2 [dot]',[{title:"Arrive",raw:"",line:10},{title:"Save",raw:"",line:12}]);expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,340);bounded(p.items,340,p.h);
 const rows=p.items.filter(i=>i.k==="box"&&i.bar?.kind==="worksheet-row");expect(rows.length).toBe(2);for(const row of rows)if(row.k==="box")expect(row.h).toBe(36);
 for(const dot of p.items.filter(i=>i.k==="box"&&i.cls?.includes("stg-time-dot"))){if(dot.k!=="box")throw new Error("missing dot");const word=p.items.find(i=>i.k==="text"&&i.s===dot.bar?.label);if(word?.k!=="text")throw new Error("missing inline word");expect(word.x).toBeGreaterThan(dot.x+dot.w);expect(Math.abs(word.y-(dot.y+dot.h/2))).toBeLessThan(6);}
 if(rows[0].k==="box"&&rows[1].k==="box")expect(rows[1].y-rows[0].y).toBe(40);
});
test("desktop dots keep fitting words attached and paired marker headings share a line",()=>{
 const c=compile('time: 0..20 | seconds\nrow job r "Draft": +ready 2.9..3.1 [dot]\nat 5: first\nat 15: last',[]);expect(c.errors).toEqual([]);
 for(const w of [1000,340]){const p=layoutStage(c.model,w);bounded(p.items,w,p.h);
 const dot=p.items.find(i=>i.k==="box"&&i.cls?.includes("stg-time-dot")),word=p.items.find(i=>i.k==="text"&&i.s==="ready"),labels=p.items.filter(i=>i.k==="text"&&["first","last"].includes(i.s));
 if(dot?.k!=="box"||word?.k!=="text")throw new Error("missing dot word");expect(word.x).toBeGreaterThan(dot.x+dot.w);expect(Math.abs(word.y-dot.y-dot.h/2)).toBeLessThan(6);
 expect(labels.length).toBe(2);expect(labels[0].k==="text"&&labels[1].k==="text"&&labels[0].y===labels[1].y).toBe(true);
 if(w===1000){const row=p.items.find(i=>i.k==="box"&&i.bar?.kind==="worksheet-row"),heading=p.items.find(i=>i.k==="text"&&i.s==="Draft");if(row?.k!=="box"||heading?.k!=="text")throw new Error("missing row heading");expect(heading.x).toBeGreaterThan(row.x);}
 }
});
test("ruler-free bars keep true numeric geometry and words after each bar",()=>{
 const c=compile('time: 0..24 | seconds\nruler: none\nrow job first "First": _ 0..6 [dashed] [after]\nrow server next "Next": +ready 0..12 [after]\nrow job last "Last": +finish 0..24 [after]',[]);expect(c.errors).toEqual([]);
 for(const w of [1000,340]){const p=layoutStage(c.model,w);bounded(p.items,w,p.h);
 const axis=p.items.find(i=>i.bar?.axis==="time-x");expect(axis?.k==="path"&&axis.ink).toBe("none");
 expect(p.items.some(i=>i.k==="path"&&i.id?.includes(":tick:"))).toBe(false);expect(p.items.some(i=>i.k==="text"&&i.s==="seconds")).toBe(true);
 const b=p.items.find(i=>i.k==="box"&&i.bar?.label==="finish"),label=p.items.find(i=>i.k==="text"&&i.s==="finish");
 if(b?.k!=="box"||label?.k!=="text")throw new Error("missing bar or label");expect(label.x).toBeGreaterThan(b.x+b.w);expect(b.h).toBe(14);
 const first=p.items.find(i=>i.k==="box"&&i.id?.includes(":seg:first:"));expect(first?.k==="box"&&first.dash).toBe(true);
 }
});
test("labels above remove the desktop gutter and keep compact phone rows with subtitles",()=>{
 const source='time: 0..32\nrow labels: above\ncells: 1 | roomy\n'+Array.from({length:4},(_,i)=>`row job r${i} "(a) Row ${i} | detail": +x 0..32`).join("\n");
 const c=compile(source,[]);expect(c.errors).toEqual([]);
 for(const w of [1000,340]){const p=layoutStage(c.model,w),axis=p.items.find(i=>i.k==="path"&&i.bar?.axis==="time-x");bounded(p.items,w,p.h);
 if(axis?.k!=="path")throw new Error("missing axis");expect(axis.pts[0][0]).toBeLessThan(30);
 const cells=p.items.filter(i=>i.k==="box"&&i.cls?.includes("stg-time-cell"));expect(cells.length).toBe(128);
 if(w===340){expect(cells.every(i=>i.k==="box"&&i.h===48)).toBe(true);expect(p.items.filter(i=>i.k==="text"&&i.s==="detail").length).toBe(4);expect(p.h).toBeLessThan(450);}
 }
});
test("below-marker labels share a line when they fit and reserve stable space",()=>{
 const c=compile('time ticks: 40..48\nruler: none\ncells: 1\nrow job r "": +_ 40..48 [numbered]',[{title:"Mark",raw:"keep at ticks 41 [below]: left\nkeep at ticks 47 [bad] [below]: right",line:10},{title:"Done",raw:"",line:14}]);expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,1000);bounded(p.items,1000,p.h);
 const labels=p.items.filter(i=>i.k==="text"&&["left","right"].includes(i.s));expect(labels.length).toBe(2);
 expect(labels[0].k==="text"&&labels[1].k==="text"&&labels[0].y===labels[1].y).toBe(true);
 const row=p.items.find(i=>i.k==="box"&&i.bar?.kind==="worksheet-row");
 if(row?.k!=="box")throw new Error("missing row");for(const l of labels)if(l.k==="text")expect(l.y-11).toBeGreaterThanOrEqual(row.y+row.h);
 const edge=p.items.find(i=>i.k==="path"&&i.bar?.edge);expect(edge?.bar?.from).toBe(edge?.bar?.to);
});
for(const src of ["time: 0..4 | from 0","time: 0..4 | from 3","time: 0..4 | from 1.5","time: 0..4 | from 1 | from 2","time: 0..4\nruler: hidden","time: 0..4\nruler: none\nruler: none","time: 0..4\nlabels: inside","time: 0..4\nrow labels: above\nrow labels: above","time: 0..4\ncells: 1\nrow job r: word 0..4 [after]","time: 0..4\nrow job r: word 0..4 [after]\ncells: 1","time: 0..4\nrow job r: word 0..4 [dot] [after]","time: 0..4\nrow job r \"broken: word 0..4"])test(`refuses invalid compact timeline option ${src}`,()=>expect(compile(src).errors.length).toBeGreaterThan(0));
test("named tick labels retain numeric positions", () => {
 const c=compile("time: 0..4\nticks: 0 start, 2 middle, 4 end\nrow job r: a 0..4",[]);
 expect(c.errors).toEqual([]); const p=layoutStage(c.model,1000);
 for(const label of ["start","middle","end"]) expect(p.items.some((i)=>i.k==="text" && i.s===label)).toBe(true);
 expect(p.items.some((i)=>i.bar?.value===2)).toBe(true);
});
test("idle words remain visible, empty ranges stay silent, and dot states are small",()=>{
 const c=compile('time: 0..1000\nrow job r: _ 0..1; paused 1..2 [dashed]; _ 2..4 [dot]',[]);
 const p=layoutStage(c.model,1000);bounded(p.items,1000,p.h);
 expect(p.items.some(i=>i.k==="text"&&i.s.includes("empty"))).toBe(false);
 const dot=p.items.find(i=>i.k==="box"&&i.cls?.includes("stg-time-dot"));expect(dot?.k==="box"&&dot.w===6&&dot.h===6).toBe(true);
 const roomy=layoutStage(compile('time: 0..4\ncells: 1 | roomy\nrow job r: paused 0..4 [dashed]',[]).model,340);
 expect(roomy.items.some(i=>i.k==="text"&&i.s==="paused")).toBe(true);
});
test("direct ruler dots, window, above markers and line brackets are measured",()=>{
 const c=compile('time: 0..40 | minutes\nwindow: 0..40 | observation\ndot 5\ndot 15 [good]: saved',[{title:"Watch",raw:"dot 30: newest\nkeep span axis 0..20 [line] [warn]: first half",line:10},{title:"Run",raw:"keep at 40 [bad]: done",line:13}]);
 expect(c.errors).toEqual([]);
 for(const width of [1000,340]){
 const p=layoutStage(c.model,width);bounded(p.items,width,p.h);
 expect(p.items.filter(i=>i.k==="box"&&i.cls?.includes("stg-ruler-dot")).length).toBe(3);
 const marker=p.items.find(i=>i.k==="path"&&i.id?.includes(":at:2:40:"))!;
 expect(marker.bar?.edge).toBeTruthy();
 const bracket=p.items.find(i=>i.k==="path"&&i.id?.includes(":span:1:axis:"))!;
 expect(bracket.k==="path"&&bracket.pts.length===2).toBe(true);expect(bracket.bar?.from).toBe("axis");
 }
 expect(stageLlm(c)).toContain("Window 0 to 40: observation");expect(stageLlm(c)).toContain("Dot at 30");
});
test("cell arrows carry a true head and only show in their step",()=>{
 const c=compile('time: 0..4\ncells: 1 | roomy\nrow job a "(a) Draft | writes": a 0..4\nrow server b "(b) Copy | stores": b 0..4',[{title:"Copy",raw:"arrow b -> a at 1.5: copy",line:10},{title:"Input",raw:"arrow above -> a at 2.5: input",line:12}]);
 expect(c.errors).toEqual([]);
 for(const width of [1000,340]){
 const p=layoutStage(c.model,width);bounded(p.items,width,p.h);
 const arrows=p.items.filter(i=>i.k==="path"&&i.arrow);
 expect(arrows.length).toBe(2);
 expect(arrows.every(i=>i.from===i.to&&i.k==="path"&&i.curve==="round")).toBe(true);
 expect(p.items.filter(i=>i.k==="box"&&i.bar?.kind==="worksheet-row").length).toBeGreaterThanOrEqual(2);
 }
 expect(stageLlm(c)).toContain("copy: b to a at 1.5");
});
for(const raw of ["arrow a -> missing at 1: no","arrow a -> a at 1: no","arrow above -> j1 at 61: no","arrow above to j1 at 1: no"])test(`refuses cell arrow ${raw}`,()=>expect(compile(head,[{title:"one",raw,line:20},steps[1]]).errors.some(e=>e.msg.includes("cell arrow"))).toBe(true));
for(const src of ["window: -1..2","window: 1..2\nwindow: 2..3","cells: 1 | huge","dot 61"])test(`refuses time option ${src}`,()=>expect(compile("time: 0..60\n"+src,[]).errors.length).toBeGreaterThan(0));
test("an inset-only row extends beyond the full domain without reserving a main row",()=>{
 const c=compile('time: 0..40 | minutes\nticks: 0 start, 40 check\nwindow: 0..40 | observation\nat 40: check runs\ndot 25\nzoom: 38..42 | detail | below\nzoom ticks: 40 check\nzoom row job receipt "Three entries": +writing 39..41 [warn]',[{title:"Write",raw:"keep span receipt 39..41 [line]: three entries\nkeep span axis 0..20 [line]: first half",line:15},{title:"Check",raw:"at 40: done",line:18}]);
 expect(c.errors).toEqual([]);
 for(const width of [1000,340]){
 const p=layoutStage(c.model,width);bounded(p.items,width,p.h);
 expect(p.items.some(i=>i.k==="box"&&i.id?.startsWith("time:seg:receipt:"))).toBe(false);
 expect(p.items.some(i=>i.k==="box"&&i.id?.startsWith("time-inset:seg:receipt:"))).toBe(true);
 expect(p.items.filter(i=>i.k==="text"&&i.s==="check runs").length).toBe(1);
 expect(p.items.filter(i=>i.k==="text"&&i.s==="observation").length).toBe(1);
 expect(p.items.filter(i=>i.k==="path"&&i.id?.startsWith("time-inset:tick:")).length).toBe(1);
 }
});
for(const src of ["zoom row job r: a 0..1","zoom ticks: 0","zoom: 2..4\nzoom ticks: 5","zoom: 2..4\nzoom row job r: a 1..3"])test(`refuses invalid inset setup ${src}`,()=>expect(compile("time: 0..60\n"+src,[]).errors.length).toBeGreaterThan(0));
test("dashed cell arrows and stable endpoint declarations",()=>{
 const c=compile('time: 0..4\nrow job a: work 0..4\nrow server b: wait 0..4',[{title:"Copy",raw:"arrow b -> a at 1.5 [dashed]: copy\nkeep at 2: boundary",line:10},{title:"Done",raw:"",line:14}]);
 expect(c.errors).toEqual([]);const p=layoutStage(c.model,1000);
 const arrow=p.items.find(i=>i.k==="path"&&i.arrow)!;
 expect(arrow.k==="path"&&arrow.dash).toBe(true);expect(arrow.bar?.from).toBe("b");expect(arrow.bar?.to).toBe("a");
 const marker=p.items.find(i=>i.k==="path"&&i.id?.includes(":at:"))!;
 expect(marker.bar?.from).toBe(marker.bar?.to);expect(marker.bar?.from).toBeTruthy();
});
test("a guide marker keeps numeric geometry without becoming a connector",()=>{
 const c=compile("time: 0..4\nat 1 [guide]: guide",[{title:"Mark",raw:"keep at 2 [bad] [guide]: boundary",line:10},{title:"Finish",raw:"",line:12}]);
 expect(c.errors).toEqual([]);const p=layoutStage(c.model,340),marks=p.items.filter(i=>i.bar?.kind==="guide");
 expect(marks.length).toBe(2);expect(marks.every(i=>i.bar?.edge===undefined&&i.bar?.value!==undefined)).toBe(true);
});
test("integer ruler labels are exact and time shapes use one declared kind",()=>{
 const c=compile('time: 123456781..123456789\nticks: 123456781, 123456789\ncells: 1\nrow job a: +a 123456781..123456789\nrow server b: b 123456781..123456789',[]);
 const p=layoutStage(c.model,1000);
 expect(p.items.some(i=>i.k==="text"&&i.s==="123456781")).toBe(true);
 expect(p.items.some(i=>i.k==="text"&&i.s==="123456789")).toBe(true);
 expect(p.items.filter(i=>i.bar?.kind==="worksheet-row").length).toBe(2);
 expect(p.items.filter(i=>i.bar?.kind==="lane").length).toBe(1);
 expect(p.items.filter(i=>i.bar?.kind==="chip").length).toBe(16);
 expect(p.items.some(i=>i.bar?.kind==="card"||i.bar?.kind==="unit")).toBe(false);
});
test("numbered header tiles are bands and row-label paint is ignored as a second kind",()=>{
 const c=compile('time ticks: 0..4\ncells: 1 | roomy\nrow job r "(a) Draft | writes": +_ 0..4 [numbered]',[]);expect(c.errors).toEqual([]);
 for(const w of [1000,340]){const p=layoutStage(c.model,w),rows=p.items.filter(i=>i.bar?.kind==="worksheet-row"),tiles=p.items.filter(i=>i.bar?.kind==="band"),labels=p.items.filter(i=>i.bar?.ignore===1);
 expect(rows.length).toBe(1);expect(rows[0].bar?.id).toBe("time-axis-ticks:r");expect(rows[0].bar?.label).toBe("Draft");expect(tiles.length).toBe(4);expect(labels.length).toBe(1);expect(labels.every(i=>!i.bar?.kind)).toBe(true);expect(p.items.some(i=>i.bar?.kind==="chip")).toBe(false);
 }
});
test("facts use canonical style spellings too",()=>{
 const llm=stageLlm(compile('time: 0..4\nrow job r: wait 0..2 [dashed]; ready 2..4 [accent]',[]));expect(llm).toContain("[dashed]");expect(llm).toContain("[accent]");expect(llm).not.toContain("[idle]");expect(llm).not.toContain("[acc]");
});
test("wide, after and cell-less bars are time-bars; single cells stay chips",()=>{
 const c=compile('time: 0..10 | seconds\ncells: 1\nrow job a "wide": +ten 0..10 [wide]\nrow job b "after": +half 0..5 [wide] [after]\nrow server s "cells": +x 0..2',[]);
 expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,1000),kind=(id:string)=>p.items.filter(i=>i.k==="box"&&i.id?.includes(id)).map(i=>i.bar?.kind);
 expect(kind(":seg:a:")).toEqual(["time-bar"]);
 expect(kind(":seg:b:")).toEqual(["time-bar"]);
 expect(kind(":cell:s:")).toEqual(["chip","chip"]);
 const plain=compile('time: 0..10 | seconds\nrow job a "bar": +on 2..8',[]);
 expect(layoutStage(plain.model,1000).items.filter(i=>i.k==="box"&&i.id?.includes(":seg:a:")).map(i=>i.bar?.kind)).toEqual(["time-bar"]);
});
test("solid reference rulers and markers are ordinary no-head line geometry",()=>{
 const c=compile('time: 0..40\nwindow: 0..40 | observation\nat 40 [plain] [solid]: check\nzoom: 38..42 | detail | below\nzoom ticks: 40 check\nzoom row job r: _ 39..41',[]);
 expect(c.errors).toEqual([]);const p=layoutStage(c.model,340);
 const edges=p.items.filter(i=>i.k==="path"&&i.bar?.edge);
 expect(edges.length).toBe(4);expect(edges.every(i=>i.k==="path"&&!i.dash&&!i.arrow)).toBe(true);
});
test("named time axes route operations explicitly and row operations by unique id",()=>{
 const c=compile('time minutes: 0..8 | minutes\ncells: 1\nrow job m: +_ 0..8 [numbered]\ntime ticks: 40..48 | ticks\ncells: 1\nrow server r: _ 40..48 [numbered]',[{title:"First",raw:"keep at minutes 3: minute\nkeep at ticks 43: tick\nkeep span r 40..44: held",line:20},{title:"Second",raw:"keep span ticks axis 44..48 [line]: later",line:25}]);
 expect(c.errors).toEqual([]);expect(c.model.head.length).toBe(2);
 for(const w of [1000,340]){const p=layoutStage(c.model,w);bounded(p.items,w,p.h);
 expect(p.items.filter(i=>i.bar?.axis==="time-axis-minutes-x").length).toBe(1);expect(p.items.filter(i=>i.bar?.axis==="time-axis-ticks-x").length).toBe(1);
 expect(p.items.some(i=>i.bar?.track==="time-axis-ticks-x"&&i.bar?.value===43)).toBe(true);
 for(const n of ["0","1","7","40","47"])expect(p.items.some(i=>i.k==="text"&&i.s===n)).toBe(true);
 }
 expect(stageLlm(c)).toContain("At 43 ticks: tick");
});
test("duplicate time names and ambiguous row ownership are refused",()=>{
 expect(compile("time clock: 0..4\ntime clock: 10..14",[]).errors.some(e=>e.msg.includes("declared twice"))).toBe(true);
 expect(compile("time a: 0..4\nrow job r: x 0..4\ntime b: 0..4\nrow job r: y 0..4",[{title:"one",raw:"keep span r 0..4: x",line:10},{title:"two",raw:"",line:12}]).errors.some(e=>e.msg.includes("several time axes"))).toBe(true);
});
test("plain at is shared with tracks in either source order",()=>{
 for(const h of ['track: job prepare, finish\ntime: 0..4\nrow job r: a 0..4','time: 0..4\nrow job r: a 0..4\ntrack: job prepare, finish']){
 const c=compile(h,[{title:"Start",raw:"at prepare\nat 2: point\nkeep at 3: stays",line:10},{title:"Done",raw:"at finish",line:14}]);
 expect(c.errors).toEqual([]);const p=layoutStage(c.model,340);expect(p.items.filter(i=>i.bar?.edge).length).toBe(2);
 }
});
test("named row ids match arrow endpoints uniquely across clocks",()=>{
 const c=compile('time early: 0..4\nrow job a: x 0..4\nrow server b: y 0..4\ntime later: 4..8\nrow job a: x 4..8\nrow server b: y 4..8',[{title:"Copy",raw:"arrow later b -> a at 5: copy",line:10},{title:"Done",raw:"",line:14}]);expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,340),rows=p.items.filter(i=>i.bar?.kind==="worksheet-row"),arrow=p.items.find(i=>i.k==="path"&&i.arrow);
 expect(new Set(rows.map(i=>i.bar?.id)).size).toBe(4);
 expect(rows.some(i=>i.bar?.id===arrow?.bar?.from)).toBe(true);expect(rows.some(i=>i.bar?.id===arrow?.bar?.to)).toBe(true);
});
for(const raw of ['tmark 2: old','tspan r 0..2: old','tdot 2: old','tarrow above -> r at 2: old'])test(`retired step spelling gives its replacement: ${raw}`,()=>{
 const c=compile('time: 0..4\nrow job r: a 0..4',[{title:"Start",raw,line:10},{title:"Done",raw:"",line:14}]);expect(c.errors.some(e=>e.msg.includes("instead"))).toBe(true);
});
for(const raw of ['marker 2: old','zoomrow job r: a 0..2','zoomticks: 2','values: 0..10','ruler: lines','row job r: a 0..2 [idle]','row job r: a 0..2 [focus]','row job r: a 0..2 [acc]'])test(`retired setup spelling is refused: ${raw}`,()=>expect(compile('time: 0..4\n'+raw,[]).errors.length).toBeGreaterThan(0));
test("phone: a row label that fits 40% of the block stays on one line (a desktop keeps its 110 px column); a dense numbered row is as tall as its numbers", () => {
  const src = `time: 924..956 | ticks
cells: 1
ruler: none
row labels: beside
row server tk "": _ 924..956 [plain] [numbered]
row job s7 "crate 7 · gets it": _ 924..932 [dashed]; +_ 932..956 [warn]`;
  const c = compile(src, [{ title: "One", raw: "", line: 10 }, { title: "Two", raw: "", line: 12 }]); expect(c.errors).toEqual([]);
  const label = (p: { items: Item[] }) => p.items.filter((i) => i.k === "text" && /crate|gets/.test(i.s)).map((i) => i.k === "text" ? i.s : "");
  const phone = layoutStage(c.model, 356), desk = layoutStage(c.model, 1000);
  expect(label(phone)).toEqual(["crate 7 · gets it"]); // one line on the phone (it wrapped at the 110 px cap)
  const row = (p: { items: Item[] }, id: string) => p.items.find((i) => i.k === "box" && i.id?.endsWith(`:row:${id}:1`)) as Extract<Item, { k: "box" }>;
  expect(row(phone, "s7").h).toBeLessThan(30);
  const cell0 = (p: { items: Item[] }) => (p.items.find((i) => i.k === "box" && i.id?.includes(":cell:tk:924:")) as Extract<Item, { k: "box" }>).x;
  expect(cell0(desk)).toBe(cell0(layoutStage(compile(src.replace("crate 7 · gets it", "crate 7 · gets it and more words"), [{ title: "One", raw: "", line: 10 }, { title: "Two", raw: "", line: 12 }]).model, 1000))); // desktop: the column stays capped at 110
  // the numbered row: every cell keeps its number drawn; level on up to 3 staggered rows when they fit, else on end staggered; the row as tall as that needs
  const tk = row(phone, "tk");
  expect(phone.items.filter((i) => i.k === "box" && i.id?.includes(":cell:tk:")).map((i) => i.bar?.label)).toEqual(Array.from({ length: 32 }, (_, i) => String(924 + i)));
  const drawn = phone.items.filter((i) => i.k === "text" && /^9\d\d$/.test(i.s)).map((i) => i.k === "text" ? i.s : "");
  expect(new Set(drawn).size).toBe(32);
  const longest = Math.max(...Array.from({ length: 32 }, (_, i) => Math.ceil(measure(String(924 + i), "chip"))));
  expect(tk.h).toBeLessThanOrEqual(Math.max(3 * 16 + 4, 2 * longest + 5));
});
test("a [below] marker label that fits the block keeps one line: it slides along its axis, its tick still under its words (on a phone: each ends at its own line, on one shelf)", () => {
  const src = `time: 924..956 | ticks
cells: 1
ruler: none
row labels: beside
row job s7 "crate 7 · gets it": _ 924..932 [dashed]; +_ 932..956 [warn]`;
  const c = compile(src, [{ title: "One", raw: "keep at 932 [accent] [guide] [below]: openFromTick …932 · 10:20:00\nkeep at 953 [bad] [guide] [below]: shiftTick …953 · 10:25:15", line: 10 }, { title: "Two", raw: "", line: 13 }]); expect(c.errors).toEqual([]);
  for (const w of [326, 341, 356, 380]) {
    const p = layoutStage(c.model, w), T = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && /Tick|^10:/.test(i.s));
    setPhoneFont(true);
    try {
      expect(new Set(T.map((t) => t.y)).size).toBeLessThanOrEqual(2); // one shelf: at most two lines, both labels on it
      for (const v of [932, 953]) {
        const line = p.items.find((i) => i.k === "path" && i.id?.includes(`:at:`) && i.id?.endsWith(`:${v}:${v === 932 ? 0 : 1}`)) as Extract<Item, { k: "path" }>, x = line.pts[0][0];
        const own = T.filter((t) => t.s.includes(String(v)) || (v === 932 ? t.s === "10:20:00" : t.s === "10:25:15"));
        expect(own.map((t) => t.s).join(" · ")).toBe(v === 932 ? "openFromTick …932 · 10:20:00" : "shiftTick …953 · 10:25:15");
        for (const t of own) { expect(t.anchor).toBe("end"); expect(Math.abs(t.x - x)).toBeLessThanOrEqual(0.5); expect(t.x - measure(t.s, "sub") * 1.12).toBeGreaterThanOrEqual(8); } // ends on its own line whatever the font's width
      }
    } finally { setPhoneFont(false); }
  }
  for (const w of [1000]) {
    const p = layoutStage(c.model, w), T = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text");
    for (const [v, s] of [[932, "openFromTick …932 · 10:20:00"], [953, "shiftTick …953 · 10:25:15"]] as const) {
      const t = T.filter((i) => i.s.includes(String(v)) && /Tick/.test(i.s));
      expect(t.map((i) => i.s)).toEqual([s]); // one line
      const line = p.items.find((i) => i.k === "path" && i.id?.includes(`:at:`) && i.pts[0][0] > 0 && Math.abs(i.pts[0][0] - i.pts[1][0]) < 0.01 && i.id?.includes(String(v))) as Extract<Item, { k: "path" }> | undefined;
      if (line) { const x = line.pts[0][0], left = t[0].x; expect(x).toBeGreaterThanOrEqual(left - 0.5); expect(x).toBeLessThanOrEqual(left + measure(s, "sub") + 0.5); }
    }
  }
});

test("roomy: each gap between rows holds the tallest arrow words any step draws in it; a gap no arrow crosses stays tight; a callout reaches past the revealed cells", () => {
  const c = compile('time: 6..12\ncells: 1 | roomy\nrow job ra "A": empty 6..7 @1; +x 7..8 @2; +y 8..9 @3; +z 9..12 @4\nrow server rb "B": +w 6..7 @1; +w 7..8 @2; +w 8..9 @3; +w 9..12 @4\nrow job rm "M": +m 6..7 @1; +m 7..9 @3; +m 9..12 @4',
    [{ title: "One", raw: "", line: 8 }, { title: "Two", raw: "", line: 9 }, { title: "Three", raw: "arrow rb -> ra at 8.5 [dashed]: GET /twin/state, once", line: 10 }, { title: "Four", raw: "", line: 11 }]);
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000), row = (id: string) => p.items.find((i) => i.k === "box" && i.id === `time:row:${id}:1`) as Extract<Item, { k: "box" }>;
  const gap1 = row("rb").y - (row("ra").y + row("ra").h), gap2 = row("rm").y - (row("rb").y + row("rb").h);
  const words = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && i.s.includes("twin"));
  expect(words.map((i) => i.s)).toEqual(["GET /twin/state, once"]); // one line: it may reach past the revealed columns (7 to 9)
  expect(gap1).toBeLessThanOrEqual(36 + 6); expect(gap1).toBeGreaterThanOrEqual(18 + 8); // room for one line of words
  expect(gap2).toBeLessThan(16); // no arrow crosses it
  expect(words[0].x + measure(words[0].s, "sub")).toBeLessThanOrEqual(1000);
  // zero movement: every step draws the rows at the same height
  for (const id of ["ra", "rb", "rm"]) expect(new Set(p.items.filter((i) => i.k === "box" && i.id?.startsWith(`time:row:${id}:`)).map((i) => i.k === "box" ? i.y : 0)).size).toBe(1);
});
test("dot fill is step-only, keep persists, and off restores paint without moving a dot",()=>{
 const raw=['','fill engine','', 'keep fill engine','', 'off engine',''];const c=compile('time ticks: 0..8\nrow server engine "Engine": arriving 1..2 [dot]\nrow job stored "Stored": saved 4..5 [dot] [plain]',raw.map((raw,i)=>({title:String(i+1),raw,line:10+i})));expect(c.errors).toEqual([]);
 for(const w of[1000,356,326]){const p=layoutStage(c.model,w);let geometry:string|undefined;
  for(let step=1;step<=7;step++){const dots=p.items.filter((i):i is Extract<Item,{k:'box'}>=>i.k==='box'&&!!i.cls?.includes('stg-time-dot')&&(!i.from||i.from<=step)&&(!i.to||i.to>=step));expect(dots.length).toBe(2);const e=dots.find(i=>i.id?.includes(':engine:'))!;expect(e.fill).toBe([2,4,5].includes(step)?'role:server:line':'role:server:soft');expect(dots.find(i=>i.id?.includes(':stored:'))!.fill).toBe('muted');const next=JSON.stringify([e.id,e.x,e.y,e.w,e.h,e.r]);if(geometry)expect(next).toBe(geometry);else geometry=next;}
  bounded(p.items,w,p.h);
 }
 expect(stageLlm(c)).toContain('filled this step only');
 const named=compile('time first: 0..8\nrow job a "A": _ 1..2 [dot]\ntime second: 10..18\nrow server b "B": _ 11..12 [dot]',[{title:'One',raw:'keep fill second b',line:10},{title:'Two',raw:'',line:12}]);expect(named.errors).toEqual([]);expect(layoutStage(named.model,356).items.some(i=>i.k==='box'&&i.id?.includes(':dot:b:')&&i.fill==='role:server:line')).toBe(true);
});
test("fill refuses rows without dots and still routes record value fills",()=>{
 for(const raw of['fill a','keep fill a','off a'])expect(compile('time: 0..8\nrow job a "A": _ 0..8',[{title:'One',raw,line:8},{title:'Two',raw:'',line:10}]).errors.length).toBeGreaterThan(0);
 const c=compile('job c1: Record\n  keys: State\ntime: 0..8\nrow job a "A": _ 1..2 [dot]',[{title:'One',raw:'fill c1 State: ready\nfill a',line:8},{title:'Two',raw:'',line:10}]);expect(c.errors).toEqual([]);
});
test("phone dots use the closest planned gap, with fixed centres and caption backings",()=>{
 const ranges=Array.from({length:25},(_,i)=>`_ ${-150+i*15}..${-148+i*15} [dot]${i>12?' @2':''}`).join('; '),c=compile(`time: -150..212\nruler: below\nrow server e "Engine": ${ranges}\nrow job s "Stored": receipt 36..38 [dot] [plain]\nat 37 [solid]: checkpoint`,[{title:'One',raw:'',line:8},{title:'Two',raw:'keep fill e\nkeep span e -150..2 [line] [plain]: one range caption',line:9}]);expect(c.errors).toEqual([]);
 for(const w of[1000,356,326]){const p=layoutStage(c.model,w),dots=p.items.filter((i):i is Extract<Item,{k:'box'}>=>i.k==='box'&&!!i.id?.includes(':dot:e:')&&(!i.from||i.from<=2)&&(!i.to||i.to>=2)).sort((a,b)=>a.x-b.x);expect(dots.length).toBe(25);if(w<480)for(let i=1;i<dots.length;i++)expect(dots[i].x-(dots[i-1].x+dots[i-1].w)).toBeGreaterThanOrEqual(1.9);else expect(dots[0].w).toBe(16);
  for(const label of['receipt','one range caption']){const text=p.items.find((i):i is Extract<Item,{k:'text'}>=>i.k==='text'&&i.s===label);expect(text).toBeDefined();const mask=p.items.find((i):i is Extract<Item,{k:'box'}>=>i.k==='box'&&i.cls==='stg-time-caption-mask'&&text!.x>=i.x&&text!.y>=i.y&&text!.y<=i.y+i.h&&i.w>=measureAt(label,'sub',w));expect(mask?.bar?.ignore).toBe(1);expect(mask?.bar?.edge).toBeUndefined();expect(mask?.from??1).toBe(text?.from??1);}
  bounded(p.items,w,p.h);
 }
});
test("roomy counts use large centred role ink and boxed headings centre vertically",()=>{
 const c=compile('time: 0..6\ncells: 1 | roomy\nrow job a "(a) Writer | primary": +×1 0..6\nrow server b "| Archive": +×1 0..6',[]);expect(c.errors).toEqual([]);
 for(const w of[1000,356,326]){const p=layoutStage(c.model,w),counts=p.items.filter((i):i is Extract<Item,{k:'text'}>=>i.k==='text'&&i.s==='×1');expect(counts.length).toBe(12);expect(counts.every(i=>i.f==='big'&&i.anchor==='middle'&&i.ink.endsWith(':line'))).toBe(true);const text=p.items.find((i):i is Extract<Item,{k:'text'}>=>i.k==='text'&&i.s==='Archive'),box=p.items.find((i):i is Extract<Item,{k:'box'}>=>i.k==='box'&&i.id==='time:row-label:b');if(w===1000){expect(box).toBeDefined();expect(text!.y-box!.y).toBeCloseTo(box!.h/2+4,5);}bounded(p.items,w,p.h);}
});
test("a large bad-cell corner mark remains inside its cell and clear of the word ink",()=>{
 const c=compile('time: 0..6\ncells: 1 | roomy\nrow job a "A": dies 0..1 [bad]; _ 1..6',[]);expect(c.errors).toEqual([]);
 for(const w of[1000,356,326]){const p=layoutStage(c.model,w),cell=p.items.find((i):i is Extract<Item,{k:'box'}>=>i.k==='box'&&i.cls?.includes('stg-time-cell')&&i.bar?.label==='dies'),word=p.items.find((i):i is Extract<Item,{k:'text'}>=>i.k==='text'&&i.s==='dies'),cross=p.items.find((i):i is Extract<Item,{k:'path'}>=>i.k==='path'&&i.ink==='bad:line');expect(cell&&word&&cross).toBeTruthy();const [tl,br]=cross!.pts;expect(tl[0]-1.5).toBeGreaterThan(cell!.x);expect(br[0]+1.5).toBeLessThan(cell!.x+cell!.w);expect(tl[1]-1.5).toBeGreaterThan(cell!.y);expect(br[1]+1.5).toBeLessThan(cell!.y+cell!.h);const wordRight=word!.x+measureAt('dies','sub',w)*.6,wordTop=word!.y-(w<480?11:12);expect(tl[0]>wordRight+1||br[1]+1.5<wordTop).toBe(true);if(w===1000)expect(br[0]-tl[0]).toBe(30);bounded(p.items,w,p.h);}
});
test("32 boxed tick headers do not add a body row and independent reveals show eight cells per row",()=>{
 const stages=[{title:'One',raw:'',line:10},{title:'Two',raw:'',line:11},{title:'Three',raw:'',line:12},{title:'Four',raw:'',line:13},{title:'Five',raw:'',line:14}],row=(role:string,id:string)=>`row ${role} ${id} "${id}": +x 840..848 @3; x 848..869 @4 [warn]; x 869..872 @5 [good]`;
 const c=compile('time: 840..872\ncells: 1 | headers\n'+[row('job','a'),row('server','b'),row('job','c')].join('\n'),stages);expect(c.errors).toEqual([]);
 for(const w of[1000,356,326]){const p=layoutStage(c.model,w);expect(p.items.filter(i=>i.k==='box'&&i.bar?.kind==='band').length).toBe(32);expect(new Set(p.items.filter(i=>i.k==='box'&&i.bar?.kind==='worksheet-row').map(i=>i.bar?.id)).size).toBe(3);for(const row of['a','b','c'])expect(p.items.filter(i=>i.k==='box'&&i.id?.includes(`:cell:${row}:`)&&(!i.from||i.from<=3)&&(!i.to||i.to>=3)).length).toBe(8);bounded(p.items,w,p.h);}
});
test("alternating dot paint runs cover each step once and charge every allocated variant",()=>{
 const budget=newBudget();let variants=0;beginDocument({left:()=>budget.left(),charge:(what,work,memory)=>{if(what==='time dot paint variants')variants+=memory||0;budget.charge(what,work,memory);}});
 const steps=Array.from({length:40},(_,i)=>({title:String(i+1),raw:i%2===0?'fill a':'',line:8+i}));const c=compile('time: 0..8\nrow job a "A": _ 1..2 [dot]; _ 3..4 [dot]; _ 5..6 [dot]',steps);expect(c.errors).toEqual([]);const p=layoutStage(c.model,1000),dots=p.items.filter((i):i is Extract<Item,{k:'box'}>=>i.k==='box'&&!!i.cls?.includes('stg-time-dot'));expect(dots.length).toBe(120);expect(variants).toBeGreaterThanOrEqual(dots.length);
 for(let step=1;step<=40;step++){const shown=dots.filter(i=>(!i.from||i.from<=step)&&(!i.to||i.to>=step));expect(shown.length).toBe(3);expect(shown.every(i=>i.fill===(step%2?'role:job:line':'role:job:soft'))).toBe(true);}
});
test("failure corners keep their whole stroke inside very thin cells too",()=>{
 const c=compile('time: 0..200\ncells: 1\nruler: none\nrow job a "A": _ 0..200 [bad]',[]);expect(c.errors).toEqual([]);const p=layoutStage(c.model,326),cells=p.items.filter((i):i is Extract<Item,{k:'box'}>=>i.k==='box'&&!!i.cls?.includes('stg-time-cell')),paths=p.items.filter((i):i is Extract<Item,{k:'path'}>=>i.k==='path'&&i.ink==='bad:line');expect(cells.length).toBe(200);expect(paths.length).toBe(400);for(let i=0;i<cells.length;i++){const cell=cells[i];for(const cross of paths.slice(i*2,i*2+2)){const x=cross.pts.map(p=>p[0]),half=cross.w!/2;expect(Math.min(...x)-half).toBeGreaterThan(cell.x);expect(Math.max(...x)+half).toBeLessThan(cell.x+cell.w);}}bounded(p.items,326,p.h);
});
test("a dot row may share its axis name without losing bare fill and off routing",()=>{
 const c=compile('time clock: 0..8\nrow job clock "Clock": _ 1..2 [dot]',[{title:'One',raw:'keep fill clock',line:8},{title:'Two',raw:'off clock',line:10}]);expect(c.errors).toEqual([]);const p=layoutStage(c.model,356),dots=p.items.filter((i):i is Extract<Item,{k:'box'}>=>i.k==='box'&&!!i.cls?.includes('stg-time-dot'));expect(dots.map(i=>[i.from,i.to,i.fill])).toEqual([[1,1,'role:job:line'],[2,0,'role:job:soft']]);
});
test("the LLM view ends each marker sentence with one full stop, never two", () => {
  const c = compile(head.replace("at 31: handoff", "at 31: The parcel is released.\nat 40 [caption]: Ready!"), [{ title: "One", raw: "at 52: pass.", line: 20 }, { title: "Two", raw: "", line: 21 }]);
  expect(c.errors).toEqual([]);
  const llm = stageLlm(c);
  expect(llm).toContain("Marker 31: The parcel is released.");
  expect(llm).not.toMatch(/\.\.(\s|$)|!\./);
  expect(llm).toContain("At 52 seconds: pass.");
});
test("long phone cell words pack in keyed caption rows with complete stroke backings",()=>{
 const head='time: 0..28\ncells: 1\nticks: 0, 1, 2, 3, 4, 5, 6, 7\nrow job a "Writer": +operators 0..4; +payload 4..7 @3\nrow server b "Receiver": +save, payload 0..2 @2; +to two operators 2..7 @3'; // cells narrow enough that these words fit neither level, on end nor staggered, so they still take keyed captions
 const c=compile(head,[{title:'One',raw:'keep at 2 [below]: checkTick = Q - 2 s',line:10},{title:'Two',raw:'',line:12},{title:'Three',raw:'keep at 4 [bad] [below]: shiftTick = Q + 1 s',line:14}]);expect(c.errors).toEqual([]);
 for(const w of[356,326]){const p=layoutStage(c.model,w),T=p.items.filter((i):i is Extract<Item,{k:'text'}>=>i.k==='text'),captions=T.filter(i=>/^\d+: /.test(i.s));expect(captions.length).toBeGreaterThan(7);expect(captions.some(i=>i.s==='1: operators')).toBe(true);expect(T.some(i=>i.s==='1'&&i.tip==='operators')).toBe(true);
  for(const text of captions){const mask=p.items.find((i):i is Extract<Item,{k:'box'}>=>i.k==='box'&&i.cls==='stg-time-caption-mask'&&i.x<=text.x&&i.x+i.w>=text.x+measureAt(text.s,'sub',w)&&i.y<=text.y-10&&i.y+i.h>=text.y);expect(mask?.bar?.ignore).toBe(1);expect(mask?.from??1).toBe(text.from??1);}
  // Several labels share each caption baseline, rather than descending one cell at a time.
  const first=captions.filter(i=>i.to===0&&i.from===1);expect(new Set(first.map(i=>i.y)).size).toBeLessThan(first.length);bounded(p.items,w,p.h);
 }
 const desk=layoutStage(c.model,1000),marker=desk.items.find((i):i is Extract<Item,{k:'path'}>=>i.k==='path'&&!!i.id?.includes(':at:1:2:')),label=desk.items.find((i):i is Extract<Item,{k:'text'}>=>i.k==='text'&&i.s==='checkTick = Q - 2 s');expect(marker&&label).toBeTruthy();expect(label!.y).toBeGreaterThan(marker!.pts.at(-1)![1]);
});
test("dense desktop tick grids keep long plain row labels on one line and trim the ruler gap",()=>{
 const head='time: 840..872 | ticks per parcel\ncells: 1 | headers\nrow job a "parcel 7 · old keeper": _ 840..872\nrow server b "parcel 32 · new keeper": _ 840..872',c=compile(head,[]);expect(c.errors).toEqual([]);
 const p=layoutStage(c.model,1158),unit=p.items.find((i):i is Extract<Item,{k:'text'}>=>i.k==='text'&&i.s==='ticks per parcel'),headers=p.items.filter((i):i is Extract<Item,{k:'box'}>=>i.k==='box'&&i.bar?.kind==='band'),row=p.items.find((i):i is Extract<Item,{k:'box'}>=>i.k==='box'&&i.bar?.id==='a');expect(headers.length).toBe(32);expect(headers.every(i=>i.h===18)).toBe(true);expect(p.items.filter(i=>i.k==='text'&&i.tip==='parcel 7 · old keeper').map(i=>i.k==='text'?i.s:'')).toEqual(['parcel 7 · old keeper']);expect(row!.y-unit!.y).toBe(28);bounded(p.items,1158,p.h);
 // The phone keeps its header dimensions and full words; the density change is desktop only.
 const phone=layoutStage(c.model,356);expect(phone.items.filter(i=>i.k==='box'&&i.bar?.kind==='band').every(i=>i.k==='box'&&i.h>=24)).toBe(true);bounded(phone.items,356,phone.h);
});
test("a named time axis leaves an above input free while its target keeps the scene-unique row identity",()=>{
 const h='time: 0..4\ncells: 1 | roomy\nrow job a "(a) Draft | writes": +x1 0..4',ss=[{title:'Begin',raw:'',line:8},{title:'Input',raw:'arrow above -> a at 1.5 [dashed]: input',line:10}];
 const plain=compile(h,ss),named=compile(h.replace('time:','time clock:'),ss);expect(plain.errors).toEqual([]);expect(named.errors).toEqual([]);
 for(const w of[1158,1280,390,360]){const p=layoutStage(named.model,w),q=layoutStage(plain.model,w),arrow=p.items.find((i):i is Extract<Item,{k:'path'}>=>i.k==='path'&&!!i.arrow)!,old=q.items.find((i):i is Extract<Item,{k:'path'}>=>i.k==='path'&&!!i.arrow)!,row=p.items.find(i=>i.k==='box'&&i.bar?.kind==='worksheet-row')!;expect(arrow.bar?.from).toBe('above');expect(arrow.bar?.to).toBe(row.bar?.id);expect(arrow.bar?.to).toBe('time-axis-clock:a');expect([arrow.pts,arrow.head,arrow.w,arrow.dash,arrow.ink]).toEqual([old.pts,old.head,old.w,old.dash,old.ink]);}
});
