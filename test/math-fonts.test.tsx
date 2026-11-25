import {beforeAll,afterAll,test,expect}from"bun:test";
import{which}from"bun";import{readFileSync}from"node:fs";import{join}from"node:path";
import{partPage}from"./places-page";import{buildCss}from"../scripts/build-css";
const root=join(import.meta.dir,".."),withBrowser=!!which("google-chrome")&&process.env.DH_CDP_TEST!=="0";
let site:Awaited<ReturnType<typeof partPage>>;
beforeAll(async()=>{if(withBrowser)site=await partPage(readFileSync(join(root,"src/parts/math/sample.md"),"utf8"));},90_000);
afterAll(async()=>{await site?.close();});
test("the example supplies real KaTeX WOFF2 faces and their licence; the package supplies no fonts",()=>{
 const css=readFileSync(join(root,"example/site.css"),"utf8");
 for(const name of["Main-Regular","Main-Italic","Main-Bold","Main-BoldItalic"]){
  const file="KaTeX_"+name+".woff2";
  expect(css).toContain('url("fonts/'+file+'")');
  expect(readFileSync(join(root,"example/fonts",file)).toString("ascii",0,4)).toBe("wOF2");
 }
 const licence=readFileSync(join(root,"example/fonts/OFL-KaTeX.txt"),"utf8");
 expect(licence).toContain("SIL OPEN FONT LICENSE Version 1.1");expect(licence).toContain("Khan Academy");expect(licence).toContain("Reserved Font Name");
 expect(buildCss()).not.toContain("@font-face");
 expect(JSON.parse(readFileSync(join(root,"package.json"),"utf8")).files).not.toContain("example");
 for(const doc of["ADOPT.md","THEME.md","SPEC.md"])expect(readFileSync(join(root,doc),"utf8"),doc).toContain("KaTeX_Main");
});
test.skipIf(!withBrowser)("maths uses its self-hosted face; the exponent stays above b under the root at desktop and phone widths",async()=>{
 for(const width of[1280,390,360])for(const dark of[false,true]){
  await site.open(width,dark);
  const got=await site.page.eval<any>('(()=>{const sqrt=document.querySelector("msqrt"),power=sqrt.querySelector("msup"),b=power.querySelector("mi").getBoundingClientRect(),n=power.querySelector("mn").getBoundingClientRect(),r=sqrt.getBoundingClientRect(),m=sqrt.closest("math").getBoundingClientRect(),box=sqrt.closest(".math-block").getBoundingClientRect();return{faces:[...document.fonts].filter(f=>f.family.replaceAll(String.fromCharCode(34),"")==="KaTeX_Main"&&f.status==="loaded").length,requests:performance.getEntriesByType("resource").filter(x=>x.name.includes("/fonts/KaTeX_Main-")).length,b:b.toJSON(),n:n.toJSON(),r:r.toJSON(),m:m.toJSON(),box:box.toJSON(),operators:[...document.querySelectorAll("mo")].map(e=>e.textContent),matrix:document.querySelector("mtable").getBoundingClientRect().toJSON(),overflow:document.documentElement.scrollWidth>innerWidth}})()');
  expect(got.operators).toContain("±");expect(got.operators).toContain("−");expect(got.operators).toContain("∑");expect(got.matrix.right).toBeLessThanOrEqual(got.box.right);
  expect(got.faces).toBeGreaterThan(0);expect(got.requests).toBeGreaterThan(0);
  expect(got.n.top).toBeLessThan(got.b.top);expect(got.n.bottom).toBeLessThan(got.b.bottom);expect(got.n.left).toBeGreaterThanOrEqual(got.b.right-1);
  expect(got.r.top).toBeLessThanOrEqual(got.n.top);expect(got.r.right).toBeGreaterThanOrEqual(got.n.right);
  expect(got.m.left).toBeGreaterThanOrEqual(got.box.left);expect(got.m.right).toBeLessThanOrEqual(got.box.right);expect(got.overflow).toBe(false);
  expect(await site.issues()).toEqual({errors:[],csp:[]});
  if(process.env.DH_MATH_SHOTS)await site.page.shot(join(process.env.DH_MATH_SHOTS,"math-"+width+"-"+(dark?"dark":"light")+".png"));
 }
},90_000);
