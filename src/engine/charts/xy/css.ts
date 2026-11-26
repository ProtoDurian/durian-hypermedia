// The styles the xy kinds ask for by class (page tokens only). The renderer paints roles and tones; these classes add what a
// role cannot say: the heatmap's colour ramp, grid and axis strokes, tick type, the faint fills of areas, ranges and bubbles.
// `xy.css` is this string written out (a test keeps the two equal).
const LEVELS = 20;
export function xyCss(): string {
  const out: string[] = [
    `.xy-grid{stroke:var(--grid);stroke-width:1;fill:none}`,
    `.xy-grid-x{stroke-dasharray:2 4}`,
    `.xy-axis{stroke:var(--axis,var(--grid));stroke-width:1;fill:none}`,
    `.xy-tick,.xy-cat,.xy-title,.xy-keytext{fill:var(--muted)}`,
    `.xy-value,.xy-num{fill:var(--ink)}`,
    `.xy-dotted{stroke-dasharray:.1 6;stroke-linecap:round}`,
    `.xy-off{opacity:.4}`,
    `.xy-dim{opacity:.35}`,
    `.xy-bubble{fill-opacity:.55;stroke-width:1.5}`,
    `.xy-ann-fill{fill-opacity:.45}`,
    `.xy-key-area{fill-opacity:.5}`, // charts2: an area key swatch is as faint as the area (paint.tsx draws an area at 0.5)
    `.xy-gap{opacity:0}`,
    `.xy-heat.xy-empty{fill:none;stroke:var(--grid);stroke-dasharray:2 3}`,
    `.xy-num.xy-on-hi{fill:var(--heat-lo)}`,
    `.xy-num.xy-on-lo{fill:var(--ink)}`,
    // a stage bar chart (stagebars.ts): a bar is the paint's line colour (the renderer puts it in --es), a reference line, the peak, the limit and a move are lines in the stage's inks
    `.xy-sb-bar{fill:var(--es)}`,
    `.xy-sb-bar.xy-sb-good{fill:var(--good);stroke:var(--good)}`,
    `.xy-sb-bar.xy-sb-bad{fill:var(--bad);stroke:var(--bad)}`,
    `.xy-sb-bar.xy-sb-warn{fill:var(--warn);stroke:var(--warn)}`,
    `.xy-sb-bar.xy-sb-acc{fill:var(--acc);stroke:var(--acc)}`,
    `.xy-sb-block{stroke-width:1}`,
    // the counted columns' lit frame (radial/dots.ts) and the counted units' squares (radial/units.ts)
    `.ch-col.ch-lit{stroke:var(--acc)}`,
    `.xy-thick{stroke-width:2.4}`,
    `.eng-p.ch-warm{fill:var(--warn);stroke:var(--warn)}`, // eng-stagebars: a lit column's new dots are the plain warn orange (the stage's own), not the scene look's darker edge
    `.xy-sb-ref{stroke:var(--lk-hairline-2,var(--line-2));stroke-width:2}`,
    `.xy-sb-peak{stroke:var(--bad);stroke-width:2.5}`,
    `.xy-sb-limit{stroke:var(--acc);stroke-width:2}`,
    `.xy-sb-move{stroke:var(--acc);stroke-width:2.5;color:var(--acc)!important}`,
    `.xy-sb-clear{stroke:var(--surface);stroke-width:6;stroke-dasharray:none}`,
  ];
  for (let k = 0; k < LEVELS; k++) {
    const p = Math.round((k / (LEVELS - 1)) * 100);
    out.push(`.xy-h${k}{fill:color-mix(in oklab,var(--heat-lo) ${100 - p}%,var(--heat-hi) ${p}%)}`);
    out.push(`.xy-hp${k}{fill:color-mix(in oklab,var(--heat-mid) ${100 - p}%,var(--heat-hi) ${p}%)}`);
    out.push(`.xy-hn${k}{fill:color-mix(in oklab,var(--heat-mid) ${100 - p}%,var(--heat-neg) ${p}%)}`);
  }
  return out.join("\n") + "\n";
}
export const XY_CSS = xyCss();
