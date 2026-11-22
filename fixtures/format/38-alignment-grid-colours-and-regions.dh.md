---
title: "Alignment grid: colours and regions"
description: A fixture made from the Format page section of the same name.
---

## Alignment grid: colours and regions

`[colour]` after a cell's name (and its label) tints that cell. A `region:` line paints a block of cells with a label: write its columns and rows, each one name or `first .. last`. Colours are the theme names `c1` to `c8`, `good`, `warn` and `bad`, never a hex value. `arrows: on` draws an arrow along each axis. A cell's own colour wins over its region's; regions may not overlap.

```alignment title="Where does each task go?"
x: low effort .. medium .. high effort
y: high impact .. medium .. low impact
arrows: on
region: low effort .. medium / high impact .. medium "Quick wins" [good]
region: high effort / low impact "Avoid" [bad]
low effort / high impact "Do first" [c6]: Fix the typo
medium / high impact: Add a sample
low effort / medium: Speed up the build
high effort / high impact: Move to the new CI (needs a plan)
high effort / low impact: Rewrite the docs site
```
