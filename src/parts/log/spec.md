#### Log

```log labels="app=shop" title="Checkout"
2026-11-20T10:00:00Z info request status=200
2026-11-20T10:00:01Z error timeout status=504
@highlight |= "timeout" [bad] "the request timed out"
```

Reads JSON, logfmt and time/level/message lines. Consecutive repeated lines fold (fold=off disables it). Level chips, as-written or relative times, matched-word marks, author highlights and a reader LogQL box are included. A **key** under the lines names what the colours and marks mean, and only what occurs in that log: each level that has a line (a coloured level word and what it means), each author highlight (its colour and its reason), the mark on words the search matched (not in a static log, which has no search) and the ×N chip when the log has folded repeats. @highlight accepts a LogQL filter or line 3-5, optional colour word and a quoted reason. llm=highlights keeps matching lines and two nearby lines; otherwise the LLM reads highlights first and the log as written, folding repeats.

The LogQL subset supports selectors, literal and non-backtracking regex line filters, json/logfmt parser stages and field comparisons (including durations and bytes), joined by and, or or comma. Metric queries and unsupported stages are refused by name. Every reader query receives a new budget.

Caps: logLines 5000 (2500 strict), logQueryChars 2000 (1000), logReaderQueryChars 500, logQueryDepth 100 (50), logQueryResults 10000 (5000), logRegexChars 2000, logRegexProgram 4000 (2000), logRegexRepeat 200, logQueryJsonChars 100000, logReaderSteps 200000 (100000), logReaderValues 400000 (200000), logReaderChars 1000000. Hosts may lower each. All author work shares the page budget.

Doccheck refuses an empty log, unknown option, too many lines, bad filter or unsupported query stage, invalid highlight, missing or empty reason, unknown colour, reversed or zero line range, highlight past the end, highlight matching no line, and work over the budget.

Rows expose data-span and optional data-trace, accept keyboard focus and show a Show span action when the trace marks them data-trace-linked=1. The action dispatches dh-trace-focus on document with span and trace.
