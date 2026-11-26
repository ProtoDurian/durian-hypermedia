# Sunburst words on a phone (eng-polish)

Port of the v0.7.0 chart-kinds fix (b4235df) into the one engine's sunburst (`kinds/sunburst.ts`, `arcWord`).

- An arc's name goes: level where the whole name sits inside its own slice, else along the ring (turned to read upright), else along the arc, else cut with `…` the roomier way of the two (at least two letters), else left out. The popover and the table keep every name.
- Whatever is drawn lies wholly on its own arc: the corners and edges of the word's box (turned as the word is) are checked against the ring radii and the arc's angles, so the centre, the next ring and the next arc are never under a word.
- Before, a word that fitted nowhere whole was left out; now it is cut with `…` where two letters and the ellipsis fit.
- Test: `test/engine/polish/sunburst-words.test.ts` (320 to 1280 px, two trees).
- For SPEC.md (integrator): the "Words on a sunburst" paragraph of chart-kinds already says this.
