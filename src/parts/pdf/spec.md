#### PDF

````
```pdf src="media/q3-report.pdf" title="Q3 report" page=3 view=page height=m
```
````

- **Options:** `src` (`.pdf`), `title`, `page=<n>`, `view=page|scroll` (a page at a time, or all pages scrolling), `height=s|m|l`. No body lines.
- A toolbar with page number and count, Previous and Next, zoom (fit width, fit page, in, out), search (every page's text is read once; a run charges a budget of its own; matches are marked on the page and counted), the outline (bookmarks) as a side list (a drawer on a phone), and Download. Text is selectable. Keys: PageUp and PageDown (and Left and Right in the page view), `+`, `-`, `0`, `/` search, Home and End. On a phone a swipe turns the page.
- **The file** is fetched by us with response bytes capped while reading and checked at load against `pdfBytes` and `pdfPages` before pdf.js parses it; pdf.js runs with `isEvalSupported: false` and scripting off. Form fields, scripts and link annotations are not drawn. The address goes through the host's `urlPolicy` as `image`.
- **The worker.** Under strict Trusted Types the viewer must not start a `Worker` (a script-URL sink), so by default pdf.js's worker module is imported into the main thread (`globalThis.pdfjsWorker`, pdf.js's own hook): no `Worker`, no `eval`, no HTML string, no policy. A host that wants a real Worker serves `pdf.worker.min.mjs` from its own origin and sets `<html data-dh-pdf-worker="worker" data-dh-pdf-worker-src="/assets/pdf.worker.min.mjs">` (used only when the page's own header does not require Trusted Types).
- **Static** (`static` on the fence, a static page, the host or print; SPEC 4.1): one page (`page=`, else the first) at the box's width, with no toolbar, search, outline or swipe.
- **LLM view:** `PDF: <title>, <address>.` (the text of the file is not read by the parser; a host that wants it gives a `:::llm`). **Tokens:** `--pdf-bg`, `--pdf-radius`, `--pdf-page-bg` (white in dark too, pages are paper), `--pdf-gap`. **Slots:** `toolbar`, `page`, `outline`, `search`.
- **Local file:** `checkLocalFiles` from `durian-markdown/node` checks the file is a PDF within its cap and has the page `page=` names (pages are counted as page objects; a file that keeps them in compressed object streams is not page-checked).
- **Caps** (travel in the data, checked in the browser at load): `pdfPages` (500; 200 in UNTRUSTED_LIMITS), `pdfBytes` (20 MB; 8 MB).
- **doccheck refuses:** a `src` that is not a `.pdf` file or not an allowed address, no `src`, `page=` that is not a number from 1, a `view` other than page or scroll, a bad `height`, an unknown option, any body line, a part over the page's work budget.
