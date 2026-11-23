---
title: Diff, good
---
# A diff

What `git diff` prints, as a diff view.

```diff title="Bind every interface"
diff --git a/src/server.ts b/src/server.ts
index 4b825dc..9f3c1a7 100644
--- a/src/server.ts
+++ b/src/server.ts
@@ -12,6 +12,6 @@ export function start(config: Config) {
   const port = config.port ?? 8080;
-  const host = "localhost";
+  const host = config.host ?? "0.0.0.0";
   const server = createServer(handler);
   register(server);
@@ -48,4 +48,4 @@ export function stop(server: Server) {
   unwatch();
-  server.close();
+  server.close(() => log.info("closed"));
 }
```

```diff view=split static
--- a/a.txt
+++ b/a.txt
@@ -1,3 +1,3 @@
 one
-two
+three
 four
```
