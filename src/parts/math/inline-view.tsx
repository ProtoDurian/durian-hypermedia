// A formula in the text (format version 11): the same element tree as the block, inline (or display, for `$$ ... $$`). A display
// formula inside a paragraph is a block-level span (a div may not sit in a p).
import React from "react";
import type { InlineViewProps } from "../inline";
import type { MathData } from "./scan";
import { MathFormula } from "./view";

export default function MathInline({ data }: InlineViewProps<MathData>) {
  return <MathFormula data={data} tag="span" />;
}
