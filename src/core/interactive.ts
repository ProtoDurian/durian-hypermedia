// The interactive part (format version 11): a small component the host keeps (HTML, CSS, script) that a reference
// `[[interactive:<name> "label"]]` stands for. It exists only as a reference: its code never sits in the page.
// This file is pure: it reads the part's sections, refuses what would reach out or keep state, and builds the frame's
// page. The React entry (src/react/interactive.tsx) runs it in a sandboxed frame with its own empty origin, and only when
// the host turns it on.
//
// The source the host answers with:
//   @html                      the markup (no <script>: the script goes under @script)
//   @css                       the styles
//   @script                    the script (it runs only with interactive="on")
//   @fallback                  optional Markdown shown when it does not run (else the reference's label)
// Work: one pass over the lines to split them, then a fixed list of plain word searches per section (no pattern that
// can backtrack; the one scheme search of the prototype read a dotted word again from every dot, so it is a scan here).
export const IX_SECTIONS = ["fallback", "html", "css", "script"] as const;
/** fixed caps (checked when the frame starts, outside the parse budget); a host may only lower them */
export const IX_LIMITS = { silentMs: 5000, lifeMs: 10 * 60 * 1000, minHeight: 80, maxHeight: 1200, defaultHeight: 280 };

export interface IxParts { fallback: string; html: string; css: string; script: string; sections: { name: string; line: number }[]; unknown: { name: string; line: number }[] }

/** A section line: "@" then a word, nothing else on the line but spaces. */
function sectionOf(l: string): string | null {
  if (l.charCodeAt(0) !== 0x40) return null;
  let i = 1;
  const c0 = l.charCodeAt(1);
  if (!((c0 >= 0x41 && c0 <= 0x5a) || (c0 >= 0x61 && c0 <= 0x7a))) return null;
  while (i < l.length) { const c = l.charCodeAt(i); if ((c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f || c === 0x2d) i++; else break; }
  const name = l.slice(1, i);
  for (; i < l.length; i++) { const c = l.charCodeAt(i); if (c !== 0x20 && c !== 0x09 && c !== 0x0d) return null; }
  return name;
}

/** Split the source into its sections, one pass over the lines. `charge` pays for each line read. */
export function parseInteractive(body: string, bodyLine: number, charge: (lines: number) => void = () => {}): IxParts {
  const out: IxParts = { fallback: "", html: "", css: "", script: "", sections: [], unknown: [] };
  let cur: string | null = null;
  const buf: Record<string, string[]> = {};
  const lines = body.split("\n");
  charge(lines.length);
  lines.forEach((l, i) => {
    const name = sectionOf(l);
    if (name != null) {
      if ((IX_SECTIONS as readonly string[]).includes(name)) { cur = name; buf[cur] = buf[cur] ?? []; out.sections.push({ name, line: bodyLine + i }); }
      else { cur = null; out.unknown.push({ name, line: bodyLine + i }); }
      return;
    }
    if (cur) buf[cur].push(l);
  });
  for (const k of IX_SECTIONS) out[k] = trimLines(buf[k] ?? []);
  return out;
}
// the lines joined, without the blank lines before and the white space after (what /^\n+|\s+$/g left, in one pass)
function trimLines(ls: string[]): string {
  let a = 0;
  while (a < ls.length && ls[a] === "") a++;
  return ls.slice(a).join("\n").trimEnd();
}

// what reaches out, keeps state or leaves the frame: a word to find (in lower case), what the message names, whether it
// is a whole word, and whether it must be called (a "(" after it, spaces allowed). The parser's bundle holds no text
// that reads as a call of eval or the Function constructor (test/pure.test.ts), so those are written as words here.
type Bad = [find: string, what: string, word: boolean, call?: boolean];
const SCRIPT_BAD: Bad[] = [
  ["fetch(", "fetch(", true], ["xmlhttprequest", "XMLHttpRequest", true], ["websocket", "WebSocket", true], ["eventsource", "EventSource", true],
  ["import(", "import(", true], ["localstorage", "localStorage", true], ["sessionstorage", "sessionStorage", true], ["indexeddb", "indexedDB", true],
  ["document.cookie", "document.cookie", true], ["window.open", "window.open", true], ["top.", "top.", true], ["parent.", "parent.", true],
  ["window.top", "window.top", true], ["window.parent", "window.parent", true], ["sendbeacon", "navigator.sendBeacon", true], ["eval", "eval", true, true],
  ["new function", "new Function", true], ["worker(", "Worker(", true], ["rtcpeerconnection", "RTCPeerConnection", true], ["location", "location (the frame stays where it is)", true],
];
const MARKUP_BAD: Bad[] = [
  ["<form", "<form", false], ["<iframe", "<iframe", false], ["<object", "<object", false], ["<embed", "<embed", false], ["<link", "<link", false],
  ["<base", "<base", false], ["<meta", "<meta", false], ["<script", "<script> (put the script under @script)", false],
];
const isWordCh = (c: number) => (c >= 0x30 && c <= 0x39) || (c >= 0x61 && c <= 0x7a) || c === 0x5f || c === 0x24;
/** Where `find` occurs in `low` as a word (no letter, digit, "_", "$" or "." before it; with spaces before "(" allowed). */
function hasWord(low: string, find: string, word: boolean, call = false): boolean {
  // "fetch(" also matches "fetch (": search the word, then allow spaces before a final "("
  const paren = call ? find : find.endsWith("(") ? find.slice(0, -1) : null;
  const key = paren ?? find;
  for (let i = low.indexOf(key); i >= 0; i = low.indexOf(key, i + 1)) {
    if (word && i > 0) { const p = low.charCodeAt(i - 1); if (isWordCh(p) || (p === 0x2e && !key.startsWith("."))) continue; }
    let j = i + key.length;
    if (paren != null) { while (j < low.length && (low.charCodeAt(j) === 0x20 || low.charCodeAt(j) === 0x09)) j++; if (low.charCodeAt(j) !== 0x28) continue; return true; }
    if (word && /[a-z0-9_$]$/.test(key) && j < low.length && isWordCh(low.charCodeAt(j))) continue;
    return true;
  }
  return false;
}
/** an inline handler: " on<letters>=" in markup */
function hasHandler(low: string): boolean {
  for (let i = low.indexOf("on"); i >= 0; i = low.indexOf("on", i + 1)) {
    const p = i > 0 ? low.charCodeAt(i - 1) : 0x20;
    if (!(p === 0x20 || p === 0x09 || p === 0x0a || p === 0x2f || p === 0x22 || p === 0x27)) continue;
    let j = i + 2;
    const s = j;
    while (j < low.length && low.charCodeAt(j) >= 0x61 && low.charCodeAt(j) <= 0x7a) j++;
    if (j === s) continue;
    while (j < low.length && (low.charCodeAt(j) === 0x20 || low.charCodeAt(j) === 0x09)) j++;
    if (low.charCodeAt(j) === 0x3d) return true;
    i = j - 1;
  }
  return false;
}
/** a URL with a scheme ("x://"), a "//" address after "=" or "url(", "url(x:" or an @import: one pass per kind */
function hasAddress(low: string): boolean {
  if (low.includes("://") || low.includes("@import")) return true;
  for (let i = low.indexOf("//"); i >= 0; i = low.indexOf("//", i + 2)) {
    let k = i - 1;
    while (k >= 0 && (low.charCodeAt(k) === 0x20 || low.charCodeAt(k) === 0x22 || low.charCodeAt(k) === 0x27)) k--;
    if (k >= 0 && low.charCodeAt(k) === 0x3d) return true;
    if (k >= 3 && low.charCodeAt(k) === 0x28 && low.startsWith("url", k - 3)) return true;
  }
  for (let i = low.indexOf("url("); i >= 0; i = low.indexOf("url(", i + 4)) {
    let k = i + 4;
    while (k < low.length && (low.charCodeAt(k) === 0x20 || low.charCodeAt(k) === 0x22 || low.charCodeAt(k) === 0x27)) k++;
    const s = k;
    while (k < low.length && k - s < 32) { const c = low.charCodeAt(k); if ((c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c === 0x2b || c === 0x2e || c === 0x2d) k++; else break; }
    if (k > s && low.charCodeAt(k) === 0x3a) return true;
  }
  return false;
}

/** doccheck's rules for an interactive part: each message names the fix. `bytes` is the source's UTF-8 size. */
export function checkInteractive(p: IxParts, bytes: number, maxBytes: number): { line: number; msg: string }[] {
  const e: { line: number; msg: string }[] = [];
  const line = (name: string) => p.sections.find((s) => s.name === name)?.line ?? 1;
  const tail = " The interactive part runs with no network and no storage.";
  if (bytes > maxBytes) { e.push({ line: 1, msg: `interactive: the part is ${Math.ceil(bytes / 1024)} KB; at most ${Math.floor(maxBytes / 1024)} KB. Make it smaller` }); return e; }
  for (const u of p.unknown) e.push({ line: u.line, msg: `interactive: unknown section @${u.name}; the sections are ${IX_SECTIONS.map((s) => "@" + s).join(", ")}` });
  if (!p.html.trim() && !p.script.trim()) e.push({ line: 1, msg: "interactive: no @html and no @script; write the part's markup under @html" });
  const handlers = hasHandler(p.html.toLowerCase());
  if (handlers) e.push({ line: line("html"), msg: `interactive @html: an inline on...= handler is not allowed; use addEventListener in @script.${tail}` });
  for (const name of ["html", "css", "script"] as const) {
    const low = p[name].toLowerCase();
    if (!low) continue;
    for (const [find, what, word, call] of name === "script" ? SCRIPT_BAD : MARKUP_BAD) if (hasWord(low, find, word, call)) e.push({ line: line(name), msg: `interactive @${name}: \`${what}\` is not allowed.${tail}` });
    if (name !== "script") for (const [find, what] of SCRIPT_BAD.slice(0, 1)) if (hasWord(low, find, true)) e.push({ line: line(name), msg: `interactive @${name}: \`${what}\` is not allowed.${tail}` });
    if (hasAddress(low)) e.push({ line: line(name), msg: `interactive @${name}: a URL with a scheme or \`//\` (or an @import) is not allowed.${tail}` });
  }
  return e;
}

/** the base styles inside the frame: buttons, inputs and sliders look native; colours come from the page's tokens */
export const IX_BASE_CSS = `:root{color-scheme:light dark}*{box-sizing:border-box}html,body{margin:0}body{font:15px/1.5 var(--font-sans,system-ui,sans-serif);color:var(--ink,CanvasText);background:transparent;padding:8px}
button,select,input,textarea{font:inherit;color:inherit}button{min-height:36px;padding:0 14px;border:1px solid var(--line-2,GrayText);border-radius:var(--r-pill,999px);background:var(--surface-2,ButtonFace);cursor:pointer}
button:hover{background:var(--acc-soft,ButtonFace)}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--acc,Highlight);outline-offset:2px}
input[type=range]{width:min(100%,260px);accent-color:var(--acc,Highlight)}input[type=text],input[type=number],select,textarea{min-height:36px;padding:4px 10px;border:1px solid var(--line-2,GrayText);border-radius:var(--r-s,8px);background:var(--surface,Canvas)}
label{display:inline-flex;gap:8px;align-items:center;flex-wrap:wrap}output{font-variant-numeric:tabular-nums}`;
/** the token names the frame receives (values are read from the page and sent as a message) */
export const IX_TOKENS = ["--ink", "--ink-2", "--muted", "--faint", "--surface", "--surface-2", "--line", "--line-2", "--acc", "--acc-soft", "--acc-ink", "--good", "--warn", "--bad", "--c1", "--c2", "--c3", "--c4", "--c5", "--c6", "--c7", "--c8", "--font-sans", "--font-mono", "--r-s", "--r-m", "--r-pill"];
// runs first in the frame: takes token values from the page, reports its height (a number: the only thing it ever says).
// The height is the body's own (the page's scroll height is never under the frame's, so the frame could never shrink).
const BASE_SCRIPT = `(function(){var last=-1;function h(){var b=document.body;if(!b)return;var n=Math.ceil(b.getBoundingClientRect().height);if(n!==last){last=n;try{window.parent.postMessage({dhHeight:n},"*")}catch(e){}}}
window.addEventListener("message",function(e){var d=e.data;if(d&&typeof d==="object"&&d.dhTokens){for(var k in d.dhTokens){if(/^--[a-z0-9-]+$/.test(k))document.documentElement.style.setProperty(k,String(d.dhTokens[k]))}document.documentElement.style.colorScheme=d.dark?"dark":"light";h()}});
window.addEventListener("load",h);if(window.ResizeObserver)new ResizeObserver(h).observe(document.body);setTimeout(h,0)})();`;
/** The frame's policy: nothing is fetched, no form is sent, and only inline script and style run. */
export const IX_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'";
const closeTag = (s: string, tag: string) => { const low = s.toLowerCase(), end = `</${tag}`; if (!low.includes(end)) return s; let out = "", from = 0; for (let i = low.indexOf(end); i >= 0; i = low.indexOf(end, i + 1)) { out += s.slice(from, i) + "<\\/" + s.slice(i + 2, i + 2 + tag.length); from = i + 2 + tag.length; } return out + s.slice(from); };
/** The frame's whole page. `staticOnly` leaves out the author's script (interactive="static"). */
export function frameDoc(p: Pick<IxParts, "html" | "css" | "script">, staticOnly: boolean): string {
  const css = closeTag(p.css, "style");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${IX_CSP}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${IX_BASE_CSS}</style><style>${css}</style></head><body>${p.html}<script>${BASE_SCRIPT}</script>${staticOnly || !p.script ? "" : `<script>${closeTag(p.script, "script")}</script>`}</body></html>`;
}
/** The frame's height from the height= attribute, kept between the fixed caps. */
export function ixHeight(attrs: Record<string, string>): number {
  const h = Number(attrs.height ?? IX_LIMITS.defaultHeight);
  return Number.isFinite(h) ? Math.max(IX_LIMITS.minHeight, Math.min(IX_LIMITS.maxHeight, Math.round(h))) : IX_LIMITS.defaultHeight;
}

/** CSP for a host-served shell. Send it as an HTTP header (the meta policy is a second restriction).
 * The parent page can keep script-src 'self' and trusted-types 'none'. This shell must not require Trusted Types:
 * it parses the checked markup and creates the author's inline script in its own opaque-origin document. */
const IX_FRAME_META_CSP = IX_CSP + "; connect-src 'none'; frame-src 'none'; object-src 'none'";
// sandbox and frame-ancestors work only as response headers, never as a meta policy.
export const IX_FRAME_CSP = IX_FRAME_META_CSP + "; sandbox allow-scripts; frame-ancestors 'self'";

/** A fixed, content-free frame page for a host to serve. Never interpolate author text into this response. */
export function interactiveFrame(): { html: string; csp: string } {
  const boot = `(function(){
if(window.origin!=="null")return;
var hostOrigin=location.origin;
var started=false,last=-1,tokens=${JSON.stringify(IX_TOKENS)};
function theme(d){var root=document.documentElement;for(var k of tokens){var v=d.dhTokens&&d.dhTokens[k];if(typeof v==="string")root.style.setProperty(k,v)}root.style.colorScheme=d.dark===true?"dark":"light"}
function height(){if(!started)return;var n=Math.ceil(document.body.getBoundingClientRect().height);if(n!==last){last=n;window.parent.postMessage({dhHeight:n},"*")}}
window.addEventListener("message",function(e){
 if(e.source!==window.parent||e.origin!==hostOrigin)return;var d=e.data;if(!d||typeof d!=="object")return;
 if(started){if(d.dhTokens)theme(d);return}
 if(d.dhInit!==true||(d.mode!=="on"&&d.mode!=="static")||typeof d.html!=="string"||typeof d.css!=="string"||typeof d.script!=="string")return;
 if(new TextEncoder().encode(d.html+d.css+d.script).length>204800)return;
 started=true;theme(d);
 if(d.mode==="static"){
  var restriction=document.createElement("meta");restriction.httpEquiv="Content-Security-Policy";restriction.content="script-src 'none'";document.head.append(restriction);
  var root=document.documentElement,probe=document.createElement("script");
  probe.textContent="document.documentElement.setAttribute('data-dh-static-probe','ran')";document.head.append(probe);probe.remove();
  if(root.hasAttribute("data-dh-static-probe")){root.removeAttribute("data-dh-static-probe");return}
 }
 var style=document.createElement("style");style.textContent=d.css;document.head.append(style);
 var parsed=new DOMParser().parseFromString("<!doctype html><body>"+d.html,"text/html");document.body.replaceChildren(...Array.from(parsed.body.childNodes));
 if(d.mode==="on"&&d.script){var script=document.createElement("script");script.textContent=d.script;document.body.append(script)}
 if(window.ResizeObserver)new ResizeObserver(height).observe(document.body);height();setTimeout(height,0);
});
window.addEventListener("load",function(){window.parent.postMessage({dhReady:true},"*")});
})();`;
  return { csp: IX_FRAME_CSP, html: `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${IX_FRAME_META_CSP}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${IX_BASE_CSS}</style></head><body><script>${boot}</script></body></html>` };
}
