#### Sankey

````
```sankey title="Where a request's time goes" unit=ms
request -> auth: 12
request -> handler: 80
handler -> db: 55
node db "Postgres" [c3]
```
````

- One flow a line, `from -> to: amount`; `node <id> "label" [colour]` only to name or colour one; `unit=` on the fence. An id is letters, digits, `_`, `.` and `-`. Colours are the colour words (`c1`..`c8`, `acc`, `good`, `warn`, `bad`, `muted`), never a hex value.
- **Steps:** flows under a step appear in it and the bands grow out of their source. **Static:** `static=` on the fence draws one step whole.
- **Reading it:** hover, tap or focus a band to light its path (the popover says `handler → Postgres: 55 ms · 69% of handler`) or a node for its in and out. A table of the flows sits under it. Under 520 px of width a sankey with more than 3 columns runs top to bottom. The layout is d3-sankey's; the SVG is ours, with the words as real text.
- **LLM view:** `Sankey: <title> (<unit>).` and a table `from | to | amount` in the order written (under `Step n: <caption>` headings when stepped).
- **Caps:** `sankeyFlows` (300; 150 in UNTRUSTED_LIMITS), `sankeyNodes` (120; 60) and `sankeySteps` (30). The layout's cost (about nodes times flows) is charged to the page's work budget when the part is read.
- **doccheck refuses:** a loop (it names it), an amount of 0 or less, a flow from a node to itself, an unknown colour, a line it does not understand, an unknown attribute, no flows, more flows, nodes or steps than the caps, and a part over the page's work budget. It warns when a node sends out more than comes in, and on a label over 60 characters.
