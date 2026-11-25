#### Trace waterfall

```trace title="POST /checkout" unit=ms trace=t-7f3a
web        POST /checkout        0 842  user=u7
  gateway  route /checkout       3 838
    auth   verify.token          6  44  method=jwt
    cart   cart.load            47 205  items=3
      db   SELECT prices       126 198  rows=3
    payment charge.card        208 812  error="payment provider timed out"
      payment provider.call    258 804  id=provider error="upstream timeout after 540 ms"
@log payment 804 error "upstream timeout after 540 ms, giving up"
@service db [c5] "Postgres"
```

The spans of one request across services, as a waterfall: one row per span, the service as a coloured chip (one family colour per service, in order of first use), a bar on one shared time scale, its length, and the spans the end waited for outlined.

- **A span line** is `<service> <name> <start> <end> [key=value ...] [colour]`. The service is an id (letters, digits, `-`, `_`, `.`); the name may hold spaces; times are numbers in `unit=` (default `ms`). Nest by indenting (two spaces or more; the parent holds the child), or write a flat list with `id=<id>` on every span that is a parent and `parent=<id>` on its children. Values with spaces go in double quotes. `error="..."` marks a failed span. `[c1]` to `[c8]`, `[acc]`, `[good]`, `[warn]`, `[bad]`, `[muted]` at the end colours that span's bar.
- **`@log <service> <time> <level> "text"`** puts a log line on the deepest span of that service that holds the time (`span=<id or name>` picks one). Levels: debug, info, warn, error. **`@service <id> [colour] "label"`** sets a service's colour and label.
- **Options:** `unit=` (a short word), `trace=` (the id a log line's `trace=` field names; `#id` is the default), `open=<levels>` (how many levels are open at the start), `critical=off` (no outline).
- **The critical path** (what the end waited for): from the end of the trace, the child that ended last, then the child that ended last before that one began, and so on, inside every span chosen. Spans that ran in parallel and ended earlier are not on it.
- **Explore:** each row folds with its arrow (Fold all, Unfold all); search finds a name, a service, an error text or a value, opens the path to each match and says their share of the trace; a mini map of the whole trace on top zooms a stretch (drag; the arrow keys move it, plus and minus zoom; Show all resets); the service chips isolate one service; a Flame button draws the same spans with the flame part. Hover, tap or focus a span for its card: attributes, logs, error, self time, and "Show in the log".
- **Links to a `log` part** on the same page: a log line with a `span=` field (and `trace=`, when both name one) matches the span with that `id=` (or, with no `id=`, that name). The span's card then offers "Show in the log", and the log line gets a "Show span" button.
- **Length words:** a span's length (`109 ms`) is written inside its bar at the left; when an event diamond of that row would cover it, it moves to the right inside the bar, then after the bar, then before it; it is always inside the plot (a word after the last bar is no longer cut off at the edge).
- **LLM view:** the indented lines with each span's times and length, its attributes, `ERROR: ...`, the logs under their spans, then `Critical path (what the end waited for): a > b > c`, **Slowest spans** (by the time each ran itself) and **Errors**. A trace over 400 tokens in this view needs a `:::llm` block.
- **Tokens** `--trace-bar-h`, `--trace-critical`, `--trace-error`, `--trace-grid`, `--trace-stripe`, `--trace-minimap-h`, `--trace-brush`, `--trace-log-debug`, `--trace-log-info`, `--trace-log-warn`, `--trace-log-error`. **Slots** `span`, `span-bar`, `service`, `minimap`, `span-detail`, `view`, `search`.
- **Phone:** the waterfall is its own sideways scroll box (the rest of the page does not move); rows are 40 px apart; every button is 40 px.
- **Drawn by** our own SVG; reading and layout charge the document's work budget, and a reader's search has a budget of its own.


Caps in LIMITS and UNTRUSTED_LIMITS: `traceSpans` 2000, `traceLines` 6000, `traceDepth` 80, `traceName` 120, `traceAttrs` 24, `traceValue` 240, `traceLogs` 500, `traceServices` 40 `traceText` 400, `traceServiceLabel` 60 (labels are cut), and `traceOpen` 99. Hosts may lower them. Non-finite times or lengths are refused; scale the times down. Static shows the complete waterfall without controls or motion. A matching log row in the same document adds Show in the log to the span card.

**doccheck refuses:** a malformed span, log or service line; unknown option or directive; invalid service/id/trace id, unit, open or critical; tabs or an indented first span; end before start; child outside parent; duplicate ids, missing parents or a parent cycle; unknown colour or log level; a log with no service, span or time interval that matches; an unused @service; empty trace; any cap above or the work budget. It warns on multiple roots or a zero-length trace.
