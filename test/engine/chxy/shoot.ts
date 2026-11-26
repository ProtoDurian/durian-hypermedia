// usage: bun test/engine/chxy/shoot.ts <dir with gallery-*.html> : screenshots each fence's section, light and dark, to <dir>/shots
import { launch } from "../../../scripts/cdp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const dir = process.argv[2]; mkdirSync(join(dir, "shots"), { recursive: true });
const only = process.argv[3];
const srv = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (r) => { const p = new URL(r.url).pathname; return p.endsWith(".html") ? new Response(Bun.file(join(dir, p.slice(1)))) : new Response("", { status: 404 }); } });
const page = await launch();
try {
  for (const [w, mobile] of [[640, false], [350, true]] as const) for (const dark of [false, true]) {
    await page.viewport(w + 24, 900, mobile); await page.dark(dark);
    await page.goto(`http://127.0.0.1:${srv.port}/gallery-${w}.html`); await page.sleep(500);
    const names = await page.eval<string[]>(`[...document.querySelectorAll('section')].map(s=>s.dataset.name)`);
    for (let i = 0; i < names.length; i++) {
      if (only && !names[i].includes(only)) continue;
      const r = await page.eval<any>(`(()=>{const s=document.querySelectorAll('section')[${i}];s.scrollIntoView();const b=s.getBoundingClientRect();return {x:b.left+scrollX,y:b.top+scrollY,width:b.width,height:b.height}})()`);
      await page.shot(join(dir, "shots", `${names[i].replace(/[^\w.-]/g, "_")}-${w}${dark ? "-dark" : ""}.png`), { x: Math.max(0, r.x - 4), y: Math.max(0, r.y - 4), width: Math.min(w + 20, r.width + 8), height: r.height + 8 });
    }
  }
} finally { await page.close(); srv.stop(true); }
