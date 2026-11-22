Trace and log linking

The trace side is complete. The log part supplies this DOM contract inside the same `.dh-doc`:

- A container with `data-dh-part="log"`.
- Focusable rows with `data-span` naming a span's `id=` or name, and optional `data-trace`. When both sides name a trace, the ids must match.
- The trace adds `data-trace-linked="1"` only to matching rows. A log row's Show span button is visible only while this marker exists.
- Show span dispatches `new CustomEvent("dh-trace-focus", { detail: { trace, span } })` on `document`. The trace switches to Waterfall, opens the ancestors, focuses the row and opens its card.
- The span card offers Show in the log only when matching rows exist. It scrolls and focuses the first row, and marks every match with `data-linked="1"` for 2600 ms. The log part supplies the highlight style and reveals a filtered row when needed.

The trace refreshes links when a lazy log part mounts or a row's identifiers change. Several traces can share a row without removing one another's marker. Unmounting removes this trace's markers.

Browser verification used a log row created with this contract, including a late mount and both directions of focus. The separately built log component still needs to implement the contract and be checked together with trace after integration.
