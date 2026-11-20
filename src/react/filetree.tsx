// The file tree part (```filetree): folders that open and close, marks as words, steps between trees.
import React from "react";
import { FileTree } from "../ui/parts";
import { useDh } from "./context";
import type { FileTreeBlock } from "../types";
export function FileTreePart({ block }: { block: FileTreeBlock }) {
  const { ui } = useDh();
  return <FileTree trees={block.trees as any} ui={ui} />;
}
export default FileTreePart;
