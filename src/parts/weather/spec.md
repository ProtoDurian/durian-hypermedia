#### Weather

````
```weather place="San Francisco" unit=c tz=America/Los_Angeles
2026-11-22 sun 18/11 rain=0% wind=12km/h
2026-11-24 rain 14/9 rain=80% wind=30km/h precip=6mm pressure=1004hPa
2026-11-25 storm 13/8 rain=95% wind=45km/h note="Ferry may stop"
```
````

- **A line** is a day (`<date> <sky> <high>/<low>`) or an hour (`<date> <time> <sky> <temp>`), then `rain=<n>%` (the chance), `wind=<n><unit>`, `precip=<n><unit>` (the amount), `pressure=<n><unit>` and `note="..."`. Skies: `sun`, `clear-night`, `partly`, `cloud`, `fog`, `drizzle`, `rain`, `storm`, `snow`, `sleet`, `hail`, `wind`. A part shows days or hours, not both. It never fetches; the icons are the part's own drawings. Fence keys: `place=`, `title=`, `tz=`, `unit=`, `wind=`, `rain=`, `pressure=`.
- **Units are the reader's.** `unit=c|f`, `wind=kmh|mph|ms|kn`, `rain=mm|in`, `pressure=hpa|inhg` on the fence only say which unit the numbers are written in, and are the default. The part carries a units menu of real buttons (Tab reaches each; Space or Enter picks): °C or °F, km/h, mph, m/s or knots, mm or inches, hPa or inHg; a group appears only for a value the part has. Every number is converted from the written one, so °F then °C then °F gives the first numbers back exactly. A host gives its own default with `partOptions={{ weather: { units: { temp: "f", wind: "mph", rain: "in", pressure: "inhg" } } }}` on `DocumentView` (any of the four; an unknown word is ignored); the reader's choice is remembered in their browser (`localStorage` under `dh-wx-units`, in try/catch, shared by every weather part on the page and by other tabs) and wins over both. A `static` part, and the server's page, draw the forecast whole in the fence's unit: no menu, no storage.
- **The LLM view:** a table `day | sky | high / low | rain | wind` (hours: `time | sky | temperature | ...`, with `pressure` when any line has it), temperatures in both units (`18 °C (64 °F)`), then the notes.
- **Caps:** `weatherRows` (200; 100 in UNTRUSTED_LIMITS) lines, `weatherLineChars` (400) characters in a line, `weatherNoteChars` (160) in a note.
- **doccheck refuses:** an unknown sky, unit or key (it lists them); a low above the high; rain over 100%; a value with a unit other than the fence's (write one unit per part); days and hours mixed; a bad date, time or zone; an unclosed `note="`; an `@step` line; no forecast line; a part over its caps or over the page's work budget.
