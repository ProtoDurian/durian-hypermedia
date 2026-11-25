import { beforeAll, afterAll, test, expect } from "bun:test";
import { which } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { partPage } from "./places-page";
const withBrowser = !!which("google-chrome") && process.env.DH_CDP_TEST !== "0";
type Seen = {events:{title:string;cut:boolean;split:string[];top:number;bottom:number;x:number;right:number}[];top:number;bottom:number;overflow:boolean};
let site: Awaited<ReturnType<typeof partPage>>;
beforeAll(async () => { if (withBrowser) site = await partPage(readFileSync(join(import.meta.dir, "../src/parts/calendar/sample.md"), "utf8")); }, 90_000);
afterAll(async () => { await site?.close(); });

test.skipIf(!withBrowser)("calendar: short and overlapping week titles stay whole; the first event is not a clipped sliver", async () => {
  for (const width of [1280, 390, 360]) for (const dark of [false, true]) {
    await site.open(width, dark);
    const got = await site.page.eval<Seen>(`(() => {
      const cal=document.querySelector(".cal"), scroll=cal.querySelector(".cal-scroll"), viewport=scroll.getBoundingClientRect();
      const events=[...cal.querySelectorAll(".cal-ev, .cal-allday")].map(e=>{
        const b=e.querySelector("b"), r=b.getBoundingClientRect(), er=e.getBoundingClientRect();
        const text=b.firstChild, split=[]; for(const match of b.textContent.matchAll(/[A-Za-z]+/g)) { const range=document.createRange();range.setStart(text,match.index);range.setEnd(text,match.index+match[0].length);const rows=new Set([...range.getClientRects()].map(r=>Math.round(r.top)));if(rows.size>1)split.push(match[0]); }
        return {split,title:b.textContent,cut:b.scrollWidth>b.clientWidth+1 || b.scrollHeight>b.clientHeight+1 || r.bottom>er.bottom+1,top:er.top,bottom:er.bottom,x:er.x,right:er.right};
      });
      return {events,top:viewport.top,bottom:viewport.bottom,overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
    expect(got.events.length).toBeGreaterThan(0);
    expect(got.events.filter(e=>e.cut).map(e=>e.title)).toEqual([]);
    expect(got.events.flatMap(e=>e.split)).toEqual([]);
    expect(got.events.filter(e=>e.bottom>got.top && e.top<got.top-1).map(e=>e.title)).toEqual([]);
    expect(got.overflow).toBe(false);
    // Intersecting appointments take different columns, never the same painted area.
    for(let i=0;i<got.events.length;i++) for(let j=i+1;j<got.events.length;j++) {
      const a=got.events[i],b=got.events[j];
      expect(a.right<=b.x+1 || b.right<=a.x+1 || a.bottom<=b.top+1 || b.bottom<=a.top+1).toBe(true);
    }
    expect(await site.issues()).toEqual({errors:[],csp:[]});
    const still=await site.page.eval<any>(`(()=>{const e=document.querySelector(".cal-static");return{buttons:e.querySelectorAll("button").length,cut:[...e.querySelectorAll("strong")].some(b=>b.scrollWidth>b.clientWidth+1),text:e.textContent,box:e.getBoundingClientRect().toJSON()}})()`);
    expect(still.buttons).toBe(0); expect(still.cut).toBe(false); expect(still.text).toContain("Stand-up"); expect(still.text).toContain("Code freeze");
    if(process.env.DH_PARTS_SHOTS) {
      const box=await site.page.eval<any>('document.querySelector(".cal").getBoundingClientRect().toJSON()');
      await site.page.shot(join(process.env.DH_PARTS_SHOTS,"calendar-"+width+"-"+(dark?"dark":"light")+".png"),box);
      await site.page.shot(join(process.env.DH_PARTS_SHOTS,"calendar-static-"+width+"-"+(dark?"dark":"light")+".png"),still.box);
    }
  }
}, 90_000);
