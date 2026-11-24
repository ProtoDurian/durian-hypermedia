#### Lottie

````
```lottie src="media/loading.json" title="What happens while it builds" loop
alt: A box fills with blocks, one row at a time, then a tick appears.
colours: dh-c1 = c1, dh-warn = warn
```
````

- **Options:** `src` (`.json`), `title`, `loop`, `speed=0.25..4`, `start=paused|play`, `height=s|m|l`. `alt:` is required (screen readers, the LLM view). `colours:` maps a layer or group name in the file (`dh-c1`) to a theme colour word, so the file follows light and dark and is painted again when the theme changes. `//` starts a comment line.
- It plays while on screen and stops off it. Under reduced motion, or with `start=paused`, it shows one still frame (the finished state) and plays only when the reader presses Play. Controls: Play and Pause, Replay, a frame slider, a speed menu. lottie-web's light build is loaded (as `lottie-web`) when the part is drawn.
- **Checked at load, before the library is fetched:** the file's size, its frames, its layers and its values, no expressions, and nothing loaded from outside the file: no image that is remote or a separate file (an embedded `data:image/png|jpeg|webp|gif` image is allowed), and text only as the file's own glyphs. The file is kept inside its part. The walk of the file charges a budget of its own. A file that fails shows its reason in place of the animation.
- **Addresses:** the file goes through the host's `urlPolicy` as `image` when the part is drawn. Response bytes are capped while reading.
- **Static** (`static` on the fence, a static page, the host or print; SPEC 4.1): the still frame, with no play, slider or speed.
- **LLM view:** `Lottie animation: <title>. <alt>`. **Tokens:** `--lottie-bg`, `--lottie-radius`. **Slots:** `stage`, `play`, `speed`, `alt`.
- **Local file:** `checkLocalFiles` from `durian-hypermedia/node` reads the file and runs the checks the browser runs at load (size, frames, layers, no expression, nothing loaded from outside the file) and checks that every `colours:` name is in the file.
- **Caps** (travel in the data, checked in the browser when the file loads): `lottieBytes` (1 MB; 256 KB in UNTRUSTED_LIMITS), `lottieFrames` (3,600; 1,800), `lottieLayers` (500; 200), `lottieNodes` (200,000; 50,000).
- **doccheck refuses:** no `alt:` line; no `src`; a `src` that is not a `.json` file or not an allowed address; a `colours:` entry that is not `name = colour` or names a colour that is not a theme colour word; `speed=` outside 0.25 to 4; `start=` other than paused or play; a bad `height`; an unknown option; a line the part does not know; a part over the page's work budget.
