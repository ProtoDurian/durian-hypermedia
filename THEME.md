# Theme contract

Everything the renderer draws reads CSS custom properties ("tokens"). Change the look by setting tokens; change the shape and motion
by a variant (below). This file is made from the stylesheets by `bun scripts/theme-doc.ts`; a sync that changes the CSS changes it.

## Where tokens live

- `styles.css` sets every token on `.dh-doc` (the root element of every rendered document), never on the page's `:root`,
  so the package cannot recolour the host page and the host's own tokens of the same name do not leak in.
- **Dark:** `<html data-theme="dark">`, or `data-theme="dark"` on one document (`<DhDocument theme="dark">`), or the
  system setting when neither says `light`.
- **Map a host theme:** set the tokens on `.dh-doc` in the host's CSS, after `styles.css`:
  `.dh-doc { --acc: var(--host-accent); --surface: var(--host-card); }` and the same under the host's dark selector.
- **Fonts:** the package loads no font. `--font-sans`, `--font-mono` and `--font-display` name the host's fonts (the default lists
  fall back to the system fonts).
- The 3D stage and the charts read the tokens from their own element when they draw and again when `data-theme` changes on
  `<html>`; after changing tokens any other way, toggle `data-theme` or re-mount.

## Colours (88 tokens)

| Token | What it is for | Light default | Dark default |
| --- | --- | --- | --- |
| `--acc` | primary accent: links, focus, "the answer"; read by button.dh-chip:focus-visible, .ctl-range, .btn:hover:not(:disabled) | `#555FFF` | `#8D94FF` |
| `--acc-2` | accents; read by .coderef | `#7F87FF` | `#6C74FF` |
| `--acc-ink` | accent as text (>= 7:1 on surface); read by .btn:hover:not(:disabled), .btn-choice, .seg button[aria-pressed="true"] | `#3039C8` | `#B9BEFF` |
| `--acc-soft` | accents; read by .btn-choice, .seg button[aria-pressed="true"], .tone-acc .scn-shape | `#DEE0FF` | `#272D5C` |
| `--acc-softer` | accents; read by .callout-important, .scn-arrow-l rect, .scn-where | `#EEEFFF` | `#1A1F42` |
| `--axis` | terminal / code; read by .chart .axis | `#B6BFD3` | `#36415F` |
| `--bad` | status; read by .tone-bad, .callout-security, .callout-security .callout-icon | `#F91974` | `#FF4F96` |
| `--bad-ink` | status; read by .tone-bad, .b-removed, .cw-error | `#A80C4D` | `#FF8DBA` |
| `--bad-soft` | status; read by .tone-bad, .b-removed, .callout-security | `#FDD9E8` | `#3B1529` |
| `--bg` | page plane; read by body | `#E6E8F2` | `#070B16` |
| `--bg-glow-1` | top-right radial glow; read by body | `rgba(85, 95, 255, .13)` | `rgba(108, 116, 255, .16)` |
| `--bg-glow-2` | bottom-left radial glow; read by body | `rgba(249, 25, 116, .07)` | `rgba(240, 48, 126, .08)` |
| `--bleed-l` | read by .scn, anim (code) | `-` | `-` |
| `--c1` | family colour 1: borders, lines and dots of family 1 (animation, tier list, alignment grid, chart); read by .tone-c1, .tl, .cc-1 | `#555FFF` | `#8A92FF` |
| `--c1-ink` | family 1: its words on small tags; read by .tone-c1, .tl, .cc-1 | `#3039C8` | `#B4B9FF` |
| `--c1-soft` | family 1: its pale fill; read by .tone-c1, .tl, .cc-1 | `#E3E5FF` | `#262B57` |
| `--c2` | family colour 2: borders, lines and dots of family 2 (animation, tier list, alignment grid, chart); read by .tone-c2, .cc-2, chart-config (code) | `#0E9F9A` | `#2DD4BF` |
| `--c2-ink` | family 2: its words on small tags; read by .tone-c2, .cc-2, chart-config (code) | `#0A6662` | `#7EE8DA` |
| `--c2-soft` | family 2: its pale fill; read by .tone-c2, .cc-2, chart-config (code) | `#D3F2EF` | `#143633` |
| `--c3` | family colour 3: borders, lines and dots of family 3 (animation, tier list, alignment grid, chart); read by .tone-c3, .cc-3, chart-config (code) | `#D99A00` | `#F2C94C` |
| `--c3-ink` | family 3: its words on small tags; read by .tone-c3, .cc-3, chart-config (code) | `#7A5600` | `#F7DD8C` |
| `--c3-soft` | family 3: its pale fill; read by .tone-c3, .cc-3, chart-config (code) | `#FBEFC9` | `#3A3112` |
| `--c4` | family colour 4: borders, lines and dots of family 4 (animation, tier list, alignment grid, chart); read by .tone-c4, .cc-4, chart-config (code) | `#9A5CF5` | `#B794FF` |
| `--c4-ink` | family 4: its words on small tags; read by .tone-c4, .cc-4, chart-config (code) | `#5F2DB3` | `#D2BCFF` |
| `--c4-soft` | family 4: its pale fill; read by .tone-c4, .cc-4, chart-config (code) | `#EDE2FF` | `#2E2350` |
| `--c5` | family colour 5: borders, lines and dots of family 5 (animation, tier list, alignment grid, chart); read by .tone-c5, .cc-5, chart-config (code) | `#F26B1D` | `#FF8A3D` |
| `--c5-ink` | family 5: its words on small tags; read by .tone-c5, .cc-5, chart-config (code) | `#9E4008` | `#FFB27F` |
| `--c5-soft` | family 5: its pale fill; read by .tone-c5, .cc-5, chart-config (code) | `#FFE4D3` | `#3A2414` |
| `--c6` | family colour 6: borders, lines and dots of family 6 (animation, tier list, alignment grid, chart); read by .tone-c6, .cc-6, chart-config (code) | `#1F8FE0` | `#5AB4FF` |
| `--c6-ink` | family 6: its words on small tags; read by .tone-c6, .cc-6, chart-config (code) | `#0F5D99` | `#9CD2FF` |
| `--c6-soft` | family 6: its pale fill; read by .tone-c6, .cc-6, chart-config (code) | `#D8ECFB` | `#15304A` |
| `--c7` | family colour 7: borders, lines and dots of family 7 (animation, tier list, alignment grid, chart); read by .tone-c7, .cc-7, chart-config (code) | `#E2408A` | `#FF6FAE` |
| `--c7-ink` | family 7: its words on small tags; read by .tone-c7, .cc-7, chart-config (code) | `#9C1C56` | `#FF9DC8` |
| `--c7-soft` | family 7: its pale fill; read by .tone-c7, .cc-7, chart-config (code) | `#FCDDEB` | `#3D1A2A` |
| `--c8` | family colour 8: borders, lines and dots of family 8 (animation, tier list, alignment grid, chart); read by .tone-c8, .cc-8, chart-config (code) | `#3FA34D` | `#6FD67E` |
| `--c8-ink` | family 8: its words on small tags; read by .tone-c8, .cc-8, chart-config (code) | `#216D2B` | `#A2E8AC` |
| `--c8-soft` | family 8: its pale fill; read by .tone-c8, .cc-8, chart-config (code) | `#DDF1DF` | `#17351C` |
| `--ch-5` | code colours (Code Hike theme github-from-css): function; read by .t-pr.t-root, .t-q | `#FF8DBA` | `#FF8DBA` |
| `--ch-6` | code colours (Code Hike theme github-from-css): function; read by .t-pr | `#8FE3B0` | `#8FE3B0` |
| `--ch-11` | code colours (Code Hike theme github-from-css): diff deleted bg; read by .ch-del | `rgba(249, 25, 116, .22)` | `rgba(249, 25, 116, .22)` |
| `--ch-12` | code colours (Code Hike theme github-from-css): diff inserted bg; read by .ch-add | `rgba(28, 170, 83, .22)` | `rgba(28, 170, 83, .22)` |
| `--ch-17` | code colours (Code Hike theme github-from-css): line highlight; read by .ch-focus | `rgba(85, 95, 255, .20)` | `rgba(85, 95, 255, .20)` |
| `--ch-22` | code colours (Code Hike theme github-from-css): tab strip; read by .cw-file, .ide-chrome, .ide-tabs | `#0A0E1B` | `#03050D` |
| `--ch-24` | code colours (Code Hike theme github-from-css): line numbers; read by .ch-ln | `#56627C` | `#56627C` |
| `--faint` | meta text, only at weight >= 400 (>= 4.5:1); read by .al-ax-x::before, .al-ax-x::after, .al-ax-y | `#56627C` | `#98A3BC` |
| `--good` | status; read by .tone-good, .ch-add, .tone-good .scn-shape | `#1CAA53` | `#34C76E` |
| `--good-ink` | status; read by .tone-good, .b-new, .chg | `#0B6B33` | `#7BE3A4` |
| `--good-soft` | status; read by .tone-good, .b-new, .fx-row.is-new | `#DCF1E3` | `#11301F` |
| `--grid` | terminal / code; read by .chart .grid, chart-config (code) | `#E3E7F0` | `#1D2439` |
| `--hot` | second accent: the problem, "not this"; read by .ch-del, .cw-error, .b-conflict | `#F91974` | `#FF4F96` |
| `--hot-ink` | accents; read by .scn-ptr-t, .scn-send-chip text, .scn-ent.k-token.tone-hot .scn-chip-t | `#A80C4D` | `#FF8DBA` |
| `--hot-soft` | accents; read by .b-conflict, .tone-hot .scn-shape, .tone-hot .scn-person .scn-shape | `#FDD9E8` | `#3B1529` |
| `--info` | status; read by .callout-icon | `#555FFF` | `#8D94FF` |
| `--info-ink` | status; read by .b-generated, .mk-info | `#3039C8` | `#B9BEFF` |
| `--info-soft` | status; read by .b-generated, .callout-important, .callout-note | `#EEEFFF` | `#1A1F42` |
| `--ink` | headings, key text; read by .dh-chip, .dh-note b, .tl-title | `#00081C` | `#F4F6FB` |
| `--ink-2` | body text (thin weight needs >= 7:1); read by .dh-note, .al-col, .al-row | `#273143` | `#DCE1EC` |
| `--k` | animation, format version 4: one stage, a camera, entities drawn with page tokens only; read by .scn-ent.cc .scn-shape, .scn-ent.cc .scn-line, .scn-ent.cc .scn-frame | `var(--c1)` | `var(--c1)` |
| `--k-ink` | animation, format version 4: one stage, a camera, entities drawn with page tokens only; read by .scn-ent.cc .scn-chip-t, .scn-ent.cc .scn-ptr-t, .scn-conn.cc .scn-conn-t | `var(--c1-ink)` | `var(--c1-ink)` |
| `--k-soft` | animation, format version 4: one stage, a camera, entities drawn with page tokens only; read by .scn-ent.cc .scn-shape, .scn-ent.cc .scn-frame, .scn-ent.cc .scn-person .scn-shape | `var(--c1-soft)` | `var(--c1-soft)` |
| `--line` | hairline borders; read by .tl, .tl-row, .al-cell | `#D0D6E3` | `#232B44` |
| `--line-2` | stronger borders, axes; read by .btn, .seg, .cc select | `#B6BFD3` | `#36415F` |
| `--mark-bg` | highlight marker; read by .st-state tr.is-changed td | `#FFF0A8` | `#5B4A00` |
| `--mark-ink` | text techniques; read by .st-state tr.is-changed td | `#00081C` | `#FFF6CC` |
| `--meter` | status; read by .scn-meter-fill | `#1B2540` | `#EEF1F8` |
| `--meter-track` | status; read by .scn-meter-track | `#D5DAE6` | `#36415F` |
| `--muted` | secondary text, captions (>= 7:1 on surface and page); read by .dh-note-hint, .al-cell-label, .part-intro | `#3A4560` | `#B4BDD1` |
| `--nx` | read by .al-grid, .al-arrows .al-grid, align (code) | `-` | `-` |
| `--ny` | read by .al-has-points .al-cell, align (code) | `-` | `-` |
| `--on-acc` | text on a solid accent / status fill; read by .btn-go, .btn-go:hover:not(:disabled), .cw-num | `#FFFFFF` | `#070B16` |
| `--series-1` | chart series 1; read by .chart .bar.s1, .chart .line.s1, .legend .sw.s1 | `#555FFF` | `#6C74FF` |
| `--series-2` | chart series 2; read by .chart .bar.s2, .chart .line.s2, .legend .sw.s2 | `#F91974` | `#F0307E` |
| `--series-3` | chart series 3; read by chart-config (code) | `#0E9FB8` | `#1496AC` |
| `--series-4` | chart series 4; read by chart-config (code) | `#F2690B` | `#E2620C` |
| `--series-5` | chart series 5; read by chart-config (code) | `#1CAA53` | `#1E9C4F` |
| `--surface` | cards, panels, chart surface; read by .dh-chip, .dh-chip.has-note::after, .tl | `#FFFFFF` | `#0F1424` |
| `--surface-2` | inset rows, zebra, inactive tabs; read by .dh-note, .al-cell, .fx-head | `#F2F4F9` | `#151B2E` |
| `--surface-3` | pressed / track; read by .scn-idx-cell, .tone-muted .scn-shape, .scn-band | `#E3E7F0` | `#1D2439` |
| `--term` | terminal / code; read by .ch-pre, .cw-error, .ide | `#0F1424` | `#060914` |
| `--term-2` | terminal / code; read by .ide-side, .ide-drawer | `#171D30` | `#0D1120` |
| `--term-faint` | terminal / code; read by .code-lang, .cw-file, .cw-repo | `#95A2BC` | `#95A2BC` |
| `--term-ink` | terminal / code; read by .ch-pre, .cw-path, .ide | `#D3D9E6` | `#D3D9E6` |
| `--term-line` | terminal / code; read by .code-block, .cw, .ide | `#232B44` | `#232B44` |
| `--untested-ink` | status; read by .mk-untested | `#3A4560` | `#C5CDDD` |
| `--untested-soft` | status; read by .mk-untested | `#E3E7F0` | `#1D2439` |
| `--warn` | status; read by .tone-warn, .tone-warn .scn-shape, .hl-warn .scn-ring | `#FF760D` | `#FF8F3A` |
| `--warn-ink` | status; read by .tone-warn, .b-changed, .scn3-l.tone-warn | `#9A4200` | `#FFB984` |
| `--warn-soft` | status; read by .tone-warn, .b-changed, .tone-warn .scn-shape | `#FFE3CE` | `#3A2410` |

## Shape, type, space and motion (31 tokens)

| Token | What it is for | Light default | Dark default |
| --- | --- | --- | --- |
| `--col` | animation tones: one colour per role, the same on every page; read by .page, .page.has-side | `46rem` | `46rem` |
| `--dur` | motion; read by .st-panel.is-active.is-fresh | `320ms` | `320ms` |
| `--dur-fast` | motion; read by .st-dot::after, .card | `160ms` | `160ms` |
| `--ease` | motion; read by .fx-row.is-new, .st-panel.is-active.is-fresh, .card | `cubic-bezier(.2, .75, .25, 1)` | `cubic-bezier(.2, .75, .25, 1)` |
| `--font-display` | type; read by h1.title, h2, .part-name | `"Poppins", system-ui, -apple-system, "Segoe UI", sans-serif` | `"Poppins", system-ui, -apple-system, "Segoe UI", sans-serif` |
| `--font-mono` | type; read by .ctl-count, .cw-num, .ch-pre | `"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace` | `"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace` |
| `--font-sans` | type; read by .dh-chip, .al-cell-label, .al-region-label | `"Poppins", system-ui, -apple-system, "Segoe UI", sans-serif` | `"Poppins", system-ui, -apple-system, "Segoe UI", sans-serif` |
| `--fs-2xl` | h2 band title; read by h2 | `clamp(1.75rem, 5.4vw, 2.75rem)` | `clamp(1.75rem, 5.4vw, 2.75rem)` |
| `--fs-3xl` | h1 page title; read by h1.title | `clamp(2.25rem, 8vw, 4.25rem)` | `clamp(2.25rem, 8vw, 4.25rem)` |
| `--fs-l` | 20px: lead; read by .lead, .part-name, .card-t | `1.25rem` | `1.25rem` |
| `--fs-m` | 17px: body; read by .tl-label, body, .dh-doc | `1.0625rem` | `1.0625rem` |
| `--fs-s` | 15px: captions, chips; read by .tl-title, .tl-label, .part-intro | `.9375rem` | `.9375rem` |
| `--fs-xl` | h3; read by .three-h, h3 | `clamp(1.375rem, 3.6vw, 1.75rem)` | `clamp(1.375rem, 3.6vw, 1.75rem)` |
| `--fs-xs` | 13px: meta, kicker; read by .dh-chip, .dh-note, .al-col | `.8125rem` | `.8125rem` |
| `--gutter` | page side gutter (16px on phones); read by .site-head, .page, .site-foot | `clamp(16px, 4.5vw, 48px)` | `clamp(16px, 4.5vw, 48px)` |
| `--lh-body` | type; read by body, .dh-doc | `1.62` | `1.62` |
| `--lh-head` | type; read by h1.title | `1.06` | `1.06` |
| `--ls-head` | type; read by h1.title | `-.03em` | `-.03em` |
| `--ls-kicker` | type; read by .kicker | `.18em` | `.18em` |
| `--r-l` | shape; read by .cw, .ide, .fx | `20px` | `20px` |
| `--r-m` | shape; read by .tl, .code-block, .toc-block | `14px` | `14px` |
| `--r-pill` | shape; read by .btn, .seg, .ide-drawer | `999px` | `999px` |
| `--r-s` | shape; read by .dh-note, .tl-row, .al-cell | `8px` | `8px` |
| `--s-2` | space; read by .dh-doc .dh-spinner | `8px` | `8px` |
| `--s-3` | space; read by .dh-doc .dh-error, .dh-doc .dh-raw | `12px` | `12px` |
| `--s-4` | space; read by .dh-doc .dh-error | `16px` | `16px` |
| `--shadow-md` | shape; read by a.card:hover, .dh-doc[data-dh-variant="bold"] :is(.ter | `0 6px 16px rgba(0, 8, 28, .10), 0 1px 3px rgba(0, 8, 28, .06)` | `0 6px 18px rgba(0, 0, 0, .45), 0 1px 3px rgba(0, 0, 0, .30)` |
| `--shadow-sm` | shape; read by .al-lab .dh-chip, .cw, .ide | `0 1px 2px rgba(0, 8, 28, .06), 0 2px 6px rgba(0, 8, 28, .05)` | `0 1px 2px rgba(0, 0, 0, .40)` |
| `--w-body` | type; read by body, .dh-doc | `300` | `300` |
| `--w-head` | type; read by h1.title | `600` | `600` |
| `--w-strong` | bold = the ONE key point; read by strong, .dh-doc .dh-error b | `600` | `600` |

## Other tokens (1)

| Token | What it is for | Light default | Dark default |
| --- | --- | --- | --- |
| `--page-w` | animation, format version 4: one stage, a camera, entities drawn with page tokens only; read by .scn, anim (code) | `the page's width without a scrollbar (100vw would count the scrollbar)` | `the page's width without a scrollbar (100vw would count the scrollbar)` |


Tokens read with no default in the package (a host may set them): `--bleed-l`, `--nx`, `--ny`.

Not theme tokens: `--ar`, `--d`, `--i`, `--lw`, `--pct`, `--rows`, `--t`, `--t-ink`, `--t-soft` are set by the components on their own elements (sizes, positions, a tier's colour).

## Classes and attributes a host may style

| Selector | What it is |
| --- | --- |
| `.dh-doc` | the root of a rendered document; every rule in `styles.css` is under it |
| `.dh-doc[data-dh-variant="..."]` | the style variant (`flat` and `bold` ship; a host adds its own) |
| `.dh-doc[data-dh-motion="off"]` | motion off: every transition, morph, typing effect and chart animation is still |
| `.dh-doc[data-theme="dark"]` | this document in dark |
| `figure.part.part-<type>`, `[data-dh-part="<type>"]` | the frame around each part (`terminal`, `chart`, `animation`, a host block's name ...) |
| `.term`, `.fx`, `.ide`, `.cw`, `.chart`, `.dg`, `.scn`, `.tl`, `.al` | the terminal, file tree, editor, code walk, chart, diagram, animation stage, tier list, alignment grid |
| `.tabs`, `.tab-bar`, `.tab-panel`, `.accordion`, `.acc-item`, `.human` | the containers |
| `.ctl`, `.btn`, `.btn-go`, `.ctl-range` | the step controls (Back, Play, the slider, Next) |
| `.callout.callout-<kind>` | callouts (`note`, `tip`, `important`, `warn`, `security`); a note about the whole page is a callout under the title |
| `.dh-turn` | a block with no height at the top of a part: where the hydration queue finds the part on the page |
| `.code-block`, `.ch-pre`, `.ch-focus`, `.ch-mark`, `.ch-add`, `.ch-del` | code, and its focused, marked, added and removed lines |
| `.dh-error` | a part parse() refused (over a cap, unsafe, unreadable) |
| `.dh-spinner`, `.dh-spin` | the loading spinner (mermaid) |
| `.dh-fallback` | a part shown as text because no component was given for it |
| `.dh-raw` | raw HTML from the source, shown as text |
| `.dh-keys kbd`, `.dh-mouse` | keyboard keys and mouse actions in text |

## Variants: swapping the chrome per style

`<DhDocument variant="flat">` sets `data-dh-variant="flat"` on the root. Two variants ship in `styles.css`:

- `flat`: small corners, hairlines, no shadows, quicker motion.
- `bold`: square corners, thick ink borders, hard offset shadows, monospace headings and buttons, no transitions.

A host style writes its own the same way: override the shape and motion tokens under its attribute, then any selector above.

```css
.dh-doc[data-dh-variant="paper"] { --r-s: 2px; --r-m: 2px; --r-l: 2px; --shadow-sm: none; --shadow-md: none; --dur: 0ms; }
.dh-doc[data-dh-variant="paper"] .term { border: 1px dashed var(--line-2); }
```

For changes CSS cannot make, `slots` swap the chrome components: `Frame` (the box around each part), `Callout`,
`Error` and `Spinner`; they also draw Markdown elements your own way (`Code`, `InlineCode`, `Link`, `Table`, `Heading`) and mermaid diagrams (`Mermaid`): see ADOPT.md.

## Motion

- `prefers-reduced-motion: reduce` is honoured everywhere: CSS transitions and animations stop; the animation stage jumps to
  each step's end; streams stand still along their paths; the code walk does not morph; the terminal shows each step whole
  instead of typing; Chart.js does not animate.
- A host style can turn motion off without the reader's setting: `<DhDocument motion="off">` (sets `data-dh-motion="off"`;
  the components check for that attribute anywhere on the page).
