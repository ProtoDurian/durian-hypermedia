#### Flame chart and flame graph

```flame title="One request, traced" unit=ms
0 120 request
  2 14 auth.check
  15 95 handler.order
    16 70 db.query
```

```flame title="CPU, 30 seconds" unit=samples colour=heat
main;serve;handle;parse 120
main;serve;handle;db.query 300
main;serve;gc 45
```

Indented `start end name` lines are a **flame chart** (time left to right, nesting downward, like a trace); folded stacks `a;b;c count` (Brendan Gregg's format) are a **flame graph** (merged stacks, width is the share of samples). `dir=up|down` (a chart defaults to down, a graph to up), `colour=group|heat` (group: the text before the first dot picks a family colour; heat: self time on the `--flame-heat-*` ramp), `unit=`. Click or tap a frame to zoom it to the full width (a crumb row zooms out); a search lights matching frames and says their share; hover, tap or focus shows name, self, total and share; arrow keys walk the frames, Enter zooms, Esc zooms out. An LLM reads a chart as its lines with each frame's length (`db.query 16–70 (54 ms)`), a graph as a table of the top stacks and top self-time functions (all rows when under 400 tokens). doccheck refuses mixing the two forms, a child outside its parent's time, an end before its start, a count of 0 or less, an empty frame name, and more than 2,000 frames (it says to aggregate).

Caps in LIMITS and UNTRUSTED_LIMITS: `flameFrames` 2000, `flameLines` 6000, `flameDepth` 80, `flameName` 120. Hosts can lower these. Folded frame names are cut to the name cap. Also refused: unknown options, invalid dir or colour, tabs, an indented first frame, excessive depth or chart name length, no frames, @step lines, non-finite times or counts, and a spent work budget. Static draws the complete chart without search or zoom controls.
