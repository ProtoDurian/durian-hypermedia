// Raw SVG a reference stands for (format version 11): `[[svg:<name> "label"]]`. SVG exists only as a reference: its
// markup never sits in the page. It is drawn only through an <img> (a data: URL), where no script in it runs and
// nothing it names is fetched. This file is pure: it checks the text in one pass and makes the image's address.

/** Why an SVG text is refused, with the fix, or null. One pass: the size, the first tag, and no DOCTYPE or ENTITY. */
export function svgProblem(svg: string, bytes: number, maxBytes: number): string | null {
  if (bytes > maxBytes) return `the SVG is ${bytes.toLocaleString("en-US")} bytes; at most ${maxBytes.toLocaleString("en-US")}. Make it smaller (fewer points, no embedded images)`;
  // the first tag after white space, an <?xml ...?> line and comments must be <svg
  let i = 0;
  for (;;) {
    while (i < svg.length && (svg.charCodeAt(i) <= 0x20 || svg.charCodeAt(i) === 0xfeff)) i++;
    if (svg.startsWith("<?xml", i)) { const e = svg.indexOf("?>", i + 5); if (e < 0) break; i = e + 2; continue; }
    if (svg.startsWith("<!--", i)) { const e = svg.indexOf("-->", i + 4); if (e < 0) break; i = e + 3; continue; }
    break;
  }
  if (!svg.startsWith("<svg", i) || !(i + 4 < svg.length && " \t\n\r>/".includes(svg[i + 4]))) return "the part is not SVG: it must start with <svg";
  // a DOCTYPE or an ENTITY could define entities that grow when the image is read
  for (let k = svg.indexOf("<!", i); k >= 0; k = svg.indexOf("<!", k + 2)) {
    const w = svg.slice(k + 2, k + 9).toUpperCase();
    if (w.startsWith("DOCTYPE") || w.startsWith("ENTITY")) return "the SVG has a DOCTYPE or an ENTITY; take it out (an image needs neither)";
  }
  return null;
}

/** The <img> address of an SVG text: a data: URL (no request is made). */
export function svgDataUrl(svg: string): string {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
