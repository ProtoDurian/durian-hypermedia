
A fence named `stacktrace`. It reads a trace as printed by Go, .NET, Bun or Node, Dart, Java or Python: the error line, each cause in its own block, threads as groups. Library frames fold into one bar; frames of your own code (`app=`) are marked, and with `repo=` and `strip=` they name the file and line at the page’s pinned commit (when its front matter has a matching pins entry). Tap a frame to open it.

```stacktrace lang=go app=example.com/shop repo=example.com/shop strip=/src/shop/ title="A Go panic"
panic: runtime error: index out of range [3] with length 3

goroutine 18 [running]:
example.com/shop/cart.(*Cart).Item(...)
	/src/shop/cart/cart.go:42
example.com/shop/api.(*Server).getItem(0xc0001a2000, {0x7f1c, 0xc000124000}, 0xc000188000)
	/src/shop/api/items.go:88 +0x1d4
net/http.HandlerFunc.ServeHTTP(0xc000010040, {0x7f1c, 0xc000124000}, 0xc000188000)
	/usr/local/go/src/net/http/server.go:2136 +0x29
net/http.serverHandler.ServeHTTP({0xc00011e000}, {0x7f1c, 0xc000124000}, 0xc000188000)
	/usr/local/go/src/net/http/server.go:2938 +0x8e
```

## Stack traces in the other five languages

`lang=` may be left out when the trace says it. Each trace below is read by its own parser.

```stacktrace app=Acme.Shop title=".NET, with an inner exception"
System.InvalidOperationException: Cart failed
 ---> System.ArgumentException: Index out of range (Parameter 'i')
   at Acme.Shop.Cart.Item(Int32 i) in /src/shop/Cart.cs:line 42
   at System.Linq.Enumerable.First[TSource](IEnumerable`1 source)
   --- End of inner exception stack trace ---
   at Acme.Shop.Api.GetItem(Int32 id) in /src/shop/Api.cs:line 88
   at Microsoft.AspNetCore.Mvc.Invoke()
```

```stacktrace app=/src/shop title="Bun or Node, with a cause"
Error: request failed
    at fetchItem (file:///src/shop/api.ts:42:11)
    at async handler (/src/shop/server.ts:10:3)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
    at run (/src/shop/node_modules/lib/index.js:5:9)
Caused by: TypeError: bad json
    at parse (/src/shop/util.ts:7:2)
```

```stacktrace app=shop title="Dart, with an async gap"
Unhandled exception:
Bad state: no element
#0      Cart.item (package:shop/cart.dart:42:7)
#1      Api.get (package:shop/api.dart:10:3)
<asynchronous suspension>
#2      _rootRunUnary (dart:async/zone.dart:1407:47)
#3      State.setState (package:flutter/src/widgets/framework.dart:1100:9)
```

```stacktrace app=com.acme.shop title="Java, with Caused by"
java.lang.IllegalStateException: cart failed
	at com.acme.shop.Cart.item(Cart.java:42)
	at com.acme.shop.Api.get(Api.java:88)
	at java.base/java.util.ArrayList.get(ArrayList.java:427)
	... 12 more
Caused by: java.io.IOException: boom
	at com.acme.shop.Db.read(Db.java:7)
	... 5 common frames omitted
```

```stacktrace app=/src/app title="Python, chained"
Traceback (most recent call last):
  File "/src/app/db.py", line 5, in read
    raise OSError("boom")
OSError: boom

The above exception was the direct cause of the following exception:

Traceback (most recent call last):
  File "/src/app/main.py", line 10, in <module>
    run()
  File "/usr/lib/python3.11/site-packages/x.py", line 5, in run
    raise ValueError("bad")
ValueError: bad
```

