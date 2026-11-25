// The example site's resolver for references (format version 11): a few parts kept here, as a host keeps them in its
// own store. Nothing is fetched. It answers ready, pending or failed, so every look of a reference is on one page.
import type { ResolveReference } from "../src/index";

const F = "```";
const parts: Record<string, string> = {
  "chart:revenue-2026": `${F}chart\nkind: bar\ntitle: Revenue by month, 2026\nx: [Jan, Feb, Mar, Apr]\ny: { label: thousand }\nseries:\n  - name: revenue\n    data: [12, 15, 14, 19]\n${F}`,
  "interactive:compound-growth": [
    "@html",
    `<label>Growth <input id="g" type="range" min="0" max="50" value="20"></label> <output id="o"></output>`,
    "@script",
    `const g = document.getElementById("g"), o = document.getElementById("o");`,
    `const draw = () => { o.textContent = g.value + "%"; };`,
    `g.addEventListener("input", draw); draw();`,
    "@fallback",
    "Revenue grows 20% a year: year 5 is about **2.07 times** year 1.",
  ].join("\n"),
  "svg:architecture.dark": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80" width="240" height="80"><rect x="4" y="20" width="70" height="40" rx="8" fill="#8D94FF"/><rect x="166" y="20" width="70" height="40" rx="8" fill="#2DD4BF"/><path d="M76 40h88" stroke="#98A3BC" stroke-width="3"/></svg>`,
};
const pending = new Set(["terminal:build-42"]);

export const exampleRefs: ResolveReference = ({ type, name }) => {
  const k = `${type}:${name}`;
  if (pending.has(k)) return { state: "pending" };
  // the SVG stays unresolved here: an <img> with a data: address needs img-src data:, and this site's CSP is img-src 'self'
  if (type === "svg") return null;
  return parts[k] != null ? { state: "ready", part: parts[k] } : { state: "failed", reason: "this example keeps no such part" };
};
export const exampleSvg = parts["svg:architecture.dark"];
