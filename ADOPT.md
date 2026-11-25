# Adopting durian-hypermedia in another app

What a host app needs to render Durian Hypermedia written by agents or people: the entry points, the input, the LLM
view, the theme tokens to map, the sizes, what is optional, and how to add the host's own blocks without forking.

## 0. Pin a version

Releases are git tags `v<version>` (`v0.1.0` was the first, `v0.3.0` is the latest); the package is not on a registry. Pin the tag, never a
branch, so the renderer under your pages only changes when you move the pin:

```sh
bun add git+https://github.com/<owner>/durian-hypermedia.git#v0.3.0
```

```json
{ "dependencies": { "durian-hypermedia": "git+https://github.com/<owner>/durian-hypermedia.git#v0.3.0" } }
```

Bun reads the TypeScript sources directly (the `bun` export condition); for Node and other bundlers the install runs
`prepare` (`bun scripts/build.ts`), which writes `dist/`. `import { VERSION } from "durian-hypermedia"` says which
version is installed; CHANGELOG.md says what changed between tags (before 1.0.0 a minor version may break the API, and
says so there). To move: read the CHANGELOG entries between your tag and the new one, change the tag, run the fixtures.

## 1. Entry points

| Import | Runs where | Gives |
| --- | --- | --- |
| `durian-hypermedia` | anywhere (Bun, Node, a browser, a worker) | `parse`, `llmView`, `check`, `defineBlock`, `registerBlock`, `defineInline`, `LIMITS`, `UNTRUSTED_LIMITS`, `defaultUrlPolicy`, every type |
| `durian-hypermedia/server` | Bun or Node | `highlight(doc)`: colours for code (Code Hike on WebAssembly) |
| `durian-hypermedia/react` | React 18 or 19 | `DhDocument` (every part), each part component, `DEFAULT_SLOTS`, `UI` |
| `durian-hypermedia/react/strict` | React, under Trusted Types | `DhDocument` with every part; no HTML-string sink |
| `durian-hypermedia/react/document` | React | `DocumentView`: the document with only the parts you pass |
| `durian-hypermedia/react/<part>` | React | one part: `terminal`, `filetree`, `editor`, `codewalk`, `chart`, `animation`, `tierlist`, `alignment`, `containers` (tabs, accordion, human), `markdown` |
| `durian-hypermedia/react/reference` | React | `ReferenceChip`, `ReferencePart`, `SvgPart`, `InteractiveStill` (the reference looks; every `DhDocument` already has them) |
| `durian-hypermedia/react/interactive` | browser | `InteractivePart`: runs an interactive part in a sandboxed frame; the only module with a Trusted Types policy (`dh-interactive`) |
| `durian-hypermedia/react/hydrate` | browser | `hydrateDocument`, `renderDocument`, `readDocument`, `documentJson` |
| `durian-hypermedia/styles.css` | CSS | every rule under `.dh-doc` |

All of it is ESM. React is a peer dependency (`>=18 <20`); the tests run on React 18.3.1.

## 2. The input

Text in the format of [SPEC.md](SPEC.md) (a page of Markdown with fenced parts and `:::` containers, optional front
matter). The text may be hostile: [SECURITY.md](SECURITY.md) says what `parse()` does with it. In short:

- raw HTML is shown as text, never passed through;
- every link and image URL goes through `urlPolicy(url, kind)`; script, data, vbscript and file URLs never get through,
  whatever the policy returns;
- caps on size, block count, nesting, animation things, steps and layout work, chart points, items and YAML size;
  going over one gives an error block in place of the part and a line in `doc.problems`, never a crash;

```ts
const doc = parse(text, {
  urlPolicy: (url, kind) => (kind === "image" && !url.startsWith("/files/") ? null : url),
  limits: { maxInputBytes: 300_000 },
  blocks: [terminalSession, taskBlock],      // the host's own blocks (section 7)
  inlines: [fileRef, taskRef],               // the host's own inline references (section 7)
  marks: { deprecated: { label: "deprecated", colour: "warn", means: "still works, will be removed" } },   // own file tree marks for every page (SPEC.md 3.1)
  prefixes: { ">>>": { label: "Python", colour: "c4" } },                                                 // own terminal prompts for every page
});
doc.problems;   // [] for a clean page
```

**Two sets of caps.** `LIMITS` (the default) fits authored pages: the largest real pages need about half of its YAML and
animation caps. Text nobody has reviewed (a chat reply, a streamed message) should use `UNTRUSTED_LIMITS`, the same caps
with smaller YAML and animation work caps, so its slowest pages parse about three to five times quicker (SECURITY.md has
the measured worst cases). Lower any cap further by spreading it:

```ts
import { parse, UNTRUSTED_LIMITS } from "durian-hypermedia";
const doc = parse(reply, { limits: { ...UNTRUSTED_LIMITS, maxInputBytes: 100_000 } });
```

**Own marks and prefixes for the whole host.** A page defines its own `marks:` (file tree) and `prefixes:` (terminal) in
its front matter (SPEC.md section 3.1). To define some for every page (the way a docs site keeps one list), pass the
same shape as the `marks` and `prefixes` options of `parse()`; the page's own entry of the same name wins. A bad entry is a
line of `check(doc)`, naming the host's list. They show only where a part uses them, and the LLM view reads a mark as its
label.

The parser reads no files: a code walk or editor that names a file in a repo (not written in the page with `@file`)
shows "no code" with the reason. Write the code in the page with `@file`, or resolve repo files before parsing.

## 3. The LLM view

`llmView(doc)` (also `doc.llm`) is what an LLM reads: the page without the wrappers. Prose, tables and code stay as
they are; a chart becomes its data as a table; an animation becomes what it starts with and its captions; a tier list
one line per tier; an alignment grid a table; an author's `:::llm` text replaces the part before it; a host block gives
its own text. `parse(text, { publicView: true })` also drops `> **Security finding:**` callouts.

`check(doc)` returns the doccheck rules' findings (`{ line, level, message }[]`) plus `doc.problems` and the host
blocks' own checks: run it where agents write pages, to tell them what to fix.

## 4. Rendering

```tsx
<DhDocument
  doc={doc}
  variant="flat"             // the host's style name: data-dh-variant on the root
  theme="dark"               // or leave it to <html data-theme> / the system
  motion="off"               // still everything (also: prefers-reduced-motion)
  slots={{ Frame, Callout, Error, Spinner }}   // swap the chrome
  // and draw Markdown your way (no default: leave one out and the renderer draws it):
  //   Code {lang,text,meta,hl}, InlineCode {text}, Link {href,title,external,children},
  //   Table {align,head,rows,headText}, Heading {depth,level,id,text,children}
  demoteHeadings={2}         // "#" draws as <h3>
  blocks={[terminalSession, taskBlock]}
  inlines={[fileRef, taskRef]}
  urlPolicy={policy}         // checked again at render time
  ui={{ next: "Next", back: "Back" }}                  // the renderer's own words
/>
```

Server render with `renderToString` and hydrate with `hydrateDocument(el, doc, sameProps)`, or render in the browser
with `renderDocument`. Pass the `Document` from server to browser as JSON with `documentJson(doc)` inside
`<script type="application/json">` (it escapes `<`), read it with `readDocument(id)`.

**Hydration order, and class `js`.** `hydrateDocument()` hydrates a page's heavy parts (animation, chart, terminal, code
walk, editor, file tree, tier list, alignment grid) in the order the reader needs them: the parts on screen (and
just below) first, one per task so the page paints between them; the one the reader scrolls to jumps the queue; then the
rest in page order; a part the reader touches, clicks, focuses or types in works at once. A server-rendered part keeps its
HTML until its turn, so nothing flashes. It also puts the class `js` on `<html>` (the phone's first-paint rule in
`styles.css` needs it: under 560 px an animation shows an empty stage until it has measured itself, instead of the
server's wide drawing with words of about 6 px; without scripts the server's drawing stays). **A host with its own shell
or its own `hydrateRoot` must add the class itself, before the page paints:** `<script>document.documentElement.classList.add("js")</script>`
in the `<head>` (a nonce or hash under a strict CSP). A host that calls `hydrateRoot` itself gets the old behaviour
(every part at once), unless it opts in: `const order = new HydrationOrder(); hydrateRoot(el, <TurnContext.Provider value={order}><DhDocument ... /></TurnContext.Provider>); order.watch(el);`
(both exported from `durian-hypermedia/react/hydrate`; `order.stop()` lets every waiting part go).
So `hydrateDocument` is that, with the class `js`. A page that re-renders its root (a variant or theme prop)
while it hydrates should wrap that update in `React.startTransition`: React switches a part that gets an update before it
has hydrated to client rendering (its error 424), which throws the server's drawing away. The queue finds a part by a block with no height, class
`dh-turn`, that sits at the top of the part inside its frame.

**Strict CSP.** No part uses `eval`, `new Function` or WebAssembly in the browser; no CDN; no font is fetched.
Proved by the example site served with
`Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'`:
every fixture page (including the hostile ones, with 3D opened and every stepped part stepped) has 0 violations in
headless Chrome (`bun run csp`). `style-src 'unsafe-inline'` is needed for the `style="..."` attributes in
server-rendered HTML (code colours, sizes). Without
`'unsafe-inline'` a page rendered only in the browser works for every part (React sets styles through
the DOM, which CSP allows); see the notes in SECURITY.md.

**Trusted Types.** Under `require-trusted-types-for 'script'`, use `durian-hypermedia/react/strict`. That
entry's import graph holds no HTML-string sink (`test/trusted-types.test.ts`), and every fixture renders under the
policy with 0 violations (`bun run tt`).

**Messages, not pages.** For chat-like text where a leading `---` is a rule, not front matter:
`parse(text, { frontMatter: false })`.

**Phones.** Every part has a layout for 390 and 360 px wide screens (stacked, or a scrollable part with a visible hint);
nothing pushes the page sideways. Touch steps the parts and moves the animation stage.

## 5. Theme tokens to map

[THEME.md](THEME.md) lists every token with its light and dark defaults. Set them on `.dh-doc` after `styles.css`.
Map these first; the rest follow from them:

| Token | What it colours | Map to the host's |
| --- | --- | --- |
| `--surface`, `--surface-2`, `--surface-3` | cards, panels, inset rows | card and panel colours |
| `--line`, `--line-2` | borders, axes | border colours |
| `--ink`, `--ink-2`, `--muted`, `--faint` | headings, body text, captions, meta text | text colours |
| `--acc`, `--acc-ink`, `--acc-soft`, `--acc-softer` | links, focus, the active step | accent |
| `--good`, `--warn`, `--bad` (and `-ink`, `-soft`) | status | status colours |
| `--c1` ... `--c8` (and `-soft`, `-ink`) | families in animations, tier lists, alignment grids, charts | a categorical palette of 8 |
| `--series-1` ... `--series-5` | chart series | a chart palette |
| `--term`, `--term-2`, `--term-ink`, `--ch-1` ... `--ch-26` | the terminal and code colours | a code theme |
| `--font-sans`, `--font-mono`, `--font-display` | text, code, headings | the host's fonts (the package loads none); the composed stage measures with Poppins metrics: map `--font-sans` to Poppins or a font of the same widths, else its lines can run past their boxes |
| `--r-s`, `--r-m`, `--r-l`, `--shadow-sm`, `--shadow-md`, `--dur` | corners, shadows, motion | the style's shape |

A host with several styles and palettes: one `variant` per style (a block of token overrides and selectors under
`.dh-doc[data-dh-variant="<style>"]`, see THEME.md), and the palette's colours as token values, light and dark.

**Maths fonts.** The renderer emits native MathML; the package ships no font or KaTeX stylesheet. Its `--math-font` token starts with `KaTeX_Main`: self-host the regular, italic, bold and bold-italic WOFF2 faces from `katex/dist/fonts`, declare each as `font-family: KaTeX_Main` with its matching style and weight, and retain the OFL notice. Or map `--math-font` to a maths font your host already supplies. The example declares and serves the KaTeX faces under `assets/fonts/`, with `OFL-KaTeX.txt` beside them; these example-only files are outside the published package. A policy with `font-src 'self'` keeps those requests on your origin.

## 6. Sizes

Measured with `bun run sizes` (Bun's bundler, minified; gzip of the result) on 0.7.0-rc.3. React and react-dom are
left out of every row but the first (the host ships them once): 139 KB, 46 KB gzipped. *Own code only* is
the package's code in every chunk, first load and later, with the dependencies left out.

| Entry | First load (min / gzip) | Later, on demand (min / gzip) | Own code only (min / gzip) |
| --- | --- | --- | --- |
| `durian-hypermedia` (parse, llmView, check) | 954 KB / 349 KB | none | 902 KB / 324 KB |
| `react` (every part) | 1.3 MB / 477 KB | 2.5 MB / 777 KB (libraries loaded only when needed: chart.js when a chart mounts, three.js when a reader opens 3D, and others) | 3.0 MB / 1.0 MB |
| `react/strict` (every part, under Trusted Types) | 1.3 MB / 477 KB | 2.5 MB / 777 KB (the same) | 3.0 MB / 1.0 MB |
| `react/document` (no part) | 646 KB / 237 KB | none | 581 KB / 207 KB |
| `react/terminal` | 26 KB / 12 KB | none | 26 KB / 12 KB |
| `react/filetree` | 26 KB / 11 KB | none | 26 KB / 11 KB |
| `react/editor` | 44 KB / 19 KB | none | 31 KB / 14 KB |
| `react/codewalk` | 61 KB / 25 KB | none | 48 KB / 20 KB |
| `react/chart` | 137 KB / 51 KB | 208 KB / 73 KB (chart.js) | 140 KB / 53 KB |
| `react/animation` | 580 KB / 219 KB | 543 KB / 145 KB (three.js, 3D only) | 623 KB / 236 KB |
| `react/tierlist` | 23 KB / 10 KB | none | 23 KB / 10 KB |
| `react/alignment` | 30 KB / 13 KB | none | 30 KB / 13 KB |
| `react/containers` | 646 KB / 237 KB | none | 581 KB / 207 KB |

The part entries share most of what they load (the document view, the Markdown renderer, the step controls), so two
parts cost far less than the sum of their rows. `styles.css` is about 232 KB, 39 KB gzipped.

## 7. What is optional

- **3D** loads three.js only when a reader opens the 3D view of an animation.
- **chart.js** loads when a chart mounts.
- **Colours for code** need `highlight()` on the server; without it code is plain.
- **Any part** can be left out of `DocumentView`'s `components`; it then shows its LLM text.

## 8. The host's own blocks and references

A host adds its own fenced blocks (a terminal session, a browser recording, a task) and its own inline references in
prose (`@src/a.ts`, `&T-12`) without forking. One definition serves the parser and the renderer.

```tsx
import { defineBlock, defineInline } from "durian-hypermedia";

export const taskBlock = defineBlock({
  name: "fy-task",                                   // the fence word: ```fy-task
  parse: ({ body, attrs, line }) => {                 // pure; throw to show an error block with the message
    const kv = Object.fromEntries(body.split("\n").map((l) => l.split(/:\s*/, 2)));
    if (!kv.id) throw new Error("a task needs an id: line");
    return { id: kv.id, title: kv.title ?? "", state: kv.state ?? "todo" };
  },
  llm: (t) => `Task ${t.id} (${t.state}): ${t.title}`,           // what an LLM reads (default: the fence as written)
  check: (t) => (["todo", "doing", "done"].includes(t.state) ? [] : [{ message: `unknown state "${t.state}"` }]),
  Component: ({ data }) => <TaskCard task={data} />,              // receives { block, data }
});

export const fileRef = defineInline({
  name: "file",
  match: /@[\w.-]+(?:\/[\w.-]+)+/,                   // what it looks like in prose (needs a slash: not an email)
  Component: ({ text }) => <FileChip path={text.slice(1)} />,     // receives { text, data }
});

const doc = parse(text, { blocks: [taskBlock], inlines: [fileRef] });
<DhDocument doc={doc} blocks={[taskBlock]} inlines={[fileRef]} />;
```

- `registerBlock(def)` registers a block for every call in the process instead of passing `blocks` each time.
- A block name is lower case letters, digits and dashes; a built-in part's name is refused with a problem.
- A block with no `Component` in the renderer shows its LLM text; an inline reference with none shows as
  `<span class="dh-ref" data-dh-ref="file">`.
- An inline reference stays as written in the LLM view (the LLM reads `@src/a.ts`). Inside code spans and code blocks
  it is not matched.
- The host's `parse` gets untrusted text: keep it pure, and keep `match` simple (it runs over all prose).
- The example site and the tests use exactly this: `example/host-block.tsx`, `fixtures/host-block.dh.md`,
  `test/host.test.tsx`.

## 8a. References: parts the host keeps (format version 11)

A page may hold `[[<type>:<name> "label"]]` instead of a part (SPEC.md section 8a): on its own paragraph a block, in a
sentence a chip. `svg` and `interactive` exist only as references, so raw SVG and HTML never sit in a conversation.
The package never fetches: the host keeps the parts and answers for them.

```ts
const answer: ResolveReference = ({ type, name }) => {
  const p = store.get(`${type}:${name}`);           // the host's own store; nothing is fetched here
  if (!p) return { state: "failed", reason: "no such part" };
  if (!p.done) return { state: "pending" };          // a helper is still making it
  return { state: "ready", part: p.source };         // the part as written inline, or only its body
};
const doc = parse(text, { resolveReference: answer, limits: UNTRUSTED_LIMITS });
```

- **Pending, then ready.** Answer pending while the part is being made; when it is ready, parse the same text again and
  render the new Document. A server can resolve before it sends the page (pre-render); the browser only draws.
- **The same caps as inline.** A ready part is read by the same part reader, with the page's caps and budgets, on the
  reference's line. A host may lower `maxReferences`, `maxReferenceBytes`, `maxSvgBytes` and `maxInteractiveBytes`.
- **The LLM view keeps the reference as written** (`[[chart:sales "Sales"]]`), resolved or not: an agent that reads
  the conversation sees the label and the reference, never the part's code.
- **svg** is drawn only through an `<img>` with a `data:` address; a host CSP needs `img-src data:` for it.
- **interactive** is off unless the host turns it on:
  `<DhDocument doc={doc} interactive="on" components={{ interactive: InteractivePart }} />` with
  `InteractivePart` from `durian-hypermedia/react/interactive` (`"static"` draws it with no script). Under Trusted
  Types add `dh-interactive` to the page's `trusted-types` list. **Set `frame-src 'none'`** in the page's CSP: the
  frame still loads, and a script that navigates it can make no request (without it, one request leaves before the
  frame is stopped; SECURITY.md). The frame keeps the page's CSP: with no
  `'unsafe-inline'` for scripts the part stops at its 5 second check and the still stays.
- **Looks.** Tokens `--ref-chip-*`, `--ref-pending-*`, `--ref-failed-*`, `--ref-refused-*`, `--ix-*`
  (`src/ui/refs.css`); words `refPending`, `refFailed`, `refRefused`, `ixOff` in `ui`.

## 9. Fixtures for a visual matrix

`fixtures/` holds one page per part and option: `fixtures/format/` (made from the format's own samples: every chart
kind and option, tier lists, alignment grids, 2D and 3D animations, code walks animated and still, editor, terminal,
file trees, tabs, accordions, callouts, human and LLM segments), the hand-written pages (plain Markdown, a code walk,
host blocks), and `fixtures/hostile/`, one attack per page. `bun run example` serves them all, with a style switch.
