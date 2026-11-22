
A fence named `log`. It reads JSON lines, logfmt and the common "time level message key=value" shape. The filter box speaks **LogQL** (Grafana Loki's query language): `{level="error"}`, `|= "timeout"`, `!= "health"`, `|~ "5\\d\\d"`, `| status >= 500`; a box that starts with neither `{` nor `|` is plain words. Only the query half of LogQL is read, never metric queries. `filter=` is the starting filter. The author (often an agent) points at what matters with `@highlight` lines: a LogQL filter or `line 3-5`, a colour word and the reason in quotes.

```log title="The failed deploy" labels="app=shop, env=prod" filter="{level=~\"warn|error\"}"
2026-11-20T10:08:01Z info  deploy started version=1.4
2026-11-20T10:08:12Z info  migration applied name=0042
2026-11-20T10:09:03Z warn  cache miss rate high rate=0.41
2026-11-20T10:09:05Z error request failed path=/cart status=500 err="timeout after 30s" span=checkout trace=request
2026-11-20T10:09:06Z error request failed path=/cart status=500 err="timeout after 30s" span=checkout trace=request
@highlight |= "timeout" [bad] "every failure is the same timeout"
@highlight line 3 [warn] "the first sign"
```

