// bun scripts/migrate.ts <file> [--write]: rewrite a page's animation blocks to format 12 and print the diff (the
// `dh migrate` command, src/engine/parse/migrate-cli.ts). It never writes without --write.
import { readFileSync, writeFileSync } from "node:fs";
import { migrateCommand } from "../src/engine/parse/migrate-cli";
process.exit(migrateCommand(process.argv.slice(2), { read: (p) => readFileSync(p, "utf8"), write: (p, t) => writeFileSync(p, t), out: (s) => console.log(s), err: (s) => console.error(s) }));
