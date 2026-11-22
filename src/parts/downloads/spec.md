#### Downloads

````
```downloads title="Files for this guide"
media/q3-report.pdf "Q3 report" 2.4 MB sha256=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
media/requests.csv "Raw data" note="one row per request"
```
````

- A line: `<address> "label" [size] [sha256=|sha512=<hex>] [note=...]`. Each card has a type icon from the extension (document, sheet, archive, image, audio, video, code, text, other), the label, the file name, the size, a Download link (a plain `<a download>`; nothing is fetched, nothing is counted) and the checksum as a short chip that copies the whole value, with how to check it (`shasum -a 256 <file>`). `//` starts a comment line.
- **Addresses:** every address goes through the host's `urlPolicy` when the card is drawn; a refused one shows a plain note instead of the link. The parser itself never allows `data:`, `blob:`, `javascript:`, `file:`, any other scheme, a protocol-relative `//` address, or a space or control character.
- **LLM view:** `Downloads: <title>.` then `- <label>: <address> (PDF, 2.4 MB, sha256 9f86d0...0a08)` a line each, with the whole checksum on the next line.
- **Caps:** `downloadsFiles` (100; 40 in UNTRUSTED_LIMITS) files in one list, and `downloadsCheckBytes` (64 MB; 16 MB) the most the Node entry reads of one file to check its checksum.
- **Local files:** `checkLocalFiles` from `durian-hypermedia/node` (never the core) reads each file named under the host's root: the stated size must be what the file has at the precision written, and the checksum must match; a missing file, an absolute path or a `..` is refused.
- **doccheck refuses:** an address that is not allowed; a size with no unit (B, KB, MB, GB; decimal); a checksum of the wrong length or not hex; `md5=` or `sha1=` (weak: use `sha256=`); a second label; an unknown `key=`; a word that is not a size, a label or a key; a file listed twice; no files; more files than the cap; an unknown option; a part over the page's work budget.
