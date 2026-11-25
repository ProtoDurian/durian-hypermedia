import {beforeAll,afterAll,test,expect} from "bun:test";
import {which} from "bun";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {parse} from "../src/index";
import {partPage} from "./places-page";
const sample=readFileSync(join(import.meta.dir,"../src/parts/weather/sample.md"),"utf8");
const withBrowser=!!which("google-chrome")&&process.env.DH_CDP_TEST!=="0";
let site:Awaited<ReturnType<typeof partPage>>;
beforeAll(async()=>{if(withBrowser)site=await partPage(sample);},90_000);
afterAll(async()=>{await site?.close();});
test("weather: the Sydney spring sample is explicitly an example and has showers, not an ice warning",()=>{
 const block=parse(sample).blocks.find(b=>b.type==="weather"&&b.data.place==="Sydney");
 expect(block?.type).toBe("weather");if(block?.type!=="weather")throw new Error("sample missing");
 expect(block.data.title).toContain("Example");
 expect(block.data.rows.map(r=>r.sky)).toEqual(["sun","partly","rain"]);
 expect(block.data.rows[2].hi).toBe(20);expect(block.data.rows[2].lo).toBe(15);
 expect(block.data.rows[2].note).toBe("Showers later");
});
test.skipIf(!withBrowser)("weather: hourly data fills the frame with the words kept their size; static days need no swipe",async()=>{
 for(const width of[1280,390,360])for(const dark of[false,true]){
  await site.open(width,dark);
  const seen=await site.page.eval<any>(`(()=>{const hours=document.querySelector(".wx-hours"),wx=hours.closest(".wx"),scroll=wx.querySelector(".wx-scroll"),plot=wx.querySelector(".wx-plot"),box=hours.getBoundingClientRect(),cells=[...hours.querySelectorAll(".wx-hrow:first-child li")].map(e=>e.getBoundingClientRect()),points=[...plot.querySelectorAll("circle")].map(e=>e.getBoundingClientRect());const still=document.querySelector(".wx[data-dh-static]"),sc=still.querySelector(".wx-scroll");return{width:box.width,available:scroll.clientWidth-16,plot:plot.getBoundingClientRect().width,offsets:points.map((r,i)=>Math.abs(r.x+r.width/2-cells[i].x-cells[i].width/2)),font:Math.min(...[...plot.querySelectorAll("text")].map(e=>parseFloat(getComputedStyle(e).fontSize))),staticScroll:sc.scrollWidth>sc.clientWidth+1,staticText:still.textContent,staticButtons:still.querySelectorAll("button").length,pageScroll:document.documentElement.scrollWidth>innerWidth,box:wx.getBoundingClientRect().toJSON(),stillBox:still.getBoundingClientRect().toJSON()}})()`);
  if(width===1280)expect(Math.abs(seen.width-seen.available)).toBeLessThan(2);
  expect(Math.abs(seen.plot-seen.width)).toBeLessThan(1);expect(Math.max(...seen.offsets)).toBeLessThan(1);expect(seen.font).toBeGreaterThanOrEqual(11);
  expect(seen.staticScroll).toBe(false);expect(seen.staticButtons).toBe(0);expect(seen.staticText).toContain("Showers later");expect(seen.pageScroll).toBe(false);
  const labels=()=>site.page.eval<string[]>('[...document.querySelector(".wx-hours").querySelectorAll("[data-wx=hi]")].map(e=>e.textContent)');
  const first=await labels();await site.page.eval('document.querySelector(".wx-hours").closest(".wx").querySelector("[data-unit=\\"temp:c\\"]").click()');
  expect(await labels()).not.toEqual(first);await site.page.eval('document.querySelector(".wx-hours").closest(".wx").querySelector("[data-unit=\\"temp:f\\"]").click()');expect(await labels()).toEqual(first);
  expect(await site.issues()).toEqual({errors:[],csp:[]});
  if(process.env.DH_PARTS_SHOTS){await site.page.shot(join(process.env.DH_PARTS_SHOTS,"weather-hour-"+width+"-"+(dark?"dark":"light")+".png"),seen.box);await site.page.shot(join(process.env.DH_PARTS_SHOTS,"weather-static-"+width+"-"+(dark?"dark":"light")+".png"),seen.stillBox);}
 }
},90_000);
