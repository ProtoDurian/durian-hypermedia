#### Sparkline in a sentence (`:spark[...]`)

```
Sign-ups were :spark[120,135,128,160,182,171,205] this week, and errors fell to :spark[14,12,15,9,7,4,3 bar good].
```

- `:spark[3,5,2,8,9]` draws a tiny line the height of the text; `:spark[3,5,2,8,9 bar good]` makes bars and sets the colour. The numbers are joined by commas; then, optionally, `line` or `bar`, and one colour word (`c1` to `c8`, `acc`, `good`, `warn`, `bad`, `muted`). Hover, focus or tap it for the numbers; it is plain inline SVG with the numbers in its label.
- It is a part of a sentence: it is read in a paragraph, a list item, a quote, a callout or a table cell, and never inside inline code, a link, an image, a heading or an HTML tag (there it stays as written).
- **LLM view:** `(3, 5, 2, 8, 9)`.
- **Caps:** `sparkValues` (200; 100 in UNTRUSTED_LIMITS) numbers in one sparkline.
- **doccheck refuses:** fewer than 2 numbers, a word that is not a number, a style or a colour, more numbers than the cap. A wrong sparkline stays as written text.
