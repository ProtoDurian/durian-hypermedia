#### Glossary

````
```glossary title="Words we use"
term "UL" also "ubiquitous language": the words a team agrees on and uses in code and in talk
term bc "bounded context" also "context map": one part of the system with its own **words**
```

Each team keeps its own UL inside a bounded context.
````

- A glossary block draws the list of its terms, each with an anchor (`<idPrefix>term-<id>`: the page's id prefix, `dh-` by default, so two documents on one page share no id). A line is `term [id] "<term>" [also "<other name>", ...]: <meaning>`; an indented line goes on with the meaning; a blank line or `//` line is skipped. The meaning is small Markdown: `code`, **bold**, *italic* and an https link. The id is made from the term unless given. `title=` names the list; `#id` is the block's id.
- The same terms can go in front matter: `glossary:` and then `UL: the words a team agrees on`. A term defined in front matter or in a block is a term of the whole page.
- **In the text:** a term is found as a whole word (the first letter's case is free, the rest as written; the longest name wins), and its first use in each section (up to the next heading of level 1 or 2) is a button with a dotted underline. Hover (after a short wait), tap, or focus it and press Enter: a card shows the meaning, "All terms" (when the page has a glossary block) and Copy; Esc or a tap outside closes it. A term is never marked inside inline code, a code block, a link, an image, a heading, a table's rule row or an HTML tag.
- **A host's word list:** `parse(text, { glossary: [{ term, aliases?, def }] })` hands in a site-wide list. Its terms are marked like the page's own; a term the page defines (front matter or a block), by name or other name, wins and the host's is left out. The list is checked with the same caps (a problem names the entry), is not warned about when unused, and is listed once in the LLM view after the front matter (`Glossary (from the site):`).
- **LLM view:** the glossary once, as a list (`- **UL** (also: ...): meaning`), where the block is; front matter terms are kept in the front matter at the top. The marks in the text are plain text.
- **Caps:** `glossaryTerms` (200 on a page; 100 in UNTRUSTED_LIMITS), `glossaryLabel` (60 characters), `glossaryDef` (600 characters; 400 in UNTRUSTED_LIMITS) and `glossaryAliases` (5 other names).
- **doccheck refuses:** a line that is not a term line, an empty meaning, a name or meaning over its cap, a bad id, too many other names, more terms than the cap, a term (or its id) defined twice (it names both lines), an unknown key, front matter `glossary:` that is not a map of text. It warns on a term the text never uses.
