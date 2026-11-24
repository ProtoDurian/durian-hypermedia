#### Gallery

````
```gallery title="The new editor" view=carousel
![The file tree, closed](media/tree-closed.png "Closed: only the top folders")
![On a phone](media/phone.png)
```
````

- One image a line: a Markdown image with alt text (required) and an optional quoted caption. Options: `view=single|grid|carousel` (a grid for two or more, `single` for one), `ratio=16:9|4:3|1:1|auto` (crops in the grid and the carousel, never in the lightbox), `columns=2..5` (two on a phone), `loop` (the carousel wraps), `start=<n>`. `//` starts a comment line.
- A tap or click opens the lightbox: wheel and pinch zoom (up to 8 times), one finger or the mouse pans, a double tap or double click zooms in and out, arrows or a swipe go to the next, Esc or Close closes, Tab stays inside, focus returns to the image. The caption stays under the picture. A carousel swipes, has Back and Next, dots (28 px targets) and arrow keys.
- **Addresses:** every image address goes through the host's `urlPolicy` (as an image) when the gallery is drawn; a refused one is left out and a note says so. The parser never allows `data:`, `blob:`, `javascript:`, `file:`, any other scheme or a protocol-relative address.
- **Static** (`static` on the fence, a static page, the host or print; SPEC 4.1): every image at once as a grid, with no arrows, dots, swipe or lightbox.
- **LLM view:** `Gallery: <title> (3 images).` then `1. <alt> (<address>): <caption>` a line each. **Tokens:** `--gallery-radius`, `--gallery-gap`, `--gallery-caption`, `--gallery-lightbox-bg`. **Slots:** `grid`, `image`, `caption`, `carousel`, `dots`, `lightbox`.
- **Caps:** `galleryImages` (60; 30 in UNTRUSTED_LIMITS) images in one gallery.
- **doccheck refuses:** a line that is not one image, an image with no alt text, an address that is not allowed or a file that is not an image (png, jpg, jpeg, gif, webp, avif, svg), a carousel of one image, a bad `view`, `ratio`, `columns` or `start`, an unknown option, no images, more images than the cap, a gallery over the page's work budget.
