import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "../src/index";
import { DhDocument, useDh } from "../src/react/strict";
import type { InteractiveProps } from "../src/react/reference";
import * as interactive from "../src/react/interactive";

const source = "@html\n<p>Growth</p>\n@css\np { font-weight: 600 }\n@script\ndocument.body.dataset.ran = 'yes';\n@fallback\nA still picture.";

test("components.interactive receives the resolved block; mode is host context", () => {
  const doc = parse('[[interactive:growth "Growth"]]', { resolveReference: () => ({ state: "ready", part: source }) });
  expect(doc.problems).toEqual([]);
  let seen: InteractiveProps | undefined;
  function Host(props: InteractiveProps) {
    seen = props;
    const { interactive: mode } = useDh();
    return <p>Host {mode}: {props.block.alt}</p>;
  }
  const html = renderToStaticMarkup(<DhDocument doc={doc} interactive="static" components={{ interactive: Host }} />);
  expect(html).toContain("Host static: Growth");
  expect(Object.keys(seen!).sort()).toEqual(["block"]);
  expect(seen!.block).toMatchObject({ type: "interactive", html: "<p>Growth</p>", css: "p { font-weight: 600 }", script: "document.body.dataset.ran = 'yes';", alt: "Growth", height: 280 });
  expect(seen!.block.fallback.length).toBeGreaterThan(0);
});

test("the host can serve a reference frame with its own explicit CSP", () => {
  const frame = (interactive as any).interactiveFrame?.();
  expect(frame).toBeDefined();
  expect(frame.csp).toContain("connect-src 'none'");
  expect(frame.csp).toContain("script-src 'unsafe-inline'");
  expect(frame.csp).toContain("sandbox allow-scripts");
  expect(frame.csp).toContain("frame-ancestors 'self'");
  const meta = frame.html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  expect(meta).not.toContain("sandbox");
  expect(meta).not.toContain("frame-ancestors");
  expect(frame.html).toContain("dhReady");
  expect(frame.html).not.toContain("dh-interactive");
});
