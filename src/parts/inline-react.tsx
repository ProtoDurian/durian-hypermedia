// The frame side of an inline part (format version 11): turns an inline part's view into the component the document draws
// for a ref node of that name. An inline part draws inside a sentence, so it has no stage box: it gets the text, the data,
// the renderer's words and the `static` setting, and nothing that lays out. The generated react.tsx lists them.
import React from "react";
import { useDh } from "../react/context";
import type { InlineViewProps } from "./inline";

/** The component DocumentView draws for a ref node of an inline part: `{ text, data }` in, the part's own view out. */
export function inlineComponent<D>(name: string, View: React.ComponentType<InlineViewProps<D>>): React.ComponentType<{ text: string; data: D }> {
  function FolderInline({ text, data }: { text: string; data: D }) {
    const { ui, static: docStatic } = useDh();
    // one inline element around the view (the frame sets data-dh-inline: a host styles or finds an inline part by it)
    return <span className="dh-inline" data-dh-inline={name}><View text={text} data={data} ui={ui} static={docStatic} /></span>;
  }
  FolderInline.displayName = `${name}Inline`;
  return FolderInline;
}
