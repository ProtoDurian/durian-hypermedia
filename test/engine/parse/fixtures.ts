// Test helper (lane parse): every ```animation fence of the repo's fixtures as an EngineSrc.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDoc } from "../../../src/core/dh-lib";
import { pageRoles } from "../../../src/core/stage-roles";
import type { EngineSrc } from "../../../src/engine/types";

export const ROOT = join(import.meta.dir, "../../..");
export interface Fence { id: string; file: string; n: number; src: EngineSrc; text: string }

function walk(nodes: any[], out: any[]) { for (const n of nodes) { if (n?.kind === "part") { out.push(n); if (n.nodes) walk(n.nodes, out); if (n.items) for (const it of n.items) walk(it.nodes, out); } } }

export function fencesOf(path: string, text = readFileSync(path, "utf8"), label = path): Fence[] {
  let doc; try { doc = parseDoc(path, text); } catch { return []; } // a hostile page the host refuses whole
  const parts: any[] = []; walk(doc.body, parts);
  const roles = pageRoles(doc.fm).roles;
  const format12 = String((doc.fm ?? {}).format ?? "") === "12";
  const out: Fence[] = [];
  let n = 0;
  for (const p of parts) {
    if (p.name !== "animation") continue;
    n++;
    out.push({ id: `${label}#${n}`, file: label, n, text: p.source, src: { body: p.body, line0: p.bodyLine, fence: { ...p.attrs }, roles, format12 } });
  }
  return out;
}

export function allFixtureFences(): Fence[] {
  const out: Fence[] = [];
  for (const dir of ["format", "stage", "parts", "hostile", "."]) {
    const d = join(ROOT, "fixtures", dir);
    let names: string[] = [];
    try { names = readdirSync(d).filter((f) => f.endsWith(".dh.md")).sort(); } catch { continue; }
    for (const f of names) out.push(...fencesOf(join(d, f), undefined, `${dir === "." ? "" : dir + "/"}${f.replace(/\.dh\.md$/, "")}`));
  }
  return out;
}

/** the 22 generality scenes (made-up content): 12 plus 10 tweaked, each as an old-form page */
export function gtFences(): Fence[] {
  const out: Fence[] = [];
  for (const dir of ["gt", "gt/tweaked"]) {
    const d = join(ROOT, "test/engine/parse", dir);
    for (const f of readdirSync(d).filter((x) => x.endsWith(".dh.md")).sort()) out.push(...fencesOf(join(d, f), undefined, `${dir}/${f.replace(/\.dh\.md$/, "")}`));
  }
  return out;
}
