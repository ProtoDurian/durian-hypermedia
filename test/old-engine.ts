// Tests that guard the OLD animation engines (src/core/scene.ts, stage*.ts, src/ui/anim*.tsx) while they exist.
// The page draws with the one engine by default (src/engine/bridge.ts ENGINE_DEFAULT = "new"); a test of the old code
// imports `test` from here instead of "bun:test": its body runs with the page's engine mode set to "old", so parseDoc,
// jsonOf, llmView and checkDoc read the old compilers. A page that is drawn also needs `engine: "old"` on the
// DhDocument / parse call (the renderer reads its own mode from React context).
import { test as bunTest, it as bunIt } from "bun:test";
import { withEngine } from "../src/engine/page";

type Fn = () => void | Promise<unknown>;
const wrap = (fn: Fn): Fn => () => withEngine("old", fn as () => void | Promise<unknown>);
function make(base: typeof bunTest) {
  const t = ((name: string, fn: Fn, opt?: number | object) => base(name, wrap(fn), opt as number)) as typeof bunTest;
  // `only` is read when a test asks for it: Bun refuses to hand it out on CI, and reading it here broke every file on CI
  return Object.defineProperty(Object.assign(t, { skip: base.skip, todo: base.todo }), "only", { get: () => base.only });
}
export const test = make(bunTest);
export const it = make(bunIt);
