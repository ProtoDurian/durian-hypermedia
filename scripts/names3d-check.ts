// Names on the 3D stage, at rest on every step of every 3D animation of a built example (SPEC.md 6.14): two words under
// 4 px apart, a word on a token's dot, two names on one line under 16 px apart (read as one phrase), and a box's name
// nearer another thing's outline than its own are listed (with strict, they fail the check). Also counted (reported, not failed): words on a line or an
// outline, names lost, things cut by the stage's edge, pills away from their cube or outside its box.
// Words are the label elements on the stage, as a reader sees them; things come from the stage's test hook (dh3corners).
//   bun scripts/names3d-check.ts [example dist dir] [w=1280,390] [only=<regex on page file>] [strict]
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { launch, type Page } from "./cdp";

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.includes("=")).map((a) => [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)]));
const dist = resolve(args.find((a) => !a.includes("=") && a !== "strict") ?? join(import.meta.dir, "../example/dist"));
const widths = (opt.w ?? "1280,390").split(",").map(Number);
const pages = readdirSync(dist).filter((f) => /^format-\d+-3d-.*\.html$/.test(f) && (!opt.only || new RegExp(opt.only).test(f))).sort();
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
  const path = resolve(dist, decodeURIComponent(new URL(req.url).pathname.slice(1)));
  if (!path.startsWith(dist + "/")) return new Response(null, { status: 404 });
  const f = Bun.file(path);
  return (await f.exists()) ? new Response(f) : new Response(null, { status: 404 });
} });

const to3d = async (p: Page, SC: string) => {
  for (let k = 0; k < 40; k++) { if (await p.eval<boolean>(`!!${SC}.querySelector('.scn-mode, .scn3')`)) break; await p.sleep(250); }
  if (!(await p.eval<boolean>(`!!${SC}.querySelector('.scn3')`))) await p.eval(`${SC}.querySelector('.scn-mode').click()`);
  for (let k = 0; k < 40; k++) { await p.sleep(250); if (await p.eval<boolean>(`!!${SC}.querySelector('.scn3-canvas') && !${SC}.querySelector('.scn3-loading')`)) break; }
  await p.sleep(2500);
};

let failed = 0;
const total = { steps: 0, wordWord: 0, wordDot: 0, phrase: 0, nearer: 0, wordLine: 0, wordOutline: 0, lost: 0, float: 0, outside: 0, cut: 0 };
const p = await launch();
try {
  for (const W of widths) {
    await p.viewport(W, W < 500 ? 844 : 900, W < 500);
    for (const page of pages) {
      await p.goto(`http://127.0.0.1:${server.port}/${page}`); await p.sleep(1500);
      const scenes = await p.eval<number>("document.querySelectorAll('.scn').length");
      for (let i = 0; i < scenes; i++) {
        const SC = `document.querySelectorAll('.scn')[${i}]`;
        if (!(await p.eval<boolean>(`!!${SC}.querySelector('.scn-mode, .scn3') || ${SC}.dataset.variant != null`))) continue;
        await p.eval(`${SC}.scrollIntoView({block:'center'})`); await p.sleep(300);
        for (let q = 0; q < 80 && !(await p.eval<boolean>(`${SC}.hasAttribute('data-live')`)); q++) await p.sleep(250);
        if (!(await p.eval<boolean>(`!!${SC}.querySelector('.scn-mode, .scn3')`))) continue; // no 3D
        await to3d(p, SC); await p.eval(`${SC}.scrollIntoView({block:'center'})`); await p.sleep(300);
        const n = await p.eval<number>(`${SC}.querySelectorAll('.scn-steps li').length || 1`);
        const bad: string[] = [];
        for (let k = 1; k <= n; k++) {
          if (k > 1) await p.eval(`${SC}.querySelector('.btn-go').click()`);
          await p.sleep(900);
          for (let q = 0; q < 30 && !(await p.eval<boolean>(`!!${SC}.querySelector('.scn3')?.dh3corners()?.still`)); q++) await p.sleep(200);
          await p.sleep(700);
          // at rest means the names too: wait until no name's opacity has changed for 1 s, at most 8 s
          { let last = "", same = 0; for (let q = 0; q < 32 && same < 4; q++) { const sig = await p.eval<string>(`[...${SC}.querySelectorAll('.scn3-labels > *')].map((e)=>getComputedStyle(e).opacity).join(',')`); same = sig === last ? same + 1 : 0; last = sig; await p.sleep(250); } }
          const r = await p.eval<any>(`(()=>{const s=${SC},h=s.querySelector('.scn3'),d=h.dh3corners(true),hr=h.getBoundingClientRect(),T=/^$/;
            const words=[...h.querySelectorAll('.scn3-labels > *')].map((e)=>{const r=e.getBoundingClientRect(),o=+getComputedStyle(e).opacity;return{t:e.textContent.trim(),x:r.left-hr.left,y:r.top-hr.top,w:r.width,h:r.height,o}}).filter((w)=>w.t&&w.w>0&&w.o>0.5&&w.x+w.w>0&&w.x<hr.width&&w.y+w.h>0&&w.y<hr.height);
            const bb=(c)=>{const xs=c.map((q)=>q.x),ys=c.map((q)=>q.y);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)}};
            const things=d.things.filter((t)=>t.op==null||t.op>0.02).map((t)=>({key:t.key,name:t.name,tok:t.kind?t.kind==='token':T.test(t.name),cont:!!t.cont,parent:t.parent??null,op:t.op??1,b:bb(t.c),c:t.c}));
            // a layer plane is a thing too: whole or left out
            for(const q of d.planes||[])things.push({key:-1-q.L,name:'plane '+q.name,tok:false,cont:true,op:1,b:bb(q.c),c:q.c,plane:true});
            // the shaded edges (a side with more): a thing under one is half hidden too
            const bands=[...s.querySelectorAll('.scn-more span')].map((e)=>{const r=e.getBoundingClientRect();return{x:r.left-hr.left,y:r.top-hr.top,w:r.width,h:r.height}}).filter((b)=>b.w>0&&b.h>0);
            const over=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>2&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>2;
            const sep=(a,b)=>Math.max(b.x-(a.x+a.w),a.x-(b.x+b.w),b.y-(a.y+a.h),a.y-(b.y+b.h));
            const ww=[],wd=[],cut=[],wl=[];
            // a word on a drawn line that does not end at its own thing (points every 2 px along each segment)
            for(const w of words){const own=things.find((t)=>t.name===w.t)?.key;for(const l of d.lines||[]){if(own!=null&&l.ends.includes(own))continue;let hit=false;for(let q=1;q<l.p.length&&!hit;q++){const a=l.p[q-1],b=l.p[q],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/2));for(let m=0;m<=n;m++){const x=a.x+(b.x-a.x)*m/n,y=a.y+(b.y-a.y)*m/n;if(x>w.x-1&&x<w.x+w.w+1&&y>w.y-1&&y<w.y+w.h+1){hit=true;break}}}if(hit){wl.push(w.t);break}}}
            for(let a=0;a<words.length;a++)for(let b=a+1;b<words.length;b++){const g=sep(words[a],words[b]);if(g<4)ww.push(words[a].t+' / '+words[b].t+' '+g.toFixed(1))}
            for(const t of things.filter((t)=>t.tok))for(const w of words){if(w.t===t.name&&!T.test(w.t))continue;const g=sep(w,t.b);if(g<4)wd.push(w.t+' / dot of '+t.name+' '+g.toFixed(1))}
            // a word 4 px clear of every outline (box edges as drawn; a pill too); its own box's only for a container's name
            const wo=[],segIn=(a,b,r)=>{const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/2));for(let m=0;m<=n;m++){const x=a.x+(b.x-a.x)*m/n,y=a.y+(b.y-a.y)*m/n;if(x>r.x-4&&x<r.x+r.w+4&&y>r.y-4&&y<r.y+r.h+4)return true}return false};
            for(const w of words){const tk=things.find((x)=>x.tok&&x.name===w.t);for(const t of things){if(t.tok||t.op<0.3)continue;if(t.name===w.t)continue;if(tk&&tk.parent!=null&&t.key===tk.parent)continue;const own=things.find((x)=>x.name===w.t&&!x.cont&&!x.tok),inOwn=(q)=>own&&q.x>=own.b.x-1&&q.x<=own.b.x+own.b.w+1&&q.y>=own.b.y-1&&q.y<=own.b.y+own.b.h+1;let hit=false;for(let i=0;i<8&&!hit;i++)for(const bit of [1,2,4])if(!(i&bit)&&!(inOwn(t.c[i])&&inOwn(t.c[i|bit]))&&segIn(t.c[i],t.c[i|bit],w)){hit=true;break}if(hit){wo.push(w.t+' / outline of '+t.name);break}}}
            // two names on one line less than 16 px apart read as one phrase
            const ph=[];for(let i=0;i<words.length;i++)for(let j=i+1;j<words.length;j++){const a=words[i],b=words[j],ov=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);if(ov<0.5*Math.min(a.h,b.h))continue;const gap=Math.max(b.x-(a.x+a.w),a.x-(b.x+b.w));if(gap<16)ph.push(a.t+' + '+b.t+' '+gap.toFixed(1))}
            // a word more than 14 px from its own thing's drawn box (floats free of it)
            const fl=[];for(const w of words){const t=things.find((x)=>x.name===w.t&&!x.plane&&!x.tok);if(!t)continue;const b=t.b;if(!(w.x<b.x+b.w+14&&b.x<w.x+w.w+14&&w.y<b.y+b.h+14&&b.y<w.y+w.h+14))fl.push(w.t)}
            // a pill more than 24 px from its own cube as drawn
            // against its own cube among the drawn things: d.dots holds only tokens in flight, so at rest this found
            // no cube and counted nothing (a pill 40 px off passed)
            for(const w of words){if(!T.test(w.t))continue;const own=things.find((x)=>x.tok&&x.name===w.t);if(!own)continue;const b=own.b,gx=Math.max(w.x-(b.x+b.w),b.x-(w.x+w.w),0),gy=Math.max(w.y-(b.y+b.h),b.y-(w.y+w.h),0);if(Math.hypot(gx,gy)>24)fl.push(w.t+' '+Math.hypot(gx,gy).toFixed(0)+' px')}
            // a box's name is nearest its own box: its middle closer to its own drawn edges than to any other's
            const nn=[],sd=(q,a,b)=>{const vx=b.x-a.x,vy=b.y-a.y,L=vx*vx+vy*vy||1,t=Math.max(0,Math.min(1,((q.x-a.x)*vx+(q.y-a.y)*vy)/L));return Math.hypot(a.x+t*vx-q.x,a.y+t*vy-q.y)},edgeD=(q,t)=>{let m=Infinity;for(let i=0;i<8;i++)for(const bit of [1,2,4])if(!(i&bit))m=Math.min(m,sd(q,t.c[i],t.c[i|bit]));return m};
            for(const w of words){const own=things.find((x)=>x.name===w.t&&!x.tok&&!x.plane);if(!own)continue;const q={x:w.x+w.w/2,y:w.y+w.h/2},mo=edgeD(q,own);const other=things.filter((x)=>x!==own&&!x.tok&&x.op>0.3).find((x)=>edgeD(q,x)<mo);if(other)nn.push(w.t+' nearer '+other.name)}
            // the one exception, counted and listed: a pill whose middle stands outside its cube's box
            const out=[];for(const w of words){const tk=things.find((x)=>x.tok&&x.name===w.t);if(!tk||tk.parent==null)continue;const bx=things.find((x)=>x.key===tk.parent);if(!bx)continue;const cx=w.x+w.w/2,cy=w.y+w.h/2,b=bx.b;if(!(cx>=b.x&&cx<=b.x+b.w&&cy>=b.y&&cy<=b.y+b.h))out.push(w.t+' outside '+bx.name)}
            // a crisp thing whose name does not show (a placer that gave up hides it)
            // lost = no name a reader sees (over half strength), measured once the names stand still (a step can hide its
            // names for a moment while its tokens split)
            const lost=things.filter((t)=>!t.tok&&!t.plane&&t.op>0.3&&t.name&&!words.some((w)=>w.t===t.name)).map((t)=>t.name);
            for(const t of things){const b=t.b,inX=b.x+b.w>1&&b.x<hr.width-1,inY=b.y+b.h>1&&b.y<hr.height-1;if(inX&&inY&&(b.x<-2||b.y<-2||b.x+b.w>hr.width+2||b.y+b.h>hr.height+2||bands.some((q)=>over(q,b))))cut.push(t.name)}
            const pills=words.filter((w)=>T.test(w.t)).map((w)=>w.t);
            let card=s.parentElement;while(card&&card.tagName!=='SECTION')card=card.parentElement;const cr=card?card.getBoundingClientRect():null,sr=s.getBoundingClientRect();
            const wide=cr?Math.max(0,cr.left-sr.left,sr.right-cr.right):0;
            return{pills,ww,wd,wl,wo,lost,ph,fl,nn,out,cut:[...new Set(cut)],wide:Math.round(wide),cam:h.dataset.cam}})()`);
          total.steps++; total.wordWord += r.ww.length; total.wordDot += r.wd.length; total.phrase += r.ph.length; total.nearer += r.nn.length;
          total.wordLine += r.wl.length; total.wordOutline += r.wo.length; total.lost += r.lost.length; total.float += r.fl.length; total.outside += r.out.length; total.cut += r.cut.length;
          for (const [name, xs] of [["words under 4 px", r.ww], ["on a dot", r.wd], ["one phrase", r.ph], ["nearer another", r.nn]] as [string, string[]][]) if (xs.length) bad.push(`step ${k} ${name}: ${xs.join("; ")}`);
        }
        failed += bad.length;
        console.log(`${bad.length ? "FAIL" : "ok  "} ${W} ${page} #${i}: ${n} steps${bad.length ? "\n  " + bad.join("\n  ") : ""}`);
      }
    }
  }
} finally { await p.close(); server.stop(true); }
console.log(`names3d: ${JSON.stringify(total)}`);
process.exit(failed && args.includes("strict") ? 1 : 0);
