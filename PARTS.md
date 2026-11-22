# PARTS.md: how to add one part

Every rich part of DurianMarkdown that is not in the Markdown core lives in one folder, `src/parts/<name>/`. You write
only inside that folder. `bun scripts/parts.ts` writes every shared list from the folders. **You never edit a shared
file by hand**: not `src/core/dh-lib.ts`, `src/core/doccheck.ts`, `src/document.ts`, `src/types.ts`, `src/safety.ts`,
`src/index.ts`, `src/react/*`, `scripts/build-css.ts`, the theme, or `SPEC.md` outside its part markers. If your part
seems to need one of those changed, stop and ask your lead.

The worked example is `src/parts/fishbone/`. Copy its shape. On a shared machine, run every test, tsc and browser
command below through the queues your brief names (same commands, wrapped).

## 1. The folder

Make these files. The names are fixed; the generator refuses a folder that misses one.

| File | What it holds |
| --- | --- |
| `part.ts` | `export default definePart<Data>({ ... })`: the parser, the LLM view, the checks |
| `limits.ts` | `export const LIMITS = { ... }` and `export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, ... }` |
| `view.tsx` | `export default function <Name>View(props: PartViewProps<Data>)`: the React view |
| `style.css` | one `:root` block of tokens, the two dark blocks, then the rules |
| `spec.md` | the part's SPEC section, starting `#### <Part name>` |
| `sample.md` | the Format page sample (Markdown) |
| `fixtures/good-*.dh.md` | at least one page with 0 problems |
| `fixtures/hostile-*.dh.md` | at least one page that tries to do too much |
| `<name>.test.ts` | the tests (section 6) |
| `media/` (optional) | files the sample uses (small images, sound); the sample names them `media/<file>` |

You may add more files (a `layout.ts`, a second view file, more fixtures). The folder name is the fence word: lower case
letters and digits, words joined by `-` (`sankey`, `flame-graph`).

## 2. `part.ts`: parse, LLM view, checks

```ts
import { definePart } from "../types";
import { scanLines, colonSplit } from "../kit/text";
export default definePart<MyData>({
  name: "<name>",            // the folder's name
  form: "fenced",            // a code block ```<name>
  steps: true,               // does it take @step lines (input.head and input.steps hold the split)
  llmKind: "own",            // "own": llm() is what an LLM reads; "as-is": the fence as written
  parse: (input, ctx) => parseMine(input, ctx),
  llm: (data, input) => mineLlm(data),
  check: (data, input) => data.errors.map((e) => ({ line: e.line, message: e.msg })),
  dependencies: [],          // npm packages your code imports (see section 8)
});
```

- **`parse(input, ctx)`** gets `input.body` (the lines inside the fence), `input.bodyLine`, `input.line`, `input.attrs`
  (the info string's `key=value`), and with `steps: true` also `input.head` and `input.steps`. It returns your data.
- **The data is plain JSON** (no functions, no Map, no class): parse() may run on a server and the view in a browser.
- **Wrong input still returns data**, with its errors inside (for `check` and the view). Throw an `Error` only when
  nothing can be drawn; the part is then refused with your message.
- **The budget.** `ctx.budget` is your share of the page's one work budget, already named `"the <name> part"`. Call
  `ctx.budget.charge(steps, values, chars)` **before** each piece of work: steps for loop turns, values for items you
  keep, chars for text you make. Charge every loop over author text. Never catch `BudgetError`: let it go up, and the
  part is refused with "the <name> part does too much work".
- **Caps.** Read your caps from `ctx.limits.<name>Something` (never a constant): the host and the strict preset change them.
- **Linear time.** Double the input, the work at most about doubles. No regular expression that can backtrack over
  author text (no nested quantifiers like `(a+)+`, no `(.*)*`): use the kit's hand scans (`scanLines`, `colonSplit`,
  `afterWord`, `indentOf`) or write one.
- **Imports.** `part.ts` and anything it imports may import only `../types`, `../kit/text`, `../../core/budget`,
  `../../host/yaml` (`yamlParse`, and `chargeYaml` to charge what it read), `../../safety` (types), your own files and
  another part's pure files (`../flame/part`; never in a circle). Never `core/dh-lib`, `core/doccheck`, `document`, `markdown` or React: they
  load your part while they load (a test enforces it).
- **`llm(data, input)`** is plain text: what an LLM reads in place of the part. Keep a normal part under 400 tokens;
  doccheck asks for a `:::llm` block past that. A refused part reads as `[<name> not shown: <message>]` by itself.
- **Optional fields** (only when the part needs them):
  - `fences: [{ word: "json", flag: "explore" }]`: a code block ```json explore is this part; `input.attrs.lang` is "json".
    Without the flag it stays a plain code block.
  - `chartKinds: ["histogram", ...]`: a ```chart whose YAML has `kind: histogram` at the top level is this part
    (`input.body` is the chart's YAML); its doccheck messages start `chart:`.
  - `llmExempt: (data) => boolean`: true lets the LLM view go over the 400-token rule without a `:::llm` (only when the
    long text is the content, like an audio transcript).
  - A bare word in the info string is a flag: ```video loop gives `input.attrs.loop === "true"`.
- **`check(data, input)`** returns `{ line?, level?, message }[]`. Every refusal names its line and says the fix in plain
  words ("write a flow as: from -> to: amount"). `level: "warn"` for a warning. The `<name>:` prefix is added for you.

## 3. `limits.ts`: both sets of caps

```ts
export const LIMITS = { sankeyFlows: 300, sankeyNodes: 120 };
export const UNTRUSTED_LIMITS: typeof LIMITS = { ...LIMITS, sankeyFlows: 150 };
```

- Every key starts with the part's name in camel case (`flame-graph` -> `flameGraphFrames`) and says what it caps.
- Whole numbers above 0. The strict set (`UNTRUSTED_LIMITS`, what chat passes) is never higher than `LIMITS`.
- This file imports nothing.
- **Caps known only in the browser** (a file's bytes, a PDF's pages, a Lottie's frames) are also keys here. `parse`
  copies them into the data (`data.caps = { mediaPdfPages: ctx.limits.mediaPdfPages }`) and the view checks them at load.

## 4. `view.tsx`: the React view

```tsx
import type { PartViewProps } from "../types";
import { useSteps, Stepper, stepKeys } from "../kit/view";
export default function MineView({ data, ui, static: stp, stage }: PartViewProps<MyData>) { ... }
```

- **Props:** `data` (what parse returned), `block` (id, line, attrs, llm), `ui` (the renderer's words), `static`, `stage`.
- **`stage`**: `width` (the CSS pixels you may use, measured by the frame; **0 on the server and before the first
  measure**: draw something sensible at 0), `theme` (`"light" | "dark"`), `motion` (`"off"`: draw no motion) and
  `report({ width, height })`. The frame never lays out, scales or clips what you draw: a part may place every box, line
  and word itself, at any width, and report the size it drew at.
- **`static`** (a `StaticProp`): `undefined` not asked; `false` live (print is still static); `""` the finished state;
  `"<n>"` step n from 1; anything else a step's title. Use `useSteps(n, static, titles)` from the kit: it handles the
  fence, the document, print and reduce-motion. A static part draws one state whole: no player, no control row, no motion.
- **Steps:** `useSteps` + `<Stepper>` + `onKeyDown={stepKeys(st, n)}` on the part's root (left and right arrows).
- **The same box before and after the script:** a step changes what is shown, never the size; the controls never move.
- **No HTML strings:** no `innerHTML`, `dangerouslySetInnerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`,
  `new Function`, `document.write`, string timers. Words are real text (SVG `<text>` or HTML), never pictures of words.
- **Phone:** no word under 11 px, no sideways scroll of the page at 390 and 360 (a wide drawing scrolls inside its own
  `.dh-box`), touch targets at least 24 px, every mouse action also by keys with a visible focus ring.
- **A layout made while drawing** pays from a budget of its own (`new Budget(partLimitsOf(), null, null, "the <name>
  part")`, made per data in `useMemo`), never the page's.
- The kit (`src/parts/kit/view.tsx`) has the step player, `Lines` (SVG text lines), the colour variables (`colBase`,
  `colSoft`, `colInk`) and the one popover card (`usePopover(hostRef, ui.close)`: spread `pop.bind(id, { title, meta })`
  on what opens it, render `pop.node`, and give the part's root the class `dh-pop-host`). Use them; do not copy them.

## 5. `style.css`: tokens and rules

```css
:root { --sankey-band-opacity: .45; --sankey-node-w: 12px; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --sankey-band-opacity: .55; }
}
:root[data-theme="dark"] { --sankey-band-opacity: .55; }
.sankey-band { opacity: var(--sankey-band-opacity); }
```

- One `:root` block. Every token you declare starts with `--<name>-`. The two dark blocks hold the same values.
- Colours are the base tokens (`var(--c1)`, `var(--acc)`, `var(--surface)`, `var(--ink)` ...). No hex value anywhere.
- Width rules use container queries on the stage (`@container (max-width: 600px) { ... }`), not the window width.
- The build scopes every rule under `.dh-doc`; write plain selectors with your part's own class prefix.

## 6. Tests: `<name>.test.ts`

Copy `src/parts/fishbone/fishbone.test.ts` and change it. It must have:

1. **Parse:** a good source gives a block of your type with the right data, and `check()` gives `[]`; the data survives
   `JSON.parse(JSON.stringify(...))`.
2. **The LLM view:** the exact text for a sample, and that the page's `doc.llm` carries it; a `:::llm` replaces it.
3. **Every refusal** in your spec section: one case each, matching its message.
4. **Caps:** the keys in `LIMITS` and `UNTRUSTED_LIMITS`; a source over a cap is refused (also with a host's lower cap
   via `parse(text, { limits: { <name>X: n } })`); a source over the work budget (`limits: { maxEvalSteps: small }`) is
   an error block whose message starts `the <name> part`, and the page's LLM view says `[<name> not shown: ...]`.
5. **The doubling test:** parse (and any layout) at n and 2n with a counting `Budget`; the cost ratio is between 1.5 and
   2.3 at three sizes. Count charges, never time. Plus a long single line.
6. **The fixtures:** every `good-*` has 0 problems and draws the part; every `hostile-*` is refused with a line, in both
   `LIMITS` and `UNTRUSTED_LIMITS`, and its parse never throws past the budget.

Run only your files:

```
bun test ./src/parts/<name>/<name>.test.ts ./test/parts.test.ts
```

`test/parts.test.ts` checks the folder rules and that the generated files are current.

## 7. The generator and the browser check

1. `bun scripts/parts.ts` after you add or rename a file, a cap or the spec. It writes the registry, the caps, the
   React list, the CSS list, `fixtures/parts/samples.dh.md` and your section in `SPEC.md`. Commit what it wrote with
   your folder. `bun scripts/parts.ts --check` says whether anything is stale.
2. The browser check loads only your sample, at 1280 and 390, light and dark, then a browser-only render under strict
   Trusted Types. It builds into `dist/part-check/<name>/` and writes `shots/` and `result.json` there:

```
bun scripts/part-check.ts <name>
```

   It must end `part-check <name>: ok`. Look at every screenshot it made. It closes its own browser and server.
3. `tsc -p .` with no new errors.
4. `bun scripts/hygiene.ts` and `bun scripts/public-text.ts`: 0 hits. No names, paths, emails or internal ids anywhere
   in the folder (use example.com and 192.0.2.x).

## 8. Porting a part from the prototype

1. Find its files on the prototype branch: the parser in `tools/<file>.ts`, the view in `site/src/<file>.tsx`, its CSS,
   its tokens (in the prototype's `theme.css`, a block headed `/* p11 <helper> */`), its SPEC section, its Format page
   sample and its tests. Never copy from the prototype's private folders.
2. Parser to `part.ts` (and `layout.ts` if it has one). Replace `docBudget().charge(what, work, memory)` with
   `ctx.budget.charge(work, memory)` (steps, values; chars for text made). Move every fixed cap to `limits.ts` and read
   it from `ctx.limits`. Replace prototype helpers (`drawn-common`, `part11`) with the kit's; a helper the kit lacks goes
   into your folder.
3. View to `view.tsx`: props become `PartViewProps`; the prototype's `static` prop is the same `StaticProp`; a width
   it measured itself comes from `stage.width`. Remove `data-dh-part` from your root (the frame sets it).
4. Tokens: rename `--<short>-*` to `--<name>-*` in your CSS and view.
5. A library (only those in the prototype's LIBRARIES.md, at that exact version): ask your lead to add it to
   `package.json` dependencies (a shared file), then list it in `dependencies`.
6. Its SPEC section to `spec.md` (`####` heading, one example, the caps, the doccheck refusals), its sample to `sample.md`.
7. Its tests to `<name>.test.ts`, then add what section 6 asks for that it lacks.

## 9. The gate (CONTRACT-21 section 4): when the part's hold lifts

All of this, in the tagged package:

- It charges the one page budget under its own name, has the doubling test and a hostile fixture.
- It has values in both `LIMITS` and `UNTRUSTED_LIMITS`.
- `part-check <name>: ok`, its tests pass, tsc adds no error, hygiene and public-text are 0.
- The release notes carry its caps in both sets and its measured worst time for both.

A part that has not passed ships alone in a later 0.7.x and holds nothing up.

## 10. A part of a sentence (the inline hook)

A part may also live **inside a sentence**: a sparkline (`:spark[3,5,2,8,9]`), a term with its meaning. It adds itself to the
Markdown core with two more files in its folder, and the generator lists it (`INLINE_PARTS`, `FOLDER_INLINE_COMPONENTS`). A
folder with an `inline.ts` and **no** `part.ts` is an inline part only: it needs `inline.ts`, `inline-view.tsx`, `limits.ts`,
`style.css`, `spec.md`, `sample.md`, the test and the fixtures (no `part.ts`, no `view.tsx`). A folder with both (`glossary`: a
block and its terms in the prose) keeps every file of sections 1 to 7 and adds the two.

| File | What it holds |
| --- | --- |
| `inline.ts` | `export default defineInline<State, Data>({ name, prepare?, scan, section?, llm?, check?, rank? })` (from `../inline`) |
| `inline-view.tsx` | `export default function <Name>Inline(props: InlineViewProps<Data>)`: `text`, `data`, `ui`, `static` |

```ts
export default defineInline<{ cap: number }, Spark>({
  name: "spark",
  rank: -1,                                          // a part with a marker of its own reads before parts that match words
  prepare: (page) => ({ cap: page.limits.sparkValues }),   // once per page; null = nothing to do here, scan is never called
  scan(text, state, budget) { return [{ from, to, data }]; },   // once per plain text run; ranges in order, no overlap
  llm: (data, text) => "(3, 5, 2, 8, 9)",            // what an LLM reads instead (optional; then no `prepare` state may depend on the page)
});
```

- **`prepare(page)`** runs once per page: `page.frontMatter`, `page.blocks` (the page's own blocks of this part: a
  ```` ```glossary ```` fence, `input.body` and so on, tabs included), `page.limits` and `page.budget`. It returns the part's
  state, or `null` when the page has nothing for it.
- **`scan(text, state, budget)`** is called once per **plain text run** of a paragraph, list item, quote, callout or table cell,
  in page order. Never inside code, a link, an image, a heading, a table's rule row or an HTML tag. The offsets are in `text`
  (character references like `&amp;` are already the characters they stand for). Return `{ from, to, data }[]` in order, not
  overlapping; the core makes each one the node `{ t: "ref", name, text, data }`, which the document draws with your
  `inline-view.tsx`. A range that overlaps, is out of the text or is not a whole number is dropped, with a problem on the page.
  `problem: "..."` on a hit (and `level: "warn"`) reports a wrong use with its line; the text stays as written and no other part reads it.
- **`section(state, depth)`** (optional) is called at every heading with its depth (1 to 6): a part that marks only the first
  use in a section starts again at depth 1 or 2.
- **`check(state)`** (optional) is called once after the page's text was read: problems about the whole page (a term the text never uses).
- **`llm(data, text)`** (optional): the LLM view reads `llm(...)` in place of the range. It runs on the Markdown source, with the state of an empty page.
- **The work.** The core charges the page's budget **one step per character offered** to your part, and gives `scan` a budget of its
  own of a fixed number of steps per character (`INLINE_STEPS_PER_CHAR`): a scan that is not linear in its text stops early with
  "the <name> part does too much work", the rest of the text stays as written, and the page keeps its own budget. Charge `budget`
  for the work you do (a step per match, per word), as in section 2. Never catch `BudgetError`. Hand scans only: no regular
  expression that can backtrack over author text, and a search that finds its next match once and keeps it (see
  `replaceBracketed` in `core/dh-lib.ts`) rather than searching to the end of the text again from every start.
- **Where the parts meet.** Parts read a text in `rank` order (default 0, then by name); a part sees the ranges of the parts before
  it as filler characters (so a word part never reads inside `:spark[...]`).
- **Imports.** `inline.ts` follows the rules of `part.ts` (section 2): `../inline`, `../kit/text`, `../../core/budget`, `../../safety`
  (types), your own pure files and another part's; never `core/dh-lib`, `core/doccheck`, `document`, `markdown` or React.
- **Tests.** Section 6, with the doubling test on `scan` (charges at n and 2n, three sizes) and one in time on a text of many near-matches,
  and the fixtures read with `path: "x.md"` when the page has no block part. `part-check <name>` finds an inline part by its frame
  (`[data-dh-inline="<name>"]`), puts a real mouse over the first one and takes a second shot.
