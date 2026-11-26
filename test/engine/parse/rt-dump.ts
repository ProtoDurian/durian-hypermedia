import { allFixtureFences } from "./fixtures";
import { lowerBlock } from "../../../src/engine/parse/migrate";
import { print12 } from "../../../src/engine/parse/print12";
import { parse12 } from "../../../src/engine/parse/parse12";
import { shape } from "./roundtrip";
const re = new RegExp(process.argv[2] ?? "."); const verbose = process.argv[3] === "v";
for (const f of allFixtureFences()) { if (f.id.startsWith("hostile/") || !re.test(f.id)) continue;
  const m1 = lowerBlock(f.src); const text = print12(m1);
  const roles = { ...f.src.roles }; for (const [k, v] of Object.entries(m1.roles)) if (!(k in roles)) roles[k] = v.colour || 1;
  const fence = { ...f.src.fence }; if (m1.origin === "graph10" && !fence.look) fence.look = "classic";
  const m2 = parse12({ body: text, line0: 1, fence, roles, format12: true });
  const pr = m2.problems.filter((p) => !p.warn); const a = shape(m1) as any, b = shape(m2) as any;
  const bad: string[] = pr.map((p) => `PROBLEM ${p.line}: ${p.msg} | ${text.split("\n")[p.line - 1]}`);
  for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
    if (Array.isArray(a[k])) { const n = Math.max(a[k].length, b[k].length); for (let i = 0; i < n; i++) if (JSON.stringify(a[k][i]) !== JSON.stringify(b[k][i])) { bad.push(`DIFF ${k}[${i}]\n   was ${JSON.stringify(a[k][i])?.slice(0, 400)}\n   now ${JSON.stringify(b[k][i])?.slice(0, 400)}`); break; } }
    else bad.push(`DIFF ${k}\n   was ${JSON.stringify(a[k]).slice(0, 300)}\n   now ${JSON.stringify(b[k]).slice(0, 300)}`);
  }
  if (bad.length) { console.log("##", f.id); for (const x of bad.slice(0, 4)) console.log(" ", x); if (verbose) console.log(text); }
}
