// A stand-in for node:path (POSIX rules), pure, so the parser runs in a browser or a worker too.
const norm = (p: string): string => {
  const abs = p.startsWith("/");
  const out: string[] = [];
  for (const s of p.split("/")) {
    if (!s || s === ".") continue;
    if (s === "..") { if (out.length && out[out.length - 1] !== "..") out.pop(); else if (!abs) out.push(".."); continue; }
    out.push(s);
  }
  return (abs ? "/" : "") + out.join("/") || (abs ? "/" : ".");
};
export function join(...parts: string[]): string { return norm(parts.filter(Boolean).join("/")); }
export function resolve(...parts: string[]): string {
  let acc = "";
  for (const p of parts) acc = p.startsWith("/") ? p : acc ? `${acc}/${p}` : p;
  return norm(acc.startsWith("/") ? acc : `/${acc}`);
}
export function dirname(p: string): string { const n = norm(p); const i = n.lastIndexOf("/"); return i < 0 ? "." : i === 0 ? "/" : n.slice(0, i); }
export function basename(p: string, ext?: string): string { const b = norm(p).split("/").pop() ?? ""; return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b; }
export function extname(p: string): string { const b = basename(p); const i = b.lastIndexOf("."); return i <= 0 ? "" : b.slice(i); }
export function relative(from: string, to: string): string {
  const a = resolve(from).split("/").filter(Boolean), b = resolve(to).split("/").filter(Boolean);
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => ".."), ...b.slice(i)].join("/");
}
export default { join, resolve, dirname, basename, extname, relative };
