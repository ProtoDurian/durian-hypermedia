// The host media loader in the views (0.8.0), drawn on the server: with a loader a media part waits for the answer, so it draws its loading state and
// never the author's address; with none, the same page draws what 0.7.0 drew. (The answers themselves are in media-loader.test.ts.)
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";
import { parse } from "../src/index";
import { DhDocument } from "../src/react";
import type { LoadMedia } from "../src/media-loader";

const PAGE = [
  "# Media", "",
  "![A chart](media:chart.png)", "",
  "![Elsewhere](https://img.example/a.png)", "",
  "![Forged](blob:https://app.example/forged)", "",
  '```video src="media:clip.mp4" poster="media:clip.jpg" title="A clip"', "```", "",
  '```audio src="media:talk.mp3" title="A talk"', "peaks: media:talk.peaks.json", "```", "",
  "```gallery", '![One](media:one.png "First")', '![Two](@dir/two.png "Second")', "```", "",
  "```compare-image", 'before: media:before.png "Before"', 'after: @after.png "After"', "```", "",
  '```pdf src="media:report.pdf" title="Report"', "```", "",
  '```lottie src="media:spin.json"', "alt: A spinner turns.", "```", "",
].join("\n");
const OPTS = { path: "p.dh.md", mediaPrefixes: ["media:", "@"] } as const;
const draw = (loader?: LoadMedia, props: Record<string, unknown> = {}, text = PAGE, parseOpts: Record<string, unknown> = OPTS) =>
  renderToStaticMarkup(<DhDocument doc={parse(text, parseOpts)} {...(loader ? { loadMedia: loader, mediaPrefixes: ["media:", "@"] } : {})} {...props} />);

describe("media parts with a loader, on the server", () => {
  test("the loader is not called while drawing on the server, and no claimed address reaches the page", () => {
    const asked: string[] = [];
    const html = draw(async (q) => { asked.push(q.url); return { refused: "x" }; });
    expect(asked).toEqual([]);
    expect(html).not.toMatch(/media:|@dir|@after|src="blob:|poster=|href="media/);
    expect(html).toContain("Loading");
  });
  test("an image in prose draws its alt text until the loader answers; an author-written blob: is never an <img>", () => {
    const html = draw(async () => ({ objectUrl: "blob:https://app.example/own" }));
    expect(html).toContain('<span class="dh-img-off">A chart</span>');
    expect(html).toContain('<span class="dh-img-off">Forged</span>');
    expect(html).not.toContain("forged");
  });
  test("an author-written blob: is refused with no loader too, and a claimed address is not drawn without one", () => {
    const html = draw(undefined, {}, "![Forged](blob:https://app.example/forged)\n\n![Mine](media:a.png)\n", { path: "p.dh.md" });
    expect(html).not.toContain("<img");
    expect(html).toContain("Forged");
  });
});

describe("no loader: what 0.7.0 drew", () => {
  const SAFE = [
    "# Media", "", "![Elsewhere](https://img.example/a.png)", "", "![Here](media/a.png)", "",
    '```video src="media/clip.mp4" poster="media/clip.jpg" title="A clip"', "```", "",
    '```audio src="media/talk.mp3" title="A talk"', "```", "",
    "```gallery", '![One](media/one.png "First")', '![Two](media/two.png "Second")', "```", "",
    "```compare-image", 'before: media/before.png "Before"', 'after: media/after.png "After"', "```", "",
  ].join("\n");
  test("plain addresses are in the page on the first render, as before", () => {
    const html = draw(undefined, {}, SAFE, { path: "p.dh.md" });
    expect(html).toContain('src="https://img.example/a.png"');
    expect(html).toContain('src="media/a.png"');
    expect(html).toContain('src="media/clip.mp4"');
    expect(html).toContain('poster="media/clip.jpg"');
    expect(html).toContain('src="media/talk.mp3"');
    expect(html).toContain('src="media/one.png"');
    expect(html).toContain('src="media/before.png"');
    expect(html).not.toContain("Loading");
  });
  test("a loader given but a page that names only plain addresses still waits for it (the loader is asked first)", () => {
    const html = draw(async () => ({ useDefault: true }), {}, SAFE, { path: "p.dh.md" });
    expect(html).not.toContain('src="media/clip.mp4"');
    expect(html).toContain("Loading");
  });
});
