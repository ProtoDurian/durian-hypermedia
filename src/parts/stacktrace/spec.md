#### Stacktrace

A printed Go, .NET, Bun/Node, Dart, Java or Python trace.

```stacktrace lang=js app=/src/shop
Error: request failed
    at handler (/src/shop/api.ts:42:11)
    at run (node:internal/process:10:5)
```

Language detection can be overridden with lang=. Library frames fold; app= marks a comma-separated set of module, package, function or path prefixes. Vendored code stays a library. Causes, suppressed errors, goroutine groups, Python source lines, async gaps and omitted-frame counts are preserved. Tap or focus a frame to read its raw detail. repo= and strip= identify code references. The matching front matter pins entry supplies the commit: the frame detail shows its first seven characters, and the reference tooltip keeps the complete commit. Without a matching pin the reference still names the file and line.

The LLM reads the trace as written. Above 400 tokens library runs become one line; llm=full retains all frames. A following :::llm replaces this view.

Caps: stacktraceLines is 2000 (1000 in UNTRUSTED_LIMITS); hosts may lower it. Every scan charges the page budget.

Doccheck refuses unknown options, an unknown language, strip= without repo=, secret-looking text, an undetectable language, no recognizable frame, a .NET frame before its exception, too many lines, and too much work. app= matching no frame warns.
