**A before-and-after picture lays two images of the same size on top of each other, with a bar between them.** Drag the bar (or anywhere on the picture), press the arrow keys, or tap the picture to flip from one to the other; the two labels jump to a whole image. Each image line gives the address and the alt text in quotes, which is what a screen reader and an LLM read. The address goes through the host's URL policy (a relative path, http or https; never `data:`). The two sample images are the files `before-light.svg` and `after-dark.svg` in this part's `media/` folder: a host serves that folder as `media/`.

```compare-image title="A dashboard, light and dark" before="Light" after="Dark"
before: media/before-light.svg "A dashboard with four tiles and a bar chart on a light page"
after: media/after-dark.svg "The same dashboard on a dark page"
```
