// The page test/media-loader-browser.test.ts opens in a real browser (strict CSP, require-trusted-types-for 'script', blob: allowed for img, media and
// connect). ?case=loader: a host loader that answers bytes, an objectUrl, a refusal and "not mine"; ?case=sprite: a video whose thumbnail track names a
// hostile sprite, with the loader (?loader=1) or without.
import React from "react";
import { createRoot } from "react-dom/client";
import { DhDocument } from "../src/react/strict";
import { parse } from "../src/index";
import type { LoadMedia } from "../src/media-loader";

const W = window as any;
const q = new URLSearchParams(location.search);
const made: string[] = [], revoked: string[] = [], hostOwned: string[] = [], asked: string[] = [];
const c0 = URL.createObjectURL.bind(URL), r0 = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = (b: Blob | MediaSource) => { const u = c0(b); made.push(u); return u; };
URL.revokeObjectURL = (u: string) => { revoked.push(u); r0(u); };
Object.assign(W, { __made: made, __revoked: revoked, __host: hostOwned, __asked: asked });
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8Dwn4GBgYGJAQoAHhgCAh6X4CYAAAAASUVORK5CYII="), (c) => c.charCodeAt(0));

// ?stubplay=1: play() is refused (NotAllowedError, as a browser that wants it inside the click does) until window.__allowPlay is set
if (q.get("stubplay")) {
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    W.__playCalls = (W.__playCalls ?? 0) + 1;
    W.__playHadSrc = !!(this.currentSrc || this.getAttribute("src") || this.querySelector("source")?.getAttribute("src"));
    return W.__allowPlay ? Promise.resolve() : Promise.reject(new DOMException("play() needs a user gesture", "NotAllowedError"));
  };
}
const loader: LoadMedia = async (r) => {
  asked.push(`${r.part}/${r.kind}/${r.role ?? ""}:${r.url}:${r.maxBytes}`);
  const u = r.url;
  if (u === "media:one.png" || u === "@dir/two.png" || u === "media:far.png") return { bytes: PNG };
  if (u === "media:own.png") { const b = c0(new Blob([PNG], { type: "image/png" })); hostOwned.push(b); return { objectUrl: b }; }
  if (u === "media:clip.mp4" || u === "media:talk.mp3") return { bytes: new Uint8Array(16) };
  if (u === "media:clip.jpg") return { bytes: PNG };
  if (u === "media:drawing.svg") return { bytes: new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>") };
  if (u === "media:spin.json") return { bytes: new TextEncoder().encode('{"v":"5.7.0","fr":30,"ip":0,"op":30,"w":10,"h":10,"layers":[]}') };
  if (u === "media:secret.png") return { refused: "you cannot open this file" };
  return { useDefault: true };
};

const root = createRoot(document.getElementById("root")!);
if (q.get("case") === "loader") {
  const top = `# Loader

![Prose bytes](media:one.png)

![Prose own blob](media:own.png)

![Prose refused](media:secret.png)

![Prose svg](media:drawing.svg)

![Forged](blob:${location.origin}/forged)

\`\`\`gallery
![One](media:one.png "First")
![Two](@dir/two.png "Second")
\`\`\`

\`\`\`compare-image
before: media:one.png "Before"
after: media:own.png "After"
\`\`\`

\`\`\`video src="media:clip.mp4" poster="media:clip.jpg" title="A clip" duration=0:10
\`\`\`

\`\`\`audio src="media:talk.mp3" title="A talk" duration=0:10
\`\`\`

\`\`\`lottie src="media:spin.json"
alt: A spinner.
\`\`\`

\`\`\`pdf src="media:nope.pdf"
\`\`\`
`;
  const far = `![Far away](media:far.png)\n`;
  const opts = { path: "p.dh.md", mediaPrefixes: ["media:", "@"] };
  const props = { loadMedia: loader, mediaPrefixes: ["media:", "@"] };
  // ?static=1: the host asked for a static page (every image must be there, far or not)
  const extra = q.get("static") ? { static: "" } : {};
  root.render(<><DhDocument doc={parse(top, opts)} {...props} {...extra} /><div style={{ height: 6000 }} aria-hidden="true" /><DhDocument doc={parse(far, opts)} {...props} {...extra} /></>);
  W.__unmount = () => root.unmount();
} else {
  // a video with a thumbnail track whose sprite name is hostile (it ends the CSS string and starts a second url())
  const text = `# Sprite\n\n\`\`\`video src="/v.mp4" duration=1:00 title="A video"\nthumbs: /t.vtt\n\`\`\`\n`;
  const doc = parse(text, { path: "p.dh.md" });
  root.render(q.get("loader") === "1" ? <DhDocument doc={doc} loadMedia={async (r) => { asked.push(r.url); return { useDefault: true }; }} mediaPrefixes={["media:"]} /> : <DhDocument doc={doc} />);
}
