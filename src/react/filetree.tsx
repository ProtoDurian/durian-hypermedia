// The file tree part (```filetree): folders that open and close, marks as words, steps between trees.
import React from "react";
import { FileTree } from "../ui/parts";
import { staticOfAttr } from "../parts/react";
import { useDh } from "./context";
import type { FileTreeBlock } from "../types";
export function FileTreePart({ block }: { block: FileTreeBlock }) {
  // static (SPEC 4.1): the fence's own static= wins, then the page's (front matter static: true) or the host's
  const { ui, static: docStatic } = useDh(), fence = staticOfAttr(block.attrs?.static), stp = fence !== undefined ? fence : docStatic;
  return <FileTree trees={block.trees as any} ui={ui} marks={block.marks} static={stp} />;
}
export default FileTreePart;
