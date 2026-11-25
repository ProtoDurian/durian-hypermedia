Trace port verification

- Part tests and folder contract: 85 passed, 0 failed.
- Browser check: 1280 and 390, light and dark, plus browser-only rendering under strict Trusted Types. Three samples draw, 0 page overflow, 0 script or policy errors, smallest text 12 px. All four screenshots opened and inspected.
- Additional browser input checks: 17 passed. Mouse folding and unfolding; search opening a folded match; keyboard focus, Escape and Enter on the card; a late-mounted log row, Show in the log, and the reverse focus event; mini map drag; Flame drawing all 13 spans and zooming; phone tap opening a sheet, Close, and scrolling inside the chart. No script or policy errors. The three state screenshots were opened and inspected: provider card with its log action, zoomed Flame view, and phone error card with readable text and Close.
- Type check: the same 11 pre-existing errors outside the parts; no added errors. Hygiene and public-text: 0 hits.
- Hostile fixture parse and check, worst of ten: LIMITS 15.02 ms; UNTRUSTED_LIMITS 6.74 ms. Observations on a shared machine, not timing assertions.
- Both presets have the same caps: traceSpans 2000, traceLines 6000, traceDepth 80, traceName 120, traceAttrs 24, traceValue 240, traceLogs 500, traceServices 40, traceText 400, traceServiceLabel 60, traceOpen 99. The document budget may refuse an input before a size cap.
- Source tokenization is a hand scan. Stable numeric radix passes preserve ordering. Log interval assignments avoid the product of spans and matching logs; an interval minimum tree finds the first free Flame lane. Doubling checks include overlapping logs and parallel lanes, parse and layout together, at three sizes. Searches propagate ancestor coverage once.
- Flame pure code and view are imported from the flame folder; flame imports nothing from trace. No extra library or shared interface change.
- The log side still needs the contract in integration.md, including revealing filtered rows. The interaction check used a stand-in log row, not the separately ported log component.
- Inherited presentation choices: English fallback words, labels scroll with the waterfall on a phone, and the span card shows the first 12 attributes.
