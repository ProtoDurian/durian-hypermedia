// Used by test/cdp.test.ts: start one browser, print its process group, then end the way argv[2] says.
import { launch } from "../scripts/cdp";
const how = process.argv[2] ?? "hang";
const p = await launch();
console.log(`PGID ${p.pgid}`);
if (how !== "hang") await Bun.sleep(1500); // let the test see it alive first
if (how === "throw") throw new Error("runner failed on purpose");
if (how === "exit") process.exit(3);
if (how === "reject") await Promise.reject(new Error("unhandled on purpose"));
await new Promise(() => {}); // "hang": wait to be killed
