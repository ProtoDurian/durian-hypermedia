#### Timeline

````
```timeline title="A release plan"
2026-05-04 Design review [c1]
  Scope and owners agreed
2026-11-23 Version 2 ships [good] note="the big one"
```
````

- One line per event: a year (`2026`), a month (`2026-11`) or a day (`2026-11-23`), a title, an optional `[colour]` (the colour words `c1`..`c8`, `acc`, `good`, `warn`, `bad`, `muted`, never a hex value) and `note="..."`. An indented line is a detail. List events oldest first (doccheck warns otherwise). `dir=across` lays it out sideways on a wide stage; a narrow stage is always top to bottom. Steps build it up: an event under a later step is there but invisible, so the size never changes. **Static:** `static=` on the fence draws one step whole.
- **LLM view:** `Timeline: <title>.` and a dated list: `- 2026-11-23: Version 2 ships (the big one) — a detail; another`, under the step captions when stepped.
- **Caps:** `timelineEvents` (80; 50 in UNTRUSTED_LIMITS).
- **doccheck refuses:** a line that does not start with a date, a month that is not 01 to 12, a day that is not 01 to 31, an event with no title, an unknown colour, a detail with no event above it, no event at all, more events than the cap, an unknown attribute or a `dir` that is not `down` or `across`, and a part over the page's work budget. It warns on an event listed before an earlier one of the same kind of date.
