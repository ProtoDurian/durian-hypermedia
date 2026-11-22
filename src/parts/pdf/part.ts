// The PDF part (format version 11): pdf.js (isEvalSupported: false) draws the pages. Pure here: the parse, the checks and the
// LLM view. The file is fetched and checked in the browser (pdfBytes, pdfPages) before pdf.js parses it.
//
//   ```pdf src="media/q3-report.pdf" title="Q3 report" page=3 view=page height=m
//   ```
import { definePart, type PartFileRef } from "../types";
import type { Budget } from "../../core/budget";
import { HEIGHTS, bodyLines, checkSrc, digitsOnly, titleOf, unknownKeys, type Err } from "../downloads/media";

export const PDF_KEYS = ["id", "src", "title", "page", "height", "view", "llm"];
export interface PdfSpec { src: string; title: string; page: number; height: string; view: "page" | "scroll"; caps: { bytes: number; pages: number }; errors: Err[] }
export type PdfLimits = { pdfPages: number; pdfBytes: number };

export function parsePdf(body: string, baseLine: number, attrs: Record<string, string>, line: number, lim: PdfLimits, budget: Budget): PdfSpec {
  const errors: Err[] = [];
  unknownKeys(attrs, PDF_KEYS, "pdf", line, errors);
  const src = checkSrc(attrs.src, ["pdf"], "pdf", "a .pdf file", line, errors);
  for (const { text: s, line: l } of bodyLines(body, baseLine, budget)) errors.push({ line: l, msg: `pdf: a PDF viewer has no body lines (found "${s.slice(0, 30)}"); the options go on the first line` });
  let page = 1;
  if (attrs.page !== undefined) { if (!digitsOnly(attrs.page) || +attrs.page < 1) errors.push({ line, msg: `pdf: page= is a page number from 1` }); else page = +attrs.page; }
  if (attrs.height !== undefined && !HEIGHTS.includes(attrs.height)) errors.push({ line, msg: `pdf: height="${attrs.height}" is s, m or l` });
  if (attrs.view !== undefined && attrs.view !== "page" && attrs.view !== "scroll") errors.push({ line, msg: `pdf: view="${attrs.view}" is page or scroll` });
  return { src, title: attrs.title ?? "", page, height: attrs.height ?? "m", view: attrs.view === "scroll" ? "scroll" : "page", caps: { bytes: lim.pdfBytes, pages: lim.pdfPages }, errors };
}

export function pdfLlm(p: PdfSpec): string { return `PDF: ${titleOf(p)}, ${p.src}.`; }

/** The number of pages of a PDF's bytes, counted as page objects (`/Type /Page`, not `/Pages`) by one scan; null when the
 *  file keeps its page objects inside compressed object streams (then it cannot be counted without a PDF library). */
export function pdfPageCount(bytes: Uint8Array): number | null {
  const s = new TextDecoder("latin1").decode(bytes);
  let n = 0;
  for (let at = s.indexOf("/Type"); at >= 0; at = s.indexOf("/Type", at + 5)) {
    let k = at + 5;
    while (k < s.length && (s[k] === " " || s[k] === "\n" || s[k] === "\r" || s[k] === "\t")) k++;
    if (s.startsWith("/Page", k)) { const c = s[k + 5]; if (!((c >= "a" && c <= "z") || (c >= "A" && c <= "Z"))) n++; }
  }
  return n || null;
}

/** the PDF, for the Node entry: it is a PDF, within its cap, and has the page `page=` names */
export function pdfFiles(p: PdfSpec, line: number): PartFileRef[] {
  if (!p.src) return [];
  return [{
    path: p.src, line, bytes: true, readMax: p.caps.bytes,
    check: ({ size, bytes }) => {
      if (size > p.caps.bytes) return [`${p.src} is ${Math.round(size / 1024)} KB; PDF files may be at most ${Math.round(p.caps.bytes / 1024)} KB`];
      if (!bytes) return [];
      if (new TextDecoder("latin1").decode(bytes.subarray(0, 5)) !== "%PDF-") return [`${p.src} is not a PDF file (it does not start with %PDF-)`];
      const pages = pdfPageCount(bytes);
      if (pages !== null && pages > p.caps.pages) return [`${p.src} has ${pages} pages; a pdf part shows at most ${p.caps.pages}`];
      return pages !== null && p.page > pages ? [`page=${p.page} is past the end; ${p.src} has ${pages} page${pages === 1 ? "" : "s"}`] : [];
    },
  }];
}

export default definePart<PdfSpec>({
  name: "pdf",
  form: "fenced",
  steps: false,
  llmKind: "own",
  parse: (input, ctx) => parsePdf(input.body, input.bodyLine, input.attrs, input.line, ctx.limits, ctx.budget),
  llm: (p) => pdfLlm(p),
  files: (p, { line }) => pdfFiles(p, line),
  check: (p) => p.errors.map((e) => ({ line: e.line, message: e.msg })),
  dependencies: ["pdfjs-dist"],
});
