A `diff` block holds what `git diff` prints. It is drawn as a diff view: a file header with how much changed, line numbers on both sides, the changed words marked inside a changed line, and long unchanged runs folded. It is split on a wide part and unified on a narrow one; the buttons switch it, and `view=split` or `view=unified` fixes it. On a phone the lines do not wrap: the numbers and the sign stay in view while the code scrolls inside its box.

```diff
diff --git a/src/server.ts b/src/server.ts
index 4b825dc..9f3c1a7 100644
--- a/src/server.ts
+++ b/src/server.ts
@@ -12,9 +12,10 @@ export function start(config: Config) {
   const port = config.port ?? 8080;
-  const host = "localhost";
+  const host = config.host ?? "0.0.0.0";
   const server = createServer(handler);
-  server.listen(port, host);
+  server.listen(port, host, () => log.info("listening", { port, host }));
   register(server);
   watch(config);
   return server;
@@ -48,6 +49,6 @@ export function stop(server: Server) {
   unwatch();
-  server.close();
+  server.close(() => log.info("closed"));
 }
@@ -80,18 +81,19 @@ export function reload(server: Server) {
   const next = readConfig();
-  if (next.port !== current.port) restart(server);
+  if (next.port !== current.port || next.host !== current.host) restart(server);
   current = next;
   emit("reload", next);
   mark("reload");
   audit(next);
   notify(next);
   flush();
   settle();
   prune();
   index();
   compact();
   verify();
+  log.debug("reloaded", { port: next.port });
   return server;
 }
```

With `static` the diff is drawn whole, with no button: every file open, and a folded run only says how many lines it holds.

```diff static
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,4 +1,4 @@
 export function greet(name: string) {
-  return "Hello, " + name;
+  return `Hello, ${name}!`;
 }
```
