**Stat tiles are the row of big numbers at the top of a dashboard:** each tile is one figure with its name, how it changed and, if given, a tiny line of its recent values, so a reader takes in the state of something at a glance before reading on. The colour word in brackets says whether the change is good or bad (a fall in latency is good); it is never guessed from the sign.

```stats title="The week"
Requests "1.2 M" change=+12% [good] note="last 7 days" spark=3 5 4 6 8 9
p95 latency "180 ms" change=-8% [good] spark=9 8 8 7 7 6 5
Errors "0.4%" change=+0.1 [bad] note="of requests" spark=2 2 3 2 4 5
Cost "USD 412" change=+3% spark=4 4 5 5 5 6
```

A tile can also carry a glyph, a trend word and a sub-line. This block is `static`: it draws the tiles whole, the same in print.

```stats title="Garden at a glance" static
Yield "251 kg" glyph="✦" trend=up sub="Across three plots" change=+8% [good] note="this season" spark=180 192 205 224 251
Water "120 L" glyph="◉" trend=down sub="Stored rainwater" change=-6% [good] note="this week" spark=150 145 138 126 120
Beds "30" glyph="▦" trend=flat sub="Ready for planting" [c3]
```
