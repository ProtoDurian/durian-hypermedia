// The tier list part (```tierlist): rows S, A, B ... with items as chips; a note per item.
import React from "react";
import { TierList } from "../ui/tier";
import { useDh } from "./context";
import type { TierListBlock } from "../types";
export function TierListPart({ block }: { block: TierListBlock }) {
  const { ui } = useDh();
  return <TierList spec={block.tier} ui={ui} />;
}
export default TierListPart;
