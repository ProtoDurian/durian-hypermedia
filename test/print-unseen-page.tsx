// The page test/print-unseen.test.ts opens in a real browser: the server's HTML of a page whose parts never get their
// turn to hydrate (the queue is held), so each still shows the server's first state. printUnseen() must draw them for print.
import React from "react";
import { hydrateRoot } from "react-dom/client";
import { DhDocument } from "../src/react/index";
import { HydrationOrder, TurnContext, printUnseen } from "../src/react/hydrate";

const el = document.getElementById("root")!;
const doc = JSON.parse(document.getElementById("doc")!.textContent!);
const order = new HydrationOrder();
(order as any).pump = () => {}; // hold the queue: no part ever gets its turn, as on a page printed before the reader scrolls
hydrateRoot(el, <TurnContext.Provider value={order}><DhDocument doc={doc} /></TurnContext.Provider>, { onRecoverableError: () => {} });
order.watch(el);
printUnseen(order);
(window as any).__order = order;
