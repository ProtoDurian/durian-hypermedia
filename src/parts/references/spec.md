#### Citations (`[@key]` and `references`)

````
Marks make a study easier to read [@smith2020, p. 12], and two together [@smith2020; @lee2019].

```references style=apa
- id: smith2020
  author: Smith, Jane; Lee, Kim
  title: A study of marks
  in: Journal of Studies
  year: 2020
  volume: 12
  pages: 10-20
- id: lee2019
  author: Lee, Kim
  title: Notes on lists
  type: web
  publisher: Example Press
  year: 2019
  url: https://example.com/notes
```
````

- **In the text:** `[@key]`, `[@key, p. 12]` (a locator after a comma) and `[@a; @b]` (several). In apa and chicago a mark reads `(Smith & Lee, 2020)`; in ieee it reads `[1]`, numbered in order of first cite. Never inside inline code, a code block, a link or a heading.
- **The list** is a ```` ```references ```` block (small YAML, one entry per `- id:`); `style=apa|ieee|chicago` (apa by default). Entry types: `article`, `book`, `chapter`, `web`, `report`, `talk`, `software`. Fields: `id`, `type`, `author` and `editor` (names joined by `;`, "Family, Given" or "Given Family"), `title`, `in`, `year` (four digits, or `2020a`), `volume`, `issue`, `pages`, `doi` (bare), `url` (http or https), `accessed` (`2026-11-20`), `publisher`, `place`, `edition`, `version`, `number`, `note`. Every value is read as text, so `10-20` and `2020` stay as written. The list is drawn where the block is, sorted for apa and chicago and in order of first cite for ieee, each entry with "cited N times" and a link back to each mark.
- **A mark** is a button: hover (after a short wait), focus or tap opens one card with the entry, "Open source" (its DOI or url) and Copy; Esc closes it. On a phone the card is a sheet at the bottom.
- **The formatter is the package's own** (the three styles, seven types, nothing else); a citation-style engine is not bundled.
- **LLM view:** the marks as written, and the list as `References:` then `- [id] formatted entry`.
- **Caps:** `referencesEntries` (400; 100 in UNTRUSTED_LIMITS) entries, `referencesAuthors` (30; 12) authors in one entry, `referencesText` (600; 300) characters in a title, publisher or note, `referencesCites` (2,000; 500) cites on a page.
- **doccheck refuses:** a cite of a key not in the list (it names the nearest key), a cite with no `references` block, a reference with no `title` or no `author` (a `web` one may give a `publisher`), a duplicate id, an unknown type, key or style, a year that is not four digits, a DOI that is a link, a URL that is not http or https (no `data:`, `blob:`, `javascript:`), two `references` blocks. **Warns:** a reference never cited; a missing `year` (it shows "n.d."). A refused mark stays as written.
