// The gallery part (format version 11): one image, a grid, or a carousel; one image a line. Pure.
//
//   ```gallery title="The new editor" view=carousel
//   ![The file tree, closed](media/tree-closed.png "Closed: only the top folders")
//   ![On a phone](media/phone.png)
//   ```
import { definePart } from "../types";
import type { Budget } from "../../core/budget";
import { IMAGE_EXT, bodyLines, digitsOnly, extOf, flag, unknownKeys, urlRefusal, type Err } from "../downloads/media";
import { isSpace } from "../kit/text";

export const GALLERY_KEYS = ["id", "title", "view", "ratio", "columns", "loop", "start", "llm"];
export interface GalleryImage { alt: string; src: string; caption: string; line: number }
export interface GallerySpec { title: string; view: "single" | "grid" | "carousel"; ratio: string; columns: number; loop: boolean; start: number; images: GalleryImage[]; errors: Err[] }

/** ![alt](path "caption") read by one scan of the line (no regular expression over author text): [alt, address, caption?] or null */
export function imgLine(t: string): [string, string, string | undefined] | null {
  if (!t.startsWith("![") || !t.endsWith(")")) return null;
  const close = t.indexOf("](");
  if (close < 0) return null;
  const alt = t.slice(2, close);
  if (alt.includes("]")) return null;
  const inner = t.slice(close + 2, -1).trim();
  let e = 0;
  while (e < inner.length && !isSpace(inner[e])) e++;
  const url = inner.slice(0, e), rest = inner.slice(e).trim();
  if (!url) return null;
  if (!rest) return [alt, url, undefined];
  if (rest.length < 2 || rest[0] !== '"' || rest[rest.length - 1] !== '"' || rest.slice(1, -1).includes('"')) return null;
  return [alt, url, rest.slice(1, -1)];
}

export function parseGallery(body: string, baseLine: number, attrs: Record<string, string>, line: number, lim: { galleryImages: number }, budget: Budget): GallerySpec {
  const errors: Err[] = [];
  unknownKeys(attrs, GALLERY_KEYS, "gallery", line, errors);
  const images: GalleryImage[] = [];
  for (const { text: s, line: l } of bodyLines(body, baseLine, budget)) {
    if (images.length >= lim.galleryImages) { errors.push({ line: l, msg: `gallery: more than ${lim.galleryImages} images (the cap)` }); break; }
    budget.charge(1 + (s.length >> 4), 1);
    const m = imgLine(s);
    if (!m) { errors.push({ line: l, msg: `gallery: "${s.slice(0, 40)}" is not one image; a gallery line is ![alt text](path "caption")` }); continue; }
    if (!m[0].trim()) errors.push({ line: l, msg: `gallery: an image has no alt text; write ![what it shows](${m[1]})` });
    const why = urlRefusal(m[1]);
    if (why) errors.push({ line: l, msg: `gallery: image "${m[1]}" is not allowed: ${why}` });
    else if (!IMAGE_EXT.includes(extOf(m[1]))) errors.push({ line: l, msg: `gallery: "${m[1]}" is not an image file (${IMAGE_EXT.join(", ")})` });
    images.push({ alt: m[0].trim(), src: m[1], caption: m[2]?.trim() ?? "", line: l });
  }
  if (!images.length) errors.push({ line, msg: `gallery: no images; list them one a line, like ![The file tree](media/tree.png "Closed")` });
  const view = (attrs.view ?? (images.length > 1 ? "grid" : "single")) as GallerySpec["view"];
  if (!["single", "grid", "carousel"].includes(view)) errors.push({ line, msg: `gallery: view="${attrs.view}" is single, grid or carousel` });
  if (view === "carousel" && images.length === 1) errors.push({ line, msg: `gallery: a carousel of one image is no carousel; use view=single, or add images` });
  if (attrs.ratio !== undefined && !["16:9", "4:3", "1:1", "auto"].includes(attrs.ratio)) errors.push({ line, msg: `gallery: ratio="${attrs.ratio}" is 16:9, 4:3, 1:1 or auto` });
  let columns = 3;
  if (attrs.columns !== undefined) { if (!(attrs.columns.length === 1 && attrs.columns >= "2" && attrs.columns <= "5")) errors.push({ line, msg: `gallery: columns= is 2 to 5` }); else columns = +attrs.columns; }
  let start = 1;
  if (attrs.start !== undefined) { if (!digitsOnly(attrs.start) || +attrs.start < 1 || +attrs.start > Math.max(1, images.length)) errors.push({ line, msg: `gallery: start=${attrs.start} is not an image number from 1 to ${images.length}` }); else start = +attrs.start; }
  return { title: attrs.title ?? "", view: ["single", "grid", "carousel"].includes(view) ? view : "grid", ratio: attrs.ratio ?? "16:9", columns, loop: flag(attrs, "loop"), start, images, errors };
}

export function galleryLlm(g: GallerySpec): string {
  return `Gallery: ${g.title || "images"} (${g.images.length} image${g.images.length === 1 ? "" : "s"}).\n` + g.images.map((im, i) => `${i + 1}. ${im.alt} (${im.src})${im.caption ? `: ${im.caption}` : ""}`).join("\n");
}

export default definePart<GallerySpec>({
  name: "gallery",
  form: "fenced",
  steps: false,
  llmKind: "own",
  parse: (input, ctx) => parseGallery(input.body, input.bodyLine, input.attrs, input.line, ctx.limits, ctx.budget),
  llm: (g) => galleryLlm(g),
  check: (g) => g.errors.map((e) => ({ line: e.line, message: e.msg })),
});
