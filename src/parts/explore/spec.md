#### Explore

```json explore query=".items[] | select(.qty > 1)"
{"items":[{"name":"tea","qty":2},{"name":"cup","qty":1}]}
```

A json, yaml or csv fence with the bare word explore draws a foldable tree, counts, search that opens matching ancestors, path copying, a table for lists of objects, starter queries and a jq subset box. Without explore it remains an ordinary fence. The author query= runs during parsing on the page budget. A reader query always receives a new budget, so a failed query does not spend the next one. The LLM reads the original data followed by the author query result. :::llm can replace it.

The query subset provides paths, iteration, select, map, pipes, arithmetic, arrays/objects, variables, conditionals, try, sorting/grouping, strings and a metered non-backtracking regex test. Unsupported syntax or functions are refused by name. Integer-looking object keys follow JavaScript order. CSV accepts quoted fields, doubled quotes and newlines in fields, and recognizes plain decimal numbers. YAML uses the host reader and its page, node and alias caps.

TOML explore is recognized but explicitly refused: TOML explore needs a TOML reader; this build has none.

Caps (authored; strict in parentheses when lower): exploreChars 262144 (131072), exploreDepth 64 (32), exploreCsvRows 5000 (2500), exploreCsvCols 30 (20), exploreQueryChars 2000 (1000), exploreReaderQueryChars 500, exploreQueryDepth 100 (50), exploreQueryResults 10000 (5000), exploreRegexChars 2000, exploreRegexProgram 4000 (2000), exploreRegexRepeat 200, exploreQueryJsonChars 100000, exploreReaderSteps 200000 (100000), exploreReaderValues 400000 (200000), exploreReaderChars 1000000, exploreRowsPerNode 100, exploreSearchNodes 20000 (10000), exploreTableRows 200, exploreTableCols 12, exploreStringCut 120. Hosts can lower all caps.

Doccheck refuses unknown options, invalid JSON or YAML, malformed or unclosed CSV, duplicate headers, a missing CSV header or data row, too many columns/rows, too much data, nesting over the cap, query errors, unsupported syntax, too many query results, and work beyond the page budget.
