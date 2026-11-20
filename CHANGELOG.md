# Changelog

This package follows [semantic versioning](https://semver.org). Before 1.0.0 a minor version may change the API;
every such change is listed here. The `Document` shape has its own number (`doc.ast`) and the format its own
(`doc.format`, SPEC.md).

## 0.2.0

### Added

- **`texts` on every animation block** of the parse tree (`Document`, the JSON that `dh json` prints): an array of strings,
  the labels, captions, say texts and note texts the scene compiler reads, in story order (SPEC.md section 6.11).
  A scene with none has `[]`. Additive: no field is renamed or removed, and every other part of the output is
  byte-equal to 0.1.0 (`ast` stays 1).
- **`animationTexts(block)`** exported from `durian-hypermedia`: the same list for an `AnimationBlock`, compiled from
  `block.anim`, so a tool never reaches into scene internals and a block from older JSON still works.

### Changed

- `AnimationBlock` now has a required `texts: string[]` (type level: code that builds an `AnimationBlock` by hand must add it;
  `parse()` always fills it). `animationTexts` takes any block with an `anim`, so a block read from 0.1.0 JSON still works.
- This package is now the source of `src/core`, `src/ui` and `SPEC.md`. The file headers say so; `scripts/sync.ts`
  (a copy from the first private prototype) is frozen and no longer to be run.

## 0.1.0 (first public version; git tag v0.1.0)

### Added

- **The format**: SPEC.md (format version 8): plain Markdown plus fenced parts (terminal, file tree, editor, code walk,
  chart, mermaid, animation, tier list, alignment grid) and `:::` containers (tabs, accordion, human, llm).
- **The parser**: `parse(text, options)` to a typed `Document` (`ast: 1`), pure: no DOM, no files, no network; runs in
  Bun, Node, a browser or a worker (outside Bun, set a YAML parser once with `setYamlParser`).
- **The LLM view** `llmView(doc)` and **the checks** `check(doc)` as functions.
- **Safety**: raw HTML shown as text; a URL policy hook for every link and image; caps on input size, block count,
  nesting depth, animation things and steps, chart points and items, each giving an error block; mermaid drawn strict
  and cleaned; ids prefixed. A hostile fixture set with a test per attack.
- **Colours for code** on the server: `highlight(doc)` from `durian-hypermedia/server`.
- **The React renderer** (React 18 and 19): `DhDocument`, `DocumentView` with only the parts you pass, one entry per
  part, hydration helpers. No eval, no WebAssembly, no network in the browser; proved under a strict CSP.
- **Theming**: every token documented in THEME.md, scoped under `.dh-doc`; `variant` (with `flat` and `bold` as
  examples), `slots` for the chrome, `theme`, `motion="off"`; `prefers-reduced-motion` honoured everywhere.
- **Host extensions**: `defineBlock` / `registerBlock` for the host's own fenced blocks (parse, LLM text, check,
  component) and `defineInline` for its own inline references.
- **Pinning**: `VERSION` export; releases are git tags `v<version>` (ADOPT.md section 0).
- **Mermaid labels** are plain SVG text (`htmlLabels: false`), so the cleaned SVG keeps them and holds no foreignObject;
  a browser test checks that a flowchart's labels survive.
- **Fixtures**: one page per part and option, made from the format's samples, plus hand-written and hostile pages.
- **An example site**: every fixture, server-rendered and hydrated, with a style and theme switch.
