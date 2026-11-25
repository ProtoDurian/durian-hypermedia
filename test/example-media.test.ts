import {beforeAll,afterAll,test,expect} from "bun:test";
import {mkdtempSync,readFileSync,readdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
const root=resolve(import.meta.dir,".."),parts=join(root,"src/parts");
const samples=["audio","compare-image","gallery","lottie","pdf","video"];
let out="",origin="",server:ReturnType<typeof Bun.spawn>|undefined;
beforeAll(async()=>{
 out=mkdtempSync(join(tmpdir(),"dh-example-media-"));
 const build=Bun.spawn([process.execPath,join(root,"example/build.tsx"),out],{cwd:root,stdout:"pipe",stderr:"pipe"});
 const [status,stdout,stderr]=await Promise.all([build.exited,new Response(build.stdout).text(),new Response(build.stderr).text()]);
 if(status)throw new Error("example build failed: "+stdout+stderr);
 const probe=Bun.serve({port:0,hostname:"127.0.0.1",fetch:()=>new Response("")}),port=probe.port;probe.stop(true);
 origin="http://127.0.0.1:"+port;
 server=Bun.spawn([process.execPath,join(root,"example/serve.ts"),out,String(port),"--trusted-types"],{cwd:root,stdout:"ignore",stderr:"pipe"});
 for(let i=0;i<100;i++){try{if((await fetch(origin+"/index.html")).ok)return;}catch{}await Bun.sleep(50);}
 throw new Error("example server did not start");
},120_000);
afterAll(async()=>{server?.kill();await server?.exited;if(out)rmSync(out,{recursive:true,force:true});});
test("the built example ships every part's sample media unchanged",async()=>{
 for(const name of samples)for(const file of readdirSync(join(parts,name,"media"))){
  const source=readFileSync(join(parts,name,"media",file));
  const response=await fetch(origin+"/media/"+file);
  expect(response.status,name+"/"+file).toBe(200);
  expect(new Uint8Array(await response.arrayBuffer()),name+"/"+file).toEqual(new Uint8Array(source));
 }
});
test("every local media URL in the five rich samples resolves on the served example",async()=>{
 for(const name of samples.filter(n=>n!=="audio")){
  const sample=readFileSync(join(parts,name,"sample.md"),"utf8");
  const paths=[...new Set(sample.match(/media\/[A-Za-z0-9_.-]+/g))];
  expect(paths.length,name).toBeGreaterThan(0);
  for(const path of paths){const response=await fetch(origin+"/"+path);expect(response.status,path).toBe(200);expect((await response.arrayBuffer()).byteLength,path).toBeGreaterThan(0);}
 }
});
