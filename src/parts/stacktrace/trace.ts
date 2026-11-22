import type { Budget } from "../../core/budget";
import { hasLib, type Trace } from "./scan";
export * from "./scan";
/** mark which frames are the author's own code: app= (a prefix of the module, package, path or function), else not a library */
export function markApp(t: Trace, app: string | undefined, budget?: Budget): number {
  let hits = 0;
  budget?.charge((app?.length ?? 0) + 1);
  const ps = (app ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const bl of t.blocks) for (const f of bl.frames) {
    budget?.charge(1 + (f.file.length + f.fn.length + f.pkg.length) * (ps.length + 1));
    // a vendored folder (node_modules, vendor, site-packages) inside your app folder stays a library
    const byApp = !hasLib(f.file) && ps.some((p) => f.pkg.startsWith(p) || f.file.includes(p) || f.fn.startsWith(p) || f.file.replace(/^package:/, "").startsWith(p));
    f.app = ps.length ? byApp : !f.lib;
    if (byApp) hits++;
    if (ps.length && byApp) f.lib = false;
  }
  return hits;
}
export function stripPath(file: string, strip: string | undefined): string {
  if (!strip) return file;
  const f = file.replace(/^file:\/\//, "");
  return f.startsWith(strip) ? f.slice(strip.length) : f;
}

/** Inspect each token once; patterns have disjoint, bounded prefixes. */
export function secretIn(text: string, budget?: Budget): string | null {
 budget?.charge(text.length);
 if (/AKIA[0-9A-Z]{16}/.test(text)) return "an AWS access key";
 if (text.includes("-----BEGIN ") && text.includes("PRIVATE KEY-----")) return "a private key";
 const tokens = text.split(/[\s,;"\x27(){}\[\]]+/);
 for (let i = 0; i < tokens.length; i++) { const t = tokens[i]; budget?.charge(1 + t.length);
 const value=t.slice(Math.max(t.lastIndexOf("="),t.lastIndexOf(":"))+1);
 if (/^AKIA[0-9A-Z]{16}/.test(value)) return "an AWS access key";
 if (/^gh[pousr]_[A-Za-z0-9]{20,}/.test(value)) return "a GitHub token";
 if (/^xox[abp]-[A-Za-z0-9-]{10,}/.test(value)) return "a Slack token";
 if (t === "Bearer" && (tokens[i + 1]?.length ?? 0) >= 24) return "a bearer token";
 const eq=t.search(/[:=]/); if(eq>=0 && ["api_key","api-key","apikey","secret","passwd","password","token"].includes(t.slice(0,eq).toLowerCase()) && (t.length-eq-1>=12 || (tokens[i+1]?.length??0)>=12)) return "a key, token or password";
 if(["api_key","api-key","apikey","secret","passwd","password","token"].includes(t.toLowerCase()) && /^[=:]/.test(tokens[i+1]??"") && ((tokens[i+1]?.length??0)>12||(tokens[i+2]?.length??0)>=12))return "a key, token or password";
 if(value.startsWith("eyJ") && value.split(".").length===3 && value.length>=29) return "a signed token (JWT)";
 } return null;
}

/** the LLM view: the trace as written; over 400 tokens, each run of library frames becomes one line (llm=full keeps every line) */
export function traceLlm(body: string, info: string, attrs: Record<string, string>, t: Trace, budget?: Budget): string {
  budget?.charge(body.length + 1, 0, body.length);
  let end = body.length; while (end > 0 && body[end - 1] === "\n") end--;
  const trimmed = body.slice(0, end);
  const fence = "```";
  const asWritten = `${fence}${info}\n${trimmed}\n${fence}`;
  if (attrs.llm === "full" || Math.round(asWritten.length / 4) <= 400) return asWritten;
  const keepRaw = new Set<string>(); const runs = new Map<string, string>();
  for (const bl of t.blocks) {
    budget?.charge(bl.frames.length * 4 + 1, bl.frames.length);
    let i = 0;
    while (i < bl.frames.length) {
      if (!bl.frames[i].lib) { keepRaw.add(bl.frames[i].raw); i++; continue; }
      let j = i; while (j < bl.frames.length && bl.frames[j].lib) j++;
      const pk = [...new Set(bl.frames.slice(i, j).map((f) => f.pkg.split("/").slice(0, 2).join("/")))].slice(0, 4).join(", ");
      runs.set(bl.frames[i].raw, `... ${j - i} library frame${j - i === 1 ? "" : "s"} (${pk})`);
      for (let k = i + 1; k < j; k++) runs.set(bl.frames[k].raw, "");
      i = j;
    }
  }
  const out: string[] = [];
  for (const l of trimmed.split("\n")) { if (runs.has(l)) { const r = runs.get(l)!; if (r) out.push(r); } else out.push(l); }
  return `${fence}${info}\n${out.join("\n")}\n${fence}`;
}
