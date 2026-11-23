#### Maths (`$...$`, `$$...$$` and `math`)

```
The area of a circle is $A = \pi r^2$.

$$
\sum_{k=1}^{n} k = \frac{n(n+1)}{2}
$$
```

- **Where:** `$...$` in a sentence, `$$...$$` on its own lines or around one run of text, or a ```` ```math ```` block holding the TeX. The TeX is LaTeX, read by KaTeX. The marks are read from the Markdown source itself, so `\\`, `_` and `*` inside a formula are the author's TeX, not Markdown. Never inside inline code or a code block.
- **The `$` rule** (GitHub's and Pandoc's): an opening `$` is followed by a non-space, a closing `$` follows a non-space and is not followed by a digit, so "it costs $5 and $10" stays text. `\$` is a dollar sign. An inline formula never spans a line; a block never spans a blank line. doccheck warns on a `$` pair that looks like money.
- **Drawn at parse time by KaTeX** into a tree of elements (never an HTML string); the page runs no maths script. The reader accepts only the tags, attributes and styles KaTeX writes. KaTeX is run with `trust` off, `maxExpand` 200 and `maxSize` 20, and every formula charges the page budget by its size and its output. The same formula twice is drawn once.
- **No fonts, no stylesheet:** KaTeX writes MathML only and the browser draws it with its own maths font, so nothing needs a host's set-up (KaTeX's font files are under the SIL Open Font Licence and are not bundled). Letters are plain Latin and Greek with a class for italic and bold, so a machine with no maths font still draws them. `\tag` numbers a block; `\label` is dropped (KaTeX has none).
- **LLM view:** the TeX as written, between its `$` signs.
- **Caps:** `mathChars` (4,000; 1,500 in UNTRUSTED_LIMITS) characters in one formula, `mathFormulas` (600; 150) formulas on a page, `mathNodes` (60,000; 20,000) elements in one formula's tree.
- **doccheck refuses** TeX KaTeX cannot read (its message, with the line and column of the formula), `\href`, `\url`, `\htmlClass`, `\htmlData`, `\htmlId`, `\htmlStyle` and `\includegraphics`, a formula over the character cap, more formulas than the page cap, and a page that spends more than its budget. A formula that cannot be drawn shows its TeX in a code box. **Warns:** a `$` pair that looks like money.
