import React from "react";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderToString } from "react-dom/server";
import { DhDocument } from "../src/react/index";
import type { Document } from "../src/types";
import type { EngineMode } from "../src/engine/bridge";
import { taskBlock } from "../example/host-block";

export const FIX = resolve(import.meta.dir, "../fixtures");
export function fixtures(dir = ""): { name: string; text: string }[] {
  const d = join(FIX, dir);
  return readdirSync(d, { withFileTypes: true }).filter((e) => e.isFile() && /\.md$/.test(e.name)).map((e) => ({ name: join(dir, e.name), text: readFileSync(join(d, e.name), "utf8") })).sort((a, b) => a.name.localeCompare(b.name));
}
export const allFixtures = () => [...fixtures(""), ...fixtures("format"), ...fixtures("hostile")];
/** `engine`: the animation engine the page draws with (default: the package default; tests of the old engines pass "old") */
export const html = (doc: Document, engine?: EngineMode) => renderToString(<DhDocument doc={doc} blocks={[taskBlock]} llmPeek engine={engine} />);
export { taskBlock };
