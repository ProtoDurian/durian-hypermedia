// The page test/print-panels.test.ts opens in a real browser: the server's HTML, hydrated as a host would.
import React from "react";
import { hydrateRoot } from "react-dom/client";
import { DhDocument } from "../src/react/index";

const el = document.getElementById("root")!;
const doc = JSON.parse(document.getElementById("doc")!.textContent!);
hydrateRoot(el, <DhDocument doc={doc} />);
(window as any).__ready = true;
