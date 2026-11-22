#### Compare

````
```compare title="Which queue?" winner=on pick=Kafka
options: Redis Streams [c1], Kafka [c2], SQS [c3]
Ordering: yes, yes, partial (FIFO queues only)
Runs itself: no, no, yes
Throughput: 3, 5, 3 (score 1-5)
Latency (lower is better): 4 ms, 12 ms, 25 ms
Cost at our size: good, bad, good
```
````

- The first line is `options:` and the names (an optional colour word in square brackets after a name). Every other line is `<criterion>: <value>, <value>, ...`, one value for each option, in order. A value is `yes`, `no`, `partial`, `good`, `warn`, `bad`, a number with an optional unit (a score), `-` or `n/a` (no data), or a word. A note in round brackets after a value shows on hover, focus or tap, in the one popover card. `score 1-5` in a note sets the row's scale (the bar); `(lower is better)` in the criterion or a note turns a score round.
- **One row holds one kind of value** (yes/no/partial, good/warn/bad, numbers, or words). Lines starting `//` are comments.
- Fence keys: `title`, `winner=on` (marks the best value of each yes/no, scored and good/bad row, and says how many rows each option wins; a row of equal values has no best), `pick=<option>` (a flag on the option you recommend), `view=single` (on a phone, one option at a time), `static=`.
- On a wide stage the options are columns. Under 560 px the matrix scrolls inside its own box with the criterion fixed at the left and a shaded edge, and a switcher offers one option at a time. Colour is never the only signal: a yes is a tick and the word, a good is the word in a chip. Slots: `title`, `switch`, `tabs`, `scroll`, `table`, `pick`, `wins`, `best`, `popover`.
- **LLM view:** a Markdown table, options as columns, notes kept; with `winner=on` the best values are bold. A body that does not read stays a code block.
- **Caps:** `compareOptions` (8), `compareRows` (40; 25 in UNTRUSTED_LIMITS), `compareValue` (120) and `compareName` (80) characters, `compareNote` (300; 200) characters.
- **doccheck refuses:** a row with the wrong number of values (it counts them), mixed kinds in one row (it names both), a first line that is not `options:`, fewer than 2 options, a repeated option, a colour word that is not one, an empty value, a scale that does not go up or a value outside it, an unknown key, `winner=` not `on` or `off`, `view=` not `table` or `single`, a `pick=` that is not an option, more options, rows, characters than the caps, and a part over the page's work budget.
