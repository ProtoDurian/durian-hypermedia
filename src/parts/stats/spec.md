#### Stats

**Stat tiles are the row of big numbers at the top of a dashboard:** each tile is one figure with its name, how it changed and, if given, a tiny line of its recent values.

````
```stats title="The week"
Requests "1.2 M" change=+12% [good] note="last 7 days" spark=3 5 4 6 8 9
p95 latency "180 ms" change=-8% [good]
Errors "0.4%" change=+0.1 [bad]
```
````

- A line: `<name> "<value>" [change=<signed number>] [<colour>] [note="..."] [spark=<numbers>]`. The colour word in brackets says whether the change is good or bad (a fall in latency is good); it is never guessed from the sign. The arrow follows the sign. A tile may also take `glyph="..."` (decorative text), `trend=up|down|flat` and `sub="..."` (a line under the value). Colour words: `c1` to `c8`, `acc`, `good`, `warn`, `bad`, `muted`. 2 to 4 tiles a row on a wide stage, 2 on a phone.
- **Static:** `static` on the fence draws the tiles whole (they never move; print is the same). A line that does not read refuses the whole block, and the page draws the first problem in place of the tiles.
- **LLM view:** one line a tile, `- Requests: 1.2 M (+12%, last 7 days)`, after `Stat tiles: <title>.` when the fence has a title; the glyph is left out.
- **Caps:** `statsTiles` (12; 8 in UNTRUSTED_LIMITS) tiles a block, `statsSpark` (60; 40) numbers in a sparkline, `statsText` (60) characters in a name, value, glyph or sub-line, `statsNote` (120; 80) characters in a note.
- **doccheck refuses:** a line that is not a tile, an empty name or value, a name or value over the cap, a `change=` that is not a signed number, a colour that is not a colour word (never a hex value), an unknown key, a `trend=` other than up, down or flat, an empty or long glyph, sub-line or note, a `spark=` of fewer than 2 numbers, over the cap or with a word that is not a number, more than the tile cap, a block with no tile, an unknown fence key, a block over the page's work budget.
