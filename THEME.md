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
  fall back to the system fonts). The composed stage measures its words with Poppins metrics: map `--font-sans` (or `--stg-font`) to Poppins, or a font of the same widths, else lines can run past their boxes. The package ships no font; its example self-hosts Poppins, IBM Plex Mono and the KaTeX maths faces (SIL OFL 1.1). Maths reads `--math-font` (default `KaTeX_Main` first): a host declares KaTeX_Main regular, italic, bold and bold-italic with local WOFF2 URLs, or maps that token to its own maths face. The example's OFL notices stay beside its font files; the package's stylesheet contains no font URLs.
- The 3D stage and the charts read the tokens from their own element when they draw and again when `data-theme` changes on
  `<html>`; after changing tokens any other way, toggle `data-theme` or re-mount.

## Colours (355 tokens)

| Token | What it is for | Light default | Dark default |
| --- | --- | --- | --- |
| `--acc` | primary accent: links, focus, "the answer"; read by button.dh-chip:focus-visible, .ctl-range, .btn:hover:not(:disabled) | `#555FFF` | `#8D94FF` |
| `--acc-2` | accents; read by .coderef | `#7F87FF` | `#6C74FF` |
| `--acc-ink` | accent as text (>= 7:1 on surface); read by .btn:hover:not(:disabled), .btn-choice, .seg button[aria-pressed="true"] | `#2E36C5` | `#B9BEFF` |
| `--acc-soft` | accents; read by .btn-choice, .seg button[aria-pressed="true"], .tone-acc .scn-shape | `#DEE0FF` | `#272D5C` |
| `--acc-softer` | accents; read by .callout-important, .scn-arrow-l rect, .scn-where | `#EEEFFF` | `#1A1F42` |
| `--ar240` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar256` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar272` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar288` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar304` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar320` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar336` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar352` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar368` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar384` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar400` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar416` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar432` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar448` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar464` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar480` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar496` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar512` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar528` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar544` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar560` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar576` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar592` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar608` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar624` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar640` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar656` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar672` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar688` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar704` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar720` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar736` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar752` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar768` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar784` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar800` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar816` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar832` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar848` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar864` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar880` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar896` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar912` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar928` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar944` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar960` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar976` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar992` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar1008` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar1024` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar1040` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar1056` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar1072` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar1088` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar1104` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar1120` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar1136` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar1152` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar1168` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar1184` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--ar1200` | read by .scn[data-wa] > .scn-stage | `-` | `-` |
| `--axis` | terminal / code; read by .chart .axis, chart-config (code) | `#B6BFD3` | `#36415F` |
| `--bad` | status; read by .tone-bad, .callout-security, .callout-security .callout-icon | `#F91974` | `#FF4F96` |
| `--bad-ink` | status; read by .tone-bad, .b-removed, :root | `#980344` | `#FE9FC3` |
| `--bad-soft` | status; read by .tone-bad, .b-removed, .fx-row.is-removed | `#FDD9E8` | `#3B1529` |
| `--bg` | page plane; read by body | `#E6E8F2` | `#070B16` |
| `--bg-glow-1` | top-right radial glow; read by body | `rgba(85, 95, 255, .13)` | `rgba(108, 116, 255, .16)` |
| `--bg-glow-2` | bottom-left radial glow; read by body | `rgba(249, 25, 116, .07)` | `rgba(240, 48, 126, .08)` |
| `--bleed-l` | read by .scn, anim (code) | `-` | `-` |
| `--c0` | family colour 0: borders, lines and dots of family 0 (animation, tier list, alignment grid, chart); read by .cc-0 | `#596172` | `#95A3C6` |
| `--c0-fill` | motion; read by :root | `var(--surface)` | `#232A3B` |
| `--c0-ink` | family 0: its words on small tags; read by .cc-0 | `var(--muted)` | `var(--muted)` |
| `--c0-plane` | motion; read by .cc-0 | `var(--c0-soft)` | `var(--c0-soft)` |
| `--c0-soft` | family 0: its pale fill; read by .cc-0, :root | `var(--c0-fill)` | `var(--c0-fill)` |
| `--c1` | family colour 1: borders, lines and dots of family 1 (animation, tier list, alignment grid, chart); read by .tone-c1, .tl, .cc-1 | `#4D42FB` | `#8A92FF` |
| `--c1-ink` | family 1: its words on small tags; read by .tone-c1, .tl, .cc-1 | `#2955A6` | `#B6BFFE` |
| `--c1-plane` | motion; read by .cc-1 | `#BAD3FE` | `#29295E` |
| `--c1-soft` | family 1: its pale fill; read by .tone-c1, .tl, .cc-1 | `#BAD3FE` | `#29295E` |
| `--c2` | family colour 2: borders, lines and dots of family 2 (animation, tier list, alignment grid, chart); read by .tone-c2, .cc-2, .pc-calc .tone-c2 | `#324F44` | `#9DFAF1` |
| `--c2-ink` | family 2: its words on small tags; read by .tone-c2, .cc-2, :root:not([data-theme="light"]) | `#006A5A` | `#19E1D5` |
| `--c2-plane` | motion; read by .cc-2 | `#91E9D4` | `#12534A` |
| `--c2-soft` | family 2: its pale fill; read by .tone-c2, .cc-2, stage (code) | `#91E9D4` | `#12534A` |
| `--c3` | family colour 3: borders, lines and dots of family 3 (animation, tier list, alignment grid, chart); read by .tone-c3, .cc-3, .pc-calc .tone-c3 | `#7E7361` | `#E5B104` |
| `--c3-ink` | family 3: its words on small tags; read by .tone-c3, .cc-3, :root:not([data-theme="light"]) | `#755E00` | `#EBBE4A` |
| `--c3-plane` | motion; read by .cc-3 | `#FCDC77` | `#644402` |
| `--c3-soft` | family 3: its pale fill; read by .tone-c3, .cc-3, stage (code) | `#FCDC77` | `#644402` |
| `--c4` | family colour 4: borders, lines and dots of family 4 (animation, tier list, alignment grid, chart); read by .tone-c4, .cc-4, .pc-calc .tone-c4 | `#6919A3` | `#E7A5FE` |
| `--c4-ink` | family 4: its words on small tags; read by .tone-c4, .cc-4, :root:not([data-theme="light"]) | `#5B348C` | `#E8A8FE` |
| `--c4-plane` | motion; read by .cc-4 | `#DCACFC` | `#553F75` |
| `--c4-soft` | family 4: its pale fill; read by .tone-c4, .cc-4, stage (code) | `#DCACFC` | `#553F75` |
| `--c5` | family colour 5: borders, lines and dots of family 5 (animation, tier list, alignment grid, chart); read by .tone-c5, .cc-5, .pc-calc .tone-c5 | `#821E00` | `#FA6E21` |
| `--c5-ink` | family 5: its words on small tags; read by .tone-c5, .cc-5, :root:not([data-theme="light"]) | `#A03F13` | `#FEAE8C` |
| `--c5-plane` | motion; read by .cc-5 | `#FFCEBC` | `#3E1600` |
| `--c5-soft` | family 5: its pale fill; read by .tone-c5, .cc-5, stage (code) | `#FFCEBC` | `#3E1600` |
| `--c6` | family colour 6: borders, lines and dots of family 6 (animation, tier list, alignment grid, chart); read by .tone-c6, .cc-6, .pc-calc .tone-c6 | `#016C9F` | `#25A6BE` |
| `--c6-ink` | family 6: its words on small tags; read by .tone-c6, .cc-6, :root:not([data-theme="light"]) | `#007694` | `#20DBFB` |
| `--c6-plane` | motion; read by .cc-6 | `#DCF5FF` | `#012930` |
| `--c6-soft` | family 6: its pale fill; read by .tone-c6, .cc-6, stage (code) | `#DCF5FF` | `#012930` |
| `--c7` | family colour 7: borders, lines and dots of family 7 (animation, tier list, alignment grid, chart); read by .tone-c7, .cc-7, .pc-calc .tone-c7 | `#A61972` | `#FA61AC` |
| `--c7-ink` | family 7: its words on small tags; read by .tone-c7, .cc-7, :root:not([data-theme="light"]) | `#852456` | `#FEA5CB` |
| `--c7-plane` | motion; read by .cc-7 | `#FFA4BC` | `#4D3339` |
| `--c7-soft` | family 7: its pale fill; read by .tone-c7, .cc-7, stage (code) | `#FFA4BC` | `#4D3339` |
| `--c8` | family colour 8: borders, lines and dots of family 8 (animation, tier list, alignment grid, chart); read by .tone-c8, .cc-8, .pc-calc .tone-c8 | `#007716` | `#AAEB6E` |
| `--c8-ink` | family 8: its words on small tags; read by .tone-c8, .cc-8, :root:not([data-theme="light"]) | `#12561F` | `#A2D774` |
| `--c8-plane` | motion; read by .cc-8 | `#85D28B` | `#283C00` |
| `--c8-soft` | family 8: its pale fill; read by .tone-c8, .cc-8, stage (code) | `#85D28B` | `#283C00` |
| `--ch-5` | code colours (Code Hike theme github-from-css): function; read by .t-pr.t-root, .t-q | `#FF8DBA` | `#FF8DBA` |
| `--ch-6` | code colours (Code Hike theme github-from-css): function; read by .t-pr | `#8FE3B0` | `#8FE3B0` |
| `--ch-11` | code colours (Code Hike theme github-from-css): diff deleted bg; read by .ch-del | `rgba(249, 25, 116, .22)` | `rgba(249, 25, 116, .22)` |
| `--ch-12` | code colours (Code Hike theme github-from-css): diff inserted bg; read by .ch-add | `rgba(28, 170, 83, .22)` | `rgba(28, 170, 83, .22)` |
| `--ch-17` | code colours (Code Hike theme github-from-css): line highlight; read by .ch-focus | `rgba(85, 95, 255, .20)` | `rgba(85, 95, 255, .20)` |
| `--ch-22` | code colours (Code Hike theme github-from-css): tab strip; read by .cw-file, .ide-chrome, .ide-tabs | `#0A0E1B` | `#03050D` |
| `--ch-24` | code colours (Code Hike theme github-from-css): line numbers; read by .ch-ln | `#56627C` | `#56627C` |
| `--class-head-bg` | read by .scn-rec-head | `-` | `-` |
| `--class-member` | read by .scn-field-t | `-` | `-` |
| `--class-static` | read by .scn-field-t.is-u | `-` | `-` |
| `--code-bg` | read by .scn .scn-code, .scn-code-bg | `-` | `-` |
| `--colmin` | read by .al-grid, .al-arrows .al-grid, align (code) | `-` | `-` |
| `--dg-edge-w` | read by .scn-conn .scn-end, [data-dh-part="state"] .scn-conn path | `-` | `-` |
| `--dg-node-bg` | read by .scn .scn-rec | `-` | `-` |
| `--dg-node-border` | read by .scn-rec-edge, .scn-rec-rule | `-` | `-` |
| `--dh-table-max` | read by .dh-doc > .table-wrap | `-` | `-` |
| `--er-head-bg` | read by [data-record="entity"] .scn-rec-head | `-` | `-` |
| `--er-key-ink` | read by .scn-key, .scn-key-t | `-` | `-` |
| `--faint` | meta text, only at weight >= 400 (>= 4.5:1); read by .al-ax-x::before, .al-ax-x::after, .al-ax-y | `#56627C` | `#98A3BC` |
| `--focus-offset` | read by .pc-seg-b:focus-visible, .ann:focus-visible | `-` | `-` |
| `--focus-ring` | read by .pc-seg-b:focus-visible, .ann:focus-visible | `-` | `-` |
| `--good` | status; read by .tone-good, .ch-add, .tone-good .scn-shape | `#1CAA53` | `#34C76E` |
| `--good-ink` | status; read by .tone-good, .b-new, .chg | `#075829` | `#7BE3A4` |
| `--good-soft` | status; read by .tone-good, .b-new, .fx-row.is-new | `#DCF1E3` | `#11301F` |
| `--grid` | terminal / code; read by .chart .grid, chart-config (code) | `#E3E7F0` | `#1D2439` |
| `--heat-hi` | dark: same family, stepped for a navy page; read by .heat-bar, .heat-bar.is-diverge, chart-config11 (code) | `#555FFF` | `#8D94FF` |
| `--heat-lo` | dark: same family, stepped for a navy page; read by .heat-bar, chart-config11 (code) | `#EEF0FA` | `#1A2040` |
| `--heat-mid` | dark: same family, stepped for a navy page; read by .heat-bar.is-diverge, chart-config11 (code) | `#F7F8FC` | `#1B2238` |
| `--heat-neg` | dark: same family, stepped for a navy page; read by .heat-bar.is-diverge, chart-config11 (code) | `#0E9F9A` | `#2DD4BF` |
| `--hot` | second accent: the problem, "not this"; read by .ch-del, .cw-error, .b-conflict | `#F91974` | `#FF4F96` |
| `--hot-ink` | accents; read by .scn-ptr-t, .scn-send-chip text, .scn-ent.k-token.tone-hot .scn-chip-t | `#980344` | `#FE9FC3` |
| `--hot-soft` | accents; read by .b-conflict, .tone-hot .scn-shape, .tone-hot .scn-person .scn-shape | `#FDD9E8` | `#3B1529` |
| `--info` | status; read by :root, .callout-icon | `#555FFF` | `#8D94FF` |
| `--info-ink` | status; read by .b-generated, :root, .mk-info | `#3039C8` | `#B9BEFF` |
| `--info-soft` | status; read by .b-generated, .callout-important, :root | `#EEEFFF` | `#1A1F42` |
| `--ink` | headings, key text; read by .scn-svg, .scn .scn-code, .scn-say-t.is-code | `#00081C` | `#F4F6FB` |
| `--ink-2` | body text (thin weight needs >= 7:1); read by .dh-note, .al-col, .al-row | `#273143` | `#DCE1EC` |
| `--ix-frame-border` | read by .dh-ix | `-` | `-` |
| `--ix-frame-radius` | read by .dh-ix | `-` | `-` |
| `--ix-off-chip` | read by .dh-ix-chip | `-` | `-` |
| `--ix-off-ink` | read by .dh-ix-chip | `-` | `-` |
| `--k` | animation, format version 4: one stage, a camera, entities drawn with page tokens only; read by .scn-ent.cc .scn-shape, .scn-ent.cc .scn-line, .scn-ent.cc .scn-frame | `var(--c1)` | `var(--c1)` |
| `--k-ink` | animation, format version 4: one stage, a camera, entities drawn with page tokens only; read by .scn-ent.cc, .scn-ent.cc .scn-chip-t, .scn-ent.cc .scn-ptr-t | `var(--c1-ink)` | `var(--c1-ink)` |
| `--k-soft` | animation, format version 4: one stage, a camera, entities drawn with page tokens only; read by .scn-ent.cc .scn-frame, .scn-ent.cc .scn-shape, .scn-ent.cc .scn-person .scn-shape | `var(--c1-soft)` | `var(--c1-soft)` |
| `--line` | hairline borders; read by .tl, .tl-row, .al-cell | `#D0D6E3` | `#232B44` |
| `--line-2` | stronger borders, axes; read by .btn, .seg, .cc select | `#B6BFD3` | `#36415F` |
| `--mark-bg` | highlight marker; read by .st-state tr.is-changed td | `#FFF0A8` | `#5B4A00` |
| `--mark-ink` | text techniques; read by .st-state tr.is-changed td | `#00081C` | `#FFF6CC` |
| `--meter` | status; read by .scn-meter-track, .scn-meter-fill | `#0A0000` | `#8E8E94` |
| `--meter-track` | status; read by .scn-meter-track | `#D5DAE6` | `#36415F` |
| `--muted` | secondary text, captions (>= 7:1 on surface and page); read by .scn-svg, .dh-note-hint, .al-more | `#3A4560` | `#B4BDD1` |
| `--nx` | read by .al-grid, .al-arrows .al-grid, align (code) | `-` | `-` |
| `--ny` | read by .al-has-points .al-cell, align (code) | `-` | `-` |
| `--on-acc` | text on a solid accent / status fill; read by .btn-go, .btn-go:hover:not(:disabled), .cw-num | `#FFFFFF` | `#070B16` |
| `--pc-fig-ml` | read by figure:has(> .chart[data-dh-layout="calc, pagecharts (code) | `-` | `-` |
| `--pc-fig-w` | read by figure:has(> .chart[data-dh-layout="calc, pagecharts (code) | `-` | `-` |
| `--pc-input-bg` | dark: same family, stepped for a navy page; read by .pc-num, .pc-select | `var(--surface)` | `var(--surface)` |
| `--pc-max` | read by pagecharts (code) | `-` | `-` |
| `--pc-per-row` | read by .pc-tiles[data-per-row], pagecharts (code) | `-` | `-` |
| `--pc-result-bg` | dark: same family, stepped for a navy page; read by .pc-result | `var(--acc-softer)` | `var(--acc-softer)` |
| `--pc-result-border` | dark: same family, stepped for a navy page; read by .pc-result | `var(--acc)` | `var(--acc)` |
| `--pc-result-fs` | dark: same family, stepped for a navy page; read by .pc-result-value | `var(--fs-xl)` | `var(--fs-xl)` |
| `--pc-result-ink` | dark: same family, stepped for a navy page; read by .pc-result-value | `var(--acc-ink)` | `var(--acc-ink)` |
| `--pc-seg-on` | dark: same family, stepped for a navy page; read by .pc-seg-b[aria-pressed="true"] | `var(--acc)` | `var(--acc)` |
| `--pc-seg-on-ink` | dark: same family, stepped for a navy page; read by .pc-seg-b[aria-pressed="true"] | `var(--on-acc)` | `var(--on-acc)` |
| `--pc-tone` | read by .pc-verdict, .pc-tile, .pc-tile-2 | `-` | `-` |
| `--ref-card-pad` | read by .dh-xref-card | `-` | `-` |
| `--ref-card-radius` | read by .dh-xref-card | `-` | `-` |
| `--ref-chip-bg` | read by .dh-xref | `-` | `-` |
| `--ref-chip-border` | read by .dh-xref | `-` | `-` |
| `--ref-chip-ink` | read by .dh-xref | `-` | `-` |
| `--ref-failed-bg` | read by .dh-xref[data-state="failed"], .dh-xref-card[data-state="failed"] | `-` | `-` |
| `--ref-failed-border` | read by .dh-xref[data-state="failed"], .dh-xref-card[data-state="failed"] | `-` | `-` |
| `--ref-failed-ink` | read by .dh-xref[data-state="failed"], .dh-xref-card[data-state="failed"] | `-` | `-` |
| `--ref-pending-bg` | read by .dh-xref[data-state="pending"], .dh-xref-card | `-` | `-` |
| `--ref-pending-border` | read by .dh-xref[data-state="pending"], .dh-xref-card | `-` | `-` |
| `--ref-pending-ink` | read by .dh-xref[data-state="pending"], .dh-xref-card | `-` | `-` |
| `--ref-radius` | read by .dh-xref | `-` | `-` |
| `--ref-refused-bg` | read by .dh-xref[data-state="refused"] | `-` | `-` |
| `--ref-refused-border` | read by .dh-xref[data-state="refused"] | `-` | `-` |
| `--ref-refused-ink` | read by .dh-xref[data-state="refused"] | `-` | `-` |
| `--ref-type-ink` | read by .dh-xref-type | `-` | `-` |
| `--scn-acc-edge` | dark: same family, stepped for a navy page; read by .tone-acc .scn-shape | `#4648E8` | `#929AFF` |
| `--scn-band-edge` | dark: same family, stepped for a navy page; read by .scn-band | `#596172` | `#95A3C6` |
| `--scn-edge` | dark: same family, stepped for a navy page; read by .scn-shape, .scn-idx-cell, :root | `#596172` | `#95A3C6` |
| `--scn-frame-edge` | dark: same family, stepped for a navy page; read by .scn-frame | `#5B616C` | `#98A3C2` |
| `--scn-good-edge` | dark: same family, stepped for a navy page; read by .tone-good .scn-shape | `#007031` | `#34C76E` |
| `--scn-hot-edge` | dark: same family, stepped for a navy page; read by .tone-hot .scn-shape | `#C00056` | `#FF75A6` |
| `--scn-muted-edge` | dark: same family, stepped for a navy page; read by .tone-muted .scn-shape | `#5B616C` | `#98A3C2` |
| `--scn-paper` | read by .scn-conn .scn-end.is-paper, .scn-end-t, .scn3-wire.is-end | `-` | `-` |
| `--scn-warn-edge` | dark: same family, stepped for a navy page; read by .tone-warn .scn-shape | `#A04600` | `#FF8F3A` |
| `--series-1` | chart series 1; read by .chart .bar.s1, .chart .line.s1, .legend .sw.s1 | `#555FFF` | `#6C74FF` |
| `--series-2` | chart series 2; read by .chart .bar.s2, .chart .line.s2, .legend .sw.s2 | `#F91974` | `#F0307E` |
| `--series-3` | chart series 3; read by chart-config (code) | `#0E9FB8` | `#1496AC` |
| `--series-4` | chart series 4; read by chart-config (code) | `#F2690B` | `#E2620C` |
| `--series-5` | chart series 5; read by chart-config (code) | `#1CAA53` | `#1E9C4F` |
| `--state-bg` | read by [data-dh-part="state"] .k-box .scn-shape | `-` | `-` |
| `--state-border` | read by [data-dh-part="state"] .k-box .scn-shape | `-` | `-` |
| `--state-current` | read by [data-dh-part="state"] .tone-acc .scn-sh | `-` | `-` |
| `--state-dot` | read by .k-initial .scn-dot-fill, .k-final .scn-ring-out, .k-final .scn-dot-fill | `-` | `-` |
| `--state-event` | read by [data-dh-part="state"] .scn-conn-t | `-` | `-` |
| `--stg-ar` | read by .stg > .stg-box-wrap.stg-ratio-print, stage (code) | `-` | `-` |
| `--stg-bg` | read by .stg, .stg-foot, .stg-t.stg-halo | `-` | `-` |
| `--stg-boxmin` | read by .stg > .stg-box-wrap, stage (code) | `-` | `-` |
| `--stg-btn-bg` | read by .stg-btn, .stg-stepbtn | `-` | `-` |
| `--stg-btn-edge` | read by .stg-btn, .stg-stepbtn | `-` | `-` |
| `--stg-corner-w` | read by .stg-corner-line | `-` | `-` |
| `--stg-cross-fade` | read by .stg-cross-line | `-` | `-` |
| `--stg-cross-w` | read by .stg-cross-line | `-` | `-` |
| `--stg-dash` | read by .stg-edge.stg-dash .stg-line | `-` | `-` |
| `--stg-dim` | read by .stg-dim | `-` | `-` |
| `--stg-edge` | read by .stg, .stg-foot | `-` | `-` |
| `--stg-f0-d` | read by :root:not([data-theme="light"]) .stg-svg, :root[data-theme="dark"] .stg-svg[data-f | `-` | `-` |
| `--stg-f0-l` | read by .stg-svg[data-fills~="c0"] | `-` | `-` |
| `--stg-f1-d` | read by :root:not([data-theme="light"]) .stg-svg, :root[data-theme="dark"] .stg-svg[data-f | `-` | `-` |
| `--stg-f1-l` | read by .stg-svg[data-fills~="c1"] | `-` | `-` |
| `--stg-f2-d` | read by :root:not([data-theme="light"]) .stg-svg, :root[data-theme="dark"] .stg-svg[data-f | `-` | `-` |
| `--stg-f2-l` | read by .stg-svg[data-fills~="c2"] | `-` | `-` |
| `--stg-f3-d` | read by :root:not([data-theme="light"]) .stg-svg, :root[data-theme="dark"] .stg-svg[data-f | `-` | `-` |
| `--stg-f3-l` | read by .stg-svg[data-fills~="c3"] | `-` | `-` |
| `--stg-f4-d` | read by :root:not([data-theme="light"]) .stg-svg, :root[data-theme="dark"] .stg-svg[data-f | `-` | `-` |
| `--stg-f4-l` | read by .stg-svg[data-fills~="c4"] | `-` | `-` |
| `--stg-f5-d` | read by :root:not([data-theme="light"]) .stg-svg, :root[data-theme="dark"] .stg-svg[data-f | `-` | `-` |
| `--stg-f5-l` | read by .stg-svg[data-fills~="c5"] | `-` | `-` |
| `--stg-f6-d` | read by :root:not([data-theme="light"]) .stg-svg, :root[data-theme="dark"] .stg-svg[data-f | `-` | `-` |
| `--stg-f6-l` | read by .stg-svg[data-fills~="c6"] | `-` | `-` |
| `--stg-f7-d` | read by :root:not([data-theme="light"]) .stg-svg, :root[data-theme="dark"] .stg-svg[data-f | `-` | `-` |
| `--stg-f7-l` | read by .stg-svg[data-fills~="c7"] | `-` | `-` |
| `--stg-f8-d` | read by :root:not([data-theme="light"]) .stg-svg, :root[data-theme="dark"] .stg-svg[data-f | `-` | `-` |
| `--stg-f8-l` | read by .stg-svg[data-fills~="c8"] | `-` | `-` |
| `--stg-fade` | read by .stg-i | `-` | `-` |
| `--stg-fig-ml` | read by figure.part-animation:has(.stg), .page.has-side figure.part-animation:has, stage (code) | `-` | `-` |
| `--stg-fig-w` | read by figure.part-animation:has(.stg), stage (code) | `-` | `-` |
| `--stg-flow` | read by .stg-dot | `-` | `-` |
| `--stg-font` | read by .stg-t | `-` | `-` |
| `--stg-fs-big` | read by .stg-f-big | `-` | `-` |
| `--stg-fs-body` | read by .stg-f-body | `-` | `-` |
| `--stg-fs-chip` | read by .stg-f-chip | `-` | `-` |
| `--stg-fs-lane` | read by .stg-f-lane | `-` | `-` |
| `--stg-fs-mono` | read by .stg-f-mono | `-` | `-` |
| `--stg-fs-small-b` | read by .stg-f-small-b | `-` | `-` |
| `--stg-fs-sub` | read by .stg-f-sub | `-` | `-` |
| `--stg-fs-title` | read by .stg-f-title | `-` | `-` |
| `--stg-gap` | read by .stg | `-` | `-` |
| `--stg-halo` | read by .stg-box.stg-hot | `-` | `-` |
| `--stg-hint` | read by .stg, stage (code) | `-` | `-` |
| `--stg-hot-w` | read by .stg-box.stg-hot | `-` | `-` |
| `--stg-line-hot-w` | read by .stg-edge.stg-hot .stg-line | `-` | `-` |
| `--stg-line-w` | read by .stg-line | `-` | `-` |
| `--stg-max` | read by figure.part-animation:has(.stg), .stg, stage (code) | `-` | `-` |
| `--stg-need` | read by .stg, stage (code) | `-` | `-` |
| `--stg-note-w` | read by .stg-box.stg-note-strip | `-` | `-` |
| `--stg-off-line` | read by .stg-conn .stg-line | `-` | `-` |
| `--stg-phone-body` | read by .stg-phone .stg-f-body | `-` | `-` |
| `--stg-phone-chip` | read by .stg-phone .stg-f-chip | `-` | `-` |
| `--stg-phone-sub` | read by .stg-phone .stg-f-sub | `-` | `-` |
| `--stg-phone-title` | read by .stg-phone .stg-f-title | `-` | `-` |
| `--stg-radius` | read by .stg | `-` | `-` |
| `--stg-step-on` | read by .stg-stepbtn[aria-current="step"] | `-` | `-` |
| `--stg-step-on-bg` | read by .stg-stepbtn[aria-current="step"] | `-` | `-` |
| `--stg-struck-fade` | read by .stg-t.stg-struck | `-` | `-` |
| `--stg-struck-line` | read by .stg-struck-line, .stg-corner-line, .stg-cross-line | `-` | `-` |
| `--stg-struck-w` | read by .stg-struck-line | `-` | `-` |
| `--stg-thick` | read by .stg-box.stg-thick | `-` | `-` |
| `--stg-title-weight` | read by .stg-f-title, .stg-f-lane | `-` | `-` |
| `--stg-want` | read by figure.part-animation:has(.stg), .page.has-side figure.part-animation:has | `-` | `-` |
| `--stg-z` | read by .stg | `-` | `-` |
| `--surface` | cards, panels, chart surface; read by .dh-chip, .dh-chip.has-note::after, .tl | `#FFFFFF` | `#0F1424` |
| `--surface-2` | inset rows, zebra, inactive tabs; read by .scn .scn-code, .scn-code-bg, .dh-note | `#F2F4F9` | `#151B2E` |
| `--surface-3` | pressed / track; read by .scn-idx-cell, .tone-muted .scn-shape, .scn-band | `#E3E7F0` | `#1D2439` |
| `--svg-max-h` | read by .dh-svg-img | `-` | `-` |
| `--swipe-w` | read by .scn.is-swipe .scn-svg, anim (code) | `-` | `-` |
| `--term` | terminal / code; read by .ch-pre, .cw-error, .ide | `#0F1424` | `#060914` |
| `--term-2` | terminal / code; read by .ide-side, .ide-drawer | `#171D30` | `#0D1120` |
| `--term-faint` | terminal / code; read by .code-lang, .cw-file, .cw-repo | `#95A2BC` | `#95A2BC` |
| `--term-ink` | terminal / code; read by .ch-pre, .cw-path, .ide | `#D3D9E6` | `#D3D9E6` |
| `--term-line` | terminal / code; read by .code-block, .cw, .ide | `#232B44` | `#232B44` |
| `--untested-ink` | status; read by .mk-untested | `#3A4560` | `#C5CDDD` |
| `--untested-soft` | status; read by .mk-untested | `#E3E7F0` | `#1D2439` |
| `--warn` | status; read by .tone-warn, .tone-warn .scn-shape, .hl-warn .scn-ring | `#FF760D` | `#FF8F3A` |
| `--warn-ink` | status; read by .tone-warn, .b-changed, .scn3-l.tone-warn | `#7F3705` | `#FFB984` |
| `--warn-soft` | status; read by .tone-warn, .b-changed, .tone-warn .scn-shape | `#FFE3CE` | `#3A2410` |
| `--wh` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal, css-vars (code) | `-` | `-` |
| `--wh240` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh256` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh272` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh288` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh304` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh320` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh336` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh352` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh368` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh384` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh400` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh416` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh432` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh448` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh464` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh480` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh496` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh512` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh528` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh544` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh560` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh576` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh592` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh608` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh624` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh640` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh656` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh672` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh688` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh704` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh720` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh736` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh752` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh768` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh784` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh800` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh816` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh832` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh848` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh864` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh880` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh896` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh912` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh928` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh944` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh960` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh976` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh992` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh1008` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh1024` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh1040` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh1056` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh1072` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh1088` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh1104` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh1120` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh1136` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh1152` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh1168` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh1184` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |
| `--wh1200` | read by .scn[data-wq]:not(.is-swipe):not(.is-tal | `-` | `-` |

## Shape, type, space and motion (32 tokens)

| Token | What it is for | Light default | Dark default |
| --- | --- | --- | --- |
| `--col` | animation tones: one colour per role, the same on every page; read by .page, .page.has-side | `46rem` | `46rem` |
| `--dur` | motion; read by .st-panel.is-active.is-fresh | `320ms` | `320ms` |
| `--dur-fast` | motion; read by .st-dot::after, .card | `160ms` | `160ms` |
| `--ease` | motion; read by .fx-row.is-new, .scn-chip-t, .st-panel.is-active.is-fresh | `cubic-bezier(.2, .75, .25, 1)` | `cubic-bezier(.2, .75, .25, 1)` |
| `--font-display` | type; read by h1.title, h2, .part-name | `"Poppins", system-ui, -apple-system, "Segoe UI", sans-serif` | `"Poppins", system-ui, -apple-system, "Segoe UI", sans-serif` |
| `--font-mono` | type; read by .scn .scn-code, .scn-say-t.is-code, .ctl-count | `"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace` | `"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace` |
| `--font-sans` | type; read by .dh-chip, .al-more, .al-cell-label | `"Poppins", system-ui, -apple-system, "Segoe UI", sans-serif` | `"Poppins", system-ui, -apple-system, "Segoe UI", sans-serif` |
| `--fs-2xl` | h2 band title; read by h2 | `clamp(1.75rem, 5.4vw, 2.75rem)` | `clamp(1.75rem, 5.4vw, 2.75rem)` |
| `--fs-3xl` | h1 page title; read by h1.title | `clamp(2.25rem, 8vw, 4.25rem)` | `clamp(2.25rem, 8vw, 4.25rem)` |
| `--fs-l` | 20px: lead; read by .lead, .part-name, .card-t | `1.25rem` | `1.25rem` |
| `--fs-m` | 17px: body; read by .tl-label, body, .tab-panel::before | `1.0625rem` | `1.0625rem` |
| `--fs-s` | 15px: captions, chips; read by .tl-title, .tl-label, .part-intro | `.9375rem` | `.9375rem` |
| `--fs-xl` | h3; read by .three-h, :root, h3 | `clamp(1.375rem, 3.6vw, 1.75rem)` | `clamp(1.375rem, 3.6vw, 1.75rem)` |
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
| `--s-2` | space; read by .dh-svg, .dh-ix, .dh-doc .dh-spinner | `8px` | `8px` |
| `--s-3` | space; read by :root, .dh-xref-line, .dh-xref-card | `12px` | `12px` |
| `--s-4` | space; read by .pc-calc, .chart[data-dh-layout="calculator"] .cha, .dh-xref-card | `16px` | `16px` |
| `--s-5` | space; read by .pc-calc, .pc-calc[data-inputs="label"] .pc-fields | `24px` | `24px` |
| `--shadow-md` | shape; read by a.card:hover, .dh-doc[data-dh-variant="bold"] :is(.ter | `0 6px 16px rgba(0, 8, 28, .10), 0 1px 3px rgba(0, 8, 28, .06)` | `0 6px 18px rgba(0, 0, 0, .45), 0 1px 3px rgba(0, 0, 0, .30)` |
| `--shadow-sm` | shape; read by .al-lab .dh-chip, .cw, .ide | `0 1px 2px rgba(0, 8, 28, .06), 0 2px 6px rgba(0, 8, 28, .05)` | `0 1px 2px rgba(0, 0, 0, .40)` |
| `--w-body` | type; read by body, .dh-doc | `300` | `300` |
| `--w-head` | type; read by h1.title | `600` | `600` |
| `--w-strong` | bold = the ONE key point; read by .scn .scn-cap strong, .scn-ttl, .dh-xref-card .dh-xref-label | `600` | `600` |

## Other tokens (7)

| Token | What it is for | Light default | Dark default |
| --- | --- | --- | --- |
| `--chart-ann-marker` | dark: same family, stepped for a navy page; read by .ann-event i | `10px` | `10px` |
| `--col-skew` | animation, format version 4: one stage, a camera, entities drawn with page tokens only; read by .scn | `10.5px` | `10.5px` |
| `--page-w` | animation, format version 4: one stage, a camera, entities drawn with page tokens only; read by .scn, .dh-doc > .table-wrap, anim (code) | `the page's width without a scrollbar (100vw would count the scrollbar)` | `the page's width without a scrollbar (100vw would count the scrollbar)` |
| `--pc-input-h` | dark: same family, stepped for a navy page; read by .pc-num, .pc-select, .pc-check | `40px` | `40px` |
| `--pc-key-h` | dark: same family, stepped for a navy page; read by button.pc-key-b | `32px` | `32px` |
| `--pc-seg-h` | dark: same family, stepped for a navy page; read by .pc-seg-b | `36px` | `36px` |
| `--pc-tile` | dark: same family, stepped for a navy page; read by .pc-tile, .pc-tiles[data-per-row] | `14px` | `14px` |


Tokens read with no default in the package (a host may set them): `--ar240`, `--ar256`, `--ar272`, `--ar288`, `--ar304`, `--ar320`, `--ar336`, `--ar352`, `--ar368`, `--ar384`, `--ar400`, `--ar416`, `--ar432`, `--ar448`, `--ar464`, `--ar480`, `--ar496`, `--ar512`, `--ar528`, `--ar544`, `--ar560`, `--ar576`, `--ar592`, `--ar608`, `--ar624`, `--ar640`, `--ar656`, `--ar672`, `--ar688`, `--ar704`, `--ar720`, `--ar736`, `--ar752`, `--ar768`, `--ar784`, `--ar800`, `--ar816`, `--ar832`, `--ar848`, `--ar864`, `--ar880`, `--ar896`, `--ar912`, `--ar928`, `--ar944`, `--ar960`, `--ar976`, `--ar992`, `--ar1008`, `--ar1024`, `--ar1040`, `--ar1056`, `--ar1072`, `--ar1088`, `--ar1104`, `--ar1120`, `--ar1136`, `--ar1152`, `--ar1168`, `--ar1184`, `--ar1200`, `--bleed-l`, `--class-head-bg`, `--class-member`, `--class-static`, `--code-bg`, `--colmin`, `--dg-edge-w`, `--dg-node-bg`, `--dg-node-border`, `--dh-table-max`, `--er-head-bg`, `--er-key-ink`, `--focus-offset`, `--focus-ring`, `--ix-frame-border`, `--ix-frame-radius`, `--ix-off-chip`, `--ix-off-ink`, `--nx`, `--ny`, `--pc-fig-ml`, `--pc-fig-w`, `--pc-max`, `--pc-per-row`, `--pc-tone`, `--ref-card-pad`, `--ref-card-radius`, `--ref-chip-bg`, `--ref-chip-border`, `--ref-chip-ink`, `--ref-failed-bg`, `--ref-failed-border`, `--ref-failed-ink`, `--ref-pending-bg`, `--ref-pending-border`, `--ref-pending-ink`, `--ref-radius`, `--ref-refused-bg`, `--ref-refused-border`, `--ref-refused-ink`, `--ref-type-ink`, `--scn-paper`, `--state-bg`, `--state-border`, `--state-current`, `--state-dot`, `--state-event`, `--stg-ar`, `--stg-bg`, `--stg-boxmin`, `--stg-btn-bg`, `--stg-btn-edge`, `--stg-corner-w`, `--stg-cross-fade`, `--stg-cross-w`, `--stg-dash`, `--stg-dim`, `--stg-edge`, `--stg-f0-d`, `--stg-f0-l`, `--stg-f1-d`, `--stg-f1-l`, `--stg-f2-d`, `--stg-f2-l`, `--stg-f3-d`, `--stg-f3-l`, `--stg-f4-d`, `--stg-f4-l`, `--stg-f5-d`, `--stg-f5-l`, `--stg-f6-d`, `--stg-f6-l`, `--stg-f7-d`, `--stg-f7-l`, `--stg-f8-d`, `--stg-f8-l`, `--stg-fade`, `--stg-fig-ml`, `--stg-fig-w`, `--stg-flow`, `--stg-font`, `--stg-fs-big`, `--stg-fs-body`, `--stg-fs-chip`, `--stg-fs-lane`, `--stg-fs-mono`, `--stg-fs-small-b`, `--stg-fs-sub`, `--stg-fs-title`, `--stg-gap`, `--stg-halo`, `--stg-hint`, `--stg-hot-w`, `--stg-line-hot-w`, `--stg-line-w`, `--stg-max`, `--stg-need`, `--stg-note-w`, `--stg-off-line`, `--stg-phone-body`, `--stg-phone-chip`, `--stg-phone-sub`, `--stg-phone-title`, `--stg-radius`, `--stg-step-on`, `--stg-step-on-bg`, `--stg-struck-fade`, `--stg-struck-line`, `--stg-struck-w`, `--stg-thick`, `--stg-title-weight`, `--stg-want`, `--stg-z`, `--svg-max-h`, `--swipe-w`, `--wh`, `--wh240`, `--wh256`, `--wh272`, `--wh288`, `--wh304`, `--wh320`, `--wh336`, `--wh352`, `--wh368`, `--wh384`, `--wh400`, `--wh416`, `--wh432`, `--wh448`, `--wh464`, `--wh480`, `--wh496`, `--wh512`, `--wh528`, `--wh544`, `--wh560`, `--wh576`, `--wh592`, `--wh608`, `--wh624`, `--wh640`, `--wh656`, `--wh672`, `--wh688`, `--wh704`, `--wh720`, `--wh736`, `--wh752`, `--wh768`, `--wh784`, `--wh800`, `--wh816`, `--wh832`, `--wh848`, `--wh864`, `--wh880`, `--wh896`, `--wh912`, `--wh928`, `--wh944`, `--wh960`, `--wh976`, `--wh992`, `--wh1008`, `--wh1024`, `--wh1040`, `--wh1056`, `--wh1072`, `--wh1088`, `--wh1104`, `--wh1120`, `--wh1136`, `--wh1152`, `--wh1168`, `--wh1184`, `--wh1200`.

Not theme tokens: `--ar`, `--d`, `--i`, `--lw`, `--pct`, `--rows`, `--t`, `--t-ink`, `--t-soft` are set by the components on their own elements (sizes, positions, a tier's colour).

## Classes and attributes a host may style

| Selector | What it is |
| --- | --- |
| `.dh-doc` | the root of a rendered document; every rule in `styles.css` is under it |
| `.dh-doc[data-dh-variant="..."]` | the style variant (`flat` and `bold` ship; a host adds its own) |
| `.dh-doc[data-dh-motion="off"]` | motion off: every transition, morph, typing effect and chart animation is still |
| `.dh-doc[data-theme="dark"]` | this document in dark |
| `figure.part.part-<type>`, `[data-dh-part="<type>"]` | the frame around each part (`terminal`, `chart`, `animation`, a host block's name ...) |
| `.term`, `.fx`, `.ide`, `.cw`, `.chart`, `.scn`, `.tl`, `.al` | the terminal, file tree, editor, code walk, chart, animation stage, tier list, alignment grid |
| `.tabs`, `.tab-bar`, `.tab-panel`, `.accordion`, `.acc-item`, `.human` | the containers |
| `.ctl`, `.btn`, `.btn-go`, `.ctl-range` | the step controls (Back, Play, the slider, Next) |
| `.callout.callout-<kind>` | callouts (`note`, `tip`, `important`, `warn`, `security`); a note about the whole page is a callout under the title |
| `.dh-turn` | a block with no height at the top of a part: where the hydration queue finds the part on the page |
| `.code-block`, `.ch-pre`, `.ch-focus`, `.ch-mark`, `.ch-add`, `.ch-del` | code, and its focused, marked, added and removed lines |
| `.dh-error` | a part parse() refused (over a cap, unsafe, unreadable) |
| `.dh-spinner`, `.dh-spin` | the loading spinner (the 3D stage) |
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
`Error` and `Spinner`; they also draw Markdown elements your own way (`Code`, `InlineCode`, `Link`, `Table`, `Heading`): see ADOPT.md.

## Motion

- `prefers-reduced-motion: reduce` is honoured everywhere: CSS transitions and animations stop; the animation stage jumps to
  each step's end; streams stand still along their paths; the code walk does not morph; the terminal shows each step whole
  instead of typing; Chart.js does not animate.
- A host style can turn motion off without the reader's setting: `<DhDocument motion="off">` (sets `data-dh-motion="off"`;
  the components check for that attribute anywhere on the page).
