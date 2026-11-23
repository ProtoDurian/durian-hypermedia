// For comparison only (ttfull-*.html): the same pages through the full entry.
import React from "react";
import { createRoot } from "react-dom/client";
import { DhDocument } from "../src/react/index";
import type { Document } from "../src/types";
import { taskBlock, hostInlines } from "./host-block";

const raw = document.getElementById("dh-doc")?.textContent;
const el = document.getElementById("dh-root");
if (raw && el) createRoot(el).render(<DhDocument doc={JSON.parse(raw) as Document} blocks={[taskBlock]} inlines={hostInlines} llmPeek />);
