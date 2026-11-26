// Run the shared browser harness with the new engine forced on both server and client.
// Usage: bun test/engine/graph/run-match.ts --out dist/graph-match --only 'format/{47,50,51,52,53,54,55,55a,56,57,58,59,61,66,81,93,94,95,09,07}-*'
// scripts/match.ts does this itself now (`--engine new`, which also waits for each step's own motion time); this stays as the
// short name the graph lane's notes use. Every argument is passed on.
const pkg = new URL("../../../", import.meta.url).pathname.replace(/\/$/, "");
const child = Bun.spawn(["bun", `${pkg}/scripts/match.ts`, "--engine", "new", ...process.argv.slice(2)], { cwd: pkg, stdout: "inherit", stderr: "inherit" });
process.exit(await child.exited);
