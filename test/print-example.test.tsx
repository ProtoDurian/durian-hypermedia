import React from "react";
import {beforeAll,afterAll,test,expect} from "bun:test";
import {which} from "bun";
import {renderToString} from "react-dom/server";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {parse} from "../src/index";
import {DhDocument} from "../src/react";
import {documentJson} from "../src/react/hydrate";
import {buildCss} from "../scripts/build-css";
import {launch,type Page} from "../scripts/cdp";
const root=resolve(import.meta.dir,".."),withBrowser=!!which("google-chrome")&&process.env.DH_CDP_TEST!=="0";
const sample=readFileSync(join(root,"fixtures/format/59-animation-the-author-sets-the-beat.dh.md"),"utf8").match(/\x60\x60\x60animation[\s\S]*?\x60\x60\x60/)![0];
let page:Page|undefined,server:ReturnType<typeof Bun.serve>|undefined,dir="";
beforeAll(async()=>{
 if(!withBrowser)return;
 dir=mkdtempSync(join(tmpdir(),"dh-print-example-"));const doc=parse("---\nstatic: true\n---\n\n"+sample);
 const b=await Bun.build({entrypoints:[join(root,"example/client.tsx")],outdir:dir,target:"browser",format:"esm",splitting:true,minify:true,naming:{entry:"[name].[ext]",chunk:"c-[hash].[ext]"},define:{"process.env.NODE_ENV":'"production"'}});expect(b.success).toBe(true);
 const css=buildCss()+readFileSync(join(root,"example/site.css"),"utf8");
 const html='<!doctype html><html class="fonts-ready"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><script type="module" src="/client.js"></script><header class="ex-head"><a class="ex-brand">durian-markdown</a><span class="ex-tools"><span>Style</span><button>soft</button><button>flat</button><button>bold</button></span></header><main class="ex-main"><p class="ex-crumb">All fixtures</p><section class="ex-views"><details open class="ex-view"><summary>Source</summary><pre class="ex-view-pre">The authored scene.</pre></details><details open class="ex-view"><summary>LLM view</summary><pre class="ex-view-pre">The scene in words.</pre></details></section><div id="spacer"></div><div id="dh-root">'+renderToString(<DhDocument doc={doc}/>)+'</div></main><script type="application/json" id="dh-doc">'+documentJson(doc)+'</script>';
 server=Bun.serve({port:0,hostname:"127.0.0.1",fetch(req){
  const p=new URL(req.url).pathname;if(p==="/favicon.ico")return new Response(null,{status:204});
  if(p==="/")return new Response(html,{headers:{"content-type":"text/html","content-security-policy":"default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';require-trusted-types-for 'script'"}});
  if(p==="/style.css")return new Response(css,{headers:{"content-type":"text/css"}});
  if(p.startsWith("/fonts/"))return new Response(Bun.file(join(root,"example",p)),{headers:{"content-type":"font/woff2"}});
  if(p==="/pdf.mjs"||p==="/pdf.worker.mjs")return new Response(Bun.file(join(root,"node_modules/pdfjs-dist/build",p.slice(1))),{headers:{"content-type":"text/javascript"}});
  return new Response(Bun.file(join(dir,p)),{headers:{"content-type":"text/javascript"}});
 }});
 try{page=await launch();}catch{page=await launch();}
},90_000);
afterAll(async()=>{await page?.close();server?.stop(true);if(dir)rmSync(dir,{recursive:true,force:true});});
async function open(landscape:boolean,dark:boolean){
 const p=page!;const width=(landscape?11.6929:8.2677)*96-96,height=(landscape?8.2677:11.6929)*96-96;
 await p.viewport(Math.round(width),Math.round(height));await p.dark(dark);
 await p.send("Emulation.setEmulatedMedia",{media:"print",features:[{name:"prefers-color-scheme",value:dark?"dark":"light"}]});
 await p.goto("http://127.0.0.1:"+server!.port+"/");await p.eval("document.fonts.ready.then(()=>true)");await p.sleep(500);return{p,height};
}
test.skipIf(!withBrowser)("print: the example host's style buttons, Source and LLM views do not print",async()=>{
 const {p}=await open(false,false);
 const shown=await p.eval<string[]>('[...document.querySelectorAll(".ex-head,.ex-tools,.ex-views,.ex-crumb")].filter(e=>e.checkVisibility({visibilityProperty:true})).map(e=>e.className)');
 expect(shown).toEqual([]);
},30_000);
test.skipIf(!withBrowser)("print: A4 keeps a scene caption with its drawing, portrait and landscape in both themes",async()=>{
 for(const landscape of[false,true])for(const dark of[false,true]){
  const {p,height}=await open(landscape,dark);
  const fit=await p.eval<{figure:number;spacer:number}>(`(()=>{const f=document.querySelector("figure.part-animation"),cap=f.querySelector(".dh-static-cap"),r=f.getBoundingClientRect(),c=cap.getBoundingClientRect();const spacer=Math.max(0,${height}-c.top-c.height/2);document.getElementById("spacer").style.height=spacer+"px";return{figure:r.height,spacer};})()`);
  expect(fit.figure).toBeLessThan(height);expect(fit.spacer).toBeGreaterThan(0);
  const pdf=await p.send("Page.printToPDF",{paperWidth:8.2677,paperHeight:11.6929,landscape,marginTop:0.5,marginBottom:0.5,marginLeft:0.5,marginRight:0.5,printBackground:true,displayHeaderFooter:false});
  const pages=await p.eval<{texts:string[];sizes:number[][]}>(`(async()=>{const lib=await import("/pdf.mjs");globalThis.pdfjsWorker=await import("/pdf.worker.mjs");lib.GlobalWorkerOptions.workerSrc="/pdf.worker.mjs";const bytes=Uint8Array.from(atob(${JSON.stringify(pdf.data)}),c=>c.charCodeAt(0));const task=lib.getDocument({data:bytes,isEvalSupported:false,useSystemFonts:true});const doc=await task.promise;const texts=[],sizes=[];for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i);texts.push((await p.getTextContent()).items.map(x=>x.str||"").join(" ").replace(/\\s+/g," "));sizes.push(p.view.slice(2));}await task.destroy();return{texts,sizes};})()`);
  const drawn=pages.texts.findIndex(s=>s.includes("pages ready")),caption=pages.texts.findIndex(s=>s.includes("The handler builds the page"));
  expect(drawn,JSON.stringify(pages.texts)).toBeGreaterThanOrEqual(0);expect(caption).toBe(drawn);
  expect(pages.texts.join(" ")).not.toContain("Source");expect(pages.texts.join(" ")).not.toContain("LLM view");
  for(const size of pages.sizes){expect(Math.abs(Math.min(...size)-595.28)).toBeLessThan(1);expect(Math.abs(Math.max(...size)-841.89)).toBeLessThan(1);}
  if(process.env.DH_PRINT_OUTPUT)await Bun.write(join(process.env.DH_PRINT_OUTPUT,"scene-A4-"+(landscape?"landscape":"portrait")+"-"+(dark?"dark":"light")+".pdf"),Buffer.from(pdf.data,"base64"));
 }
},120_000);

test.skipIf(!withBrowser)("screen: the example inspection controls remain available after printing",async()=>{const p=page!;await p.send("Emulation.setEmulatedMedia",{media:"screen",features:[]});await p.viewport(1280,900);await p.goto("http://127.0.0.1:"+server!.port+"/");const shown=await p.eval<number>('[...document.querySelectorAll(".ex-head,.ex-tools,.ex-views,.ex-crumb")].filter(e=>e.checkVisibility({visibilityProperty:true})).length');expect(shown).toBe(4);},30_000);
