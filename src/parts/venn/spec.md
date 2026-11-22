#### Venn

````
```venn title="Who writes what"
set go "Go" [c1]
set rust "Rust" [c2]
set zig "Zig" [c3]
go: Ana, Ben
go & rust: Cy
go & rust & zig: Dee (writes all three)
zig: 4 people
```
````

- **2, 3 or 4 sets** (`set <id> "label" [colour]`; an id is letters, digits, `-`, `_` and `.`), drawn as fixed, even shapes (circles, or the classic ellipses for 4); not to scale, on purpose. A region is its sets joined by `&` in any order, then names (a note in brackets, a name with a comma in quotes) or a count (`12`, `4 people`). Colours are the colour words (`c1`..`c8`, `acc`, `good`, `warn`, `bad`, `muted`), never a hex value.
- **Steps:** `set` and region lines under a step appear in it. A region that names a set of a later step is refused. **Static:** `static=` on the fence draws one step whole.
- **Look:** hover, tap, focus or Enter on a region outlines it and reads its items in the card; names that do not fit show as `+3`. On a narrow stage the regions are also listed under the figure.
- **LLM view:** `Venn: <title>. Sets: ...`, then a line per region: `Go and Rust only: Cy`, `all three: ...` (under the step captions when stepped).
- **Caps:** `vennNames` (120; 60 in UNTRUSTED_LIMITS) names in one figure. The figure's own layout costs the same for every page of that many sets and is charged to the budget when it is drawn.
- **doccheck refuses:** fewer than 2 sets or a fifth set, a set written twice, an id with a character outside the set, an unknown colour or a word after the label that is not a colour, a region that names something that is not a set, names a set twice or is written twice, a region of a set from a later step, a region with nothing after its colon, a count with the word first, a name in two regions, an empty or badly bracketed name, a line that is none of these, more names than the cap, an unknown attribute, and a part over the page's work budget.
