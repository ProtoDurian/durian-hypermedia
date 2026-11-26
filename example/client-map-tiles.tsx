// Local-only tiles exercise the host provider under the same CSP as the fixture pages.
import React, {useState} from "react";
import { createRoot } from "react-dom/client";
import { parse } from "../src/index";
import { DhDocument } from "../src/react/strict";
import { tileProvider } from "../src/react/map-tiles";

const el = document.getElementById("dh-root");
const scenario = new URLSearchParams(location.search).get("tiles") ?? "normal";
const adapter = tileProvider({ tiles: `media/test-tile.png?case=${encodeURIComponent(scenario)}&z={z}&x={x}&y={y}`, attribution: "Example tiles (local test)", timeoutMs: scenario === "hang" ? 300 : undefined });
let opens = 0;
const map = {...adapter, openBasemap: async (...args: Parameters<NonNullable<typeof adapter.openBasemap>>) => {
  document.documentElement.dataset.tileOpens = String(++opens);
  return adapter.openBasemap!(...args);
}};
const doc = parse('```map\nplace center "Centre" 0, 0\nview 0, 0 zoom=3\n```');
function Demo() {
  const [revision, setRevision] = useState(0);
  return <><button id="tile-policy" onClick={() => setRevision(n => n + 1)}>Change image policy</button><DhDocument doc={doc} map={map} static={scenario === "static" ? "" : undefined}
    urlPolicy={(url, kind) => kind === "image" && url.startsWith("media/test-tile.png?") ? `${url}&policy=${revision}` : null} /></>;
}
if (el) createRoot(el).render(<Demo />);
