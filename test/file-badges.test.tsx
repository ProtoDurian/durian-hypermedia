import {beforeAll,afterAll,test,expect} from "bun:test";
import {which} from "bun";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {partPage} from "./places-page";
const fixture=(name:string)=>readFileSync(join(import.meta.dir,"../fixtures/format",name),"utf8");
const body=(s:string)=>s.replace(/^---\n[\s\S]*?\n---\n/,"");
const source=fixture("41-marks-and-prefixes.dh.md")+"\n"+body(fixture("39-file-tree.dh.md"))+"\n"+body(fixture("42-editor.dh.md"));
const withBrowser=!!which("google-chrome")&&process.env.DH_CDP_TEST!=="0";
let site:Awaited<ReturnType<typeof partPage>>;
beforeAll(async()=>{if(withBrowser)site=await partPage(source);},90_000);
afterAll(async()=>{await site?.close();});
test.skipIf(!withBrowser)("file-type badges in trees, marks and the editor stay readable and fit their letters",async()=>{
 for(const width of[1280,390,360])for(const dark of[false,true]){
  await site.open(width,dark);
  const count=await site.page.eval<number>('document.querySelectorAll(".part-filetree,.part-editor").length');expect(count).toBeGreaterThanOrEqual(3);
  for(let i=0;i<count;i++){
   await site.page.eval('document.querySelectorAll(".part-filetree,.part-editor")['+i+'].scrollIntoView({block:"start"})');await site.page.sleep(200);
   const sizes=await site.page.eval<{font:number;fits:boolean;text:string;badge:DOMRect;glyph:DOMRect}[]>('(()=>{const part=document.querySelectorAll(".part-filetree,.part-editor")['+i+'];return[...part.querySelectorAll(".fi-file")].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const range=document.createRange();range.selectNodeContents(e);const t=range.getBoundingClientRect(),b=e.getBoundingClientRect();return{font:parseFloat(getComputedStyle(e).fontSize),fits:t.left>=b.left-0.5&&t.right<=b.right+0.5&&t.top>=b.top-0.5&&t.bottom<=b.bottom+0.5,text:e.textContent,badge:b.toJSON(),glyph:t.toJSON()};});})()');
   expect(sizes.length).toBeGreaterThan(0);for(const s of sizes){expect(s.font).toBeGreaterThanOrEqual(width<640?11:10);expect(s.fits,JSON.stringify(s)).toBe(true);}
   if(process.env.DH_PARTS_SHOTS&&width!==360){const b=await site.page.eval<any>('( calIndex => {const r=document.querySelectorAll(".part-filetree,.part-editor")[calIndex].getBoundingClientRect();return{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height};})('+i+')');await site.page.shot(join(process.env.DH_PARTS_SHOTS,"badges-"+i+"-"+width+"-"+(dark?"dark":"light")+".png"),b);}
  }
  expect(await site.issues()).toEqual({errors:[],csp:[]});
 }
},90_000);
