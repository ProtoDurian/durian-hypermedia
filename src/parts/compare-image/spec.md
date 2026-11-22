#### Compare image

````
```compare-image title="A dashboard, light and dark" before="Light" after="Dark"
before: media/before-light.svg "A dashboard with four tiles and a bar chart on a light page"
after: media/after-dark.svg "The same dashboard on a dark page"
```
````

- Each image line is `before:` or `after:`, an address and the **alt text in double quotes** (required: it is the LLM view and what a screen reader says; `\"` is a quote inside it). The address goes through a URL policy: a relative path, http or https, to an image file (png, jpg, webp, gif, avif, svg); never `data:`, `blob:`, `javascript:`, a `//` address, a backslash or a `..` that leaves the folder. The host's own `urlPolicy` is applied again when the image is drawn, and an address it refuses is shown as a message in place of the pictures. Lines starting `//` are comments.
- Fence keys: `title`, `before=` and `after=` (the two labels, "Before" and "After" by default), `start=` (0 to 100, the bar's first place), `direction=vertical`, `ratio=16:9`, `fit=contain` (with `ratio=`), `static=`.
- Drag the bar or anywhere on the picture; the arrow keys move it by 1 (Shift: 10), Page Up and Page Down by 10, Home and End to either side; Enter or Space flips from one picture to the other; a tap that does not move flips too; the two labels are buttons that show a whole picture. The bar is a slider (`aria-valuenow`, "Light 40%, Dark 60%"); the grip is 44 px. Slots: `title`, `stage`, `before`, `after`, `label-before`, `label-after`, `bar`, `handle`.
- **LLM view:** the title and the two labels, then each label with its alt text. A body that does not read stays a code block.
- **Caps:** `compareImageAlt` (300; 200 in UNTRUSTED_LIMITS) characters of alt text, `compareImageLabel` (40) of a label, `compareImageUrl` (500; 300) of an address.
- **doccheck refuses:** a line with no alt text, a missing `before` or `after`, one given twice, an address the policy refuses (it says why), an empty alt text or one over its cap, a bad `start=`, `direction=`, `ratio=` or `fit=`, an unknown key, and a part over the page's work budget.
