#### Video

````
```video src="media/create.mp4" poster="media/create.jpg" title="Creating a project" duration=1:58
source: media/create.webm
captions: media/create.en.vtt "English" default
captions: media/create.es.vtt "Español"
thumbs: media/create.thumbs.vtt
chapter 0:00 Start
chapter 0:42 Answer the questions
```
````

- **Options:** `src` (mp4, m4v, webm, ogv, mov, or an `.m3u8` stream, which plays where the browser can), `poster`, `title`, `clip`, `loop`, `start`, `height=s|m|l`, `duration`, `speed`, `speeds`, `skip`, `volume`, `download`, `transcript`. Flags are bare words. **`autoplay` is refused.** **Body:** `source: <file>` (another format), `captions: <file.vtt> "Label" [default]`, `thumbs: <file.vtt>` (cues name an image, `sprite.jpg#xywh=x,y,w,h`), `transcript: <file.vtt|.srt>`, `chapter m:ss Title`, and transcript lines `m:ss Speaker: text`. `//` starts a comment.
- **Controls:** a big play button on the poster; a bar with the chapters as segments (hover or touch shows the chapter's title, the time and, with `thumbs:`, a still); time; volume; a speed menu; a captions menu; picture in picture; full screen. Captions are drawn by us from the VTT (`--video-cue-bg`, `--video-cue-ink`). Keys: Space or `k`, `j` and `l` 10 s, arrows 5 s, Up and Down volume, `f`, `c`, `i`, `m`, `,` and `.` a frame when paused, `0` to `9`. On a phone a double tap on the left or right third jumps 10 s; a mouse double click is full screen.
- **`clip`:** a short silent loop that plays muted while in view and stops off screen or under reduced motion (a screen recording that would be a GIF). It takes no sound options, captions, chapters, transcript or `autoplay`.
- **Addresses:** the file, its other sources, the poster, the captions, the thumbs and their images all go through the host's `urlPolicy` as `image` when the player is drawn. Nothing plays before Play (except a `clip`, muted, in view). With a host media loader (`loadMedia`, section 8b) the loader is asked first for every address, as the load rule there says.
- **LLM view:** `Video: <title> (<duration>), <address>. Chapters: ... Captions: English, Español.` and the transcript if written (the transcript is the content, so a long one needs no `:::llm`). **Tokens:** `--video-bg`, `--video-played`, `--video-played-2`, `--video-chapter-gap`, `--video-radius`, `--video-cue-bg`, `--video-cue-ink`. **Slots:** `poster`, `big-play`, `captions`, `captions-menu`, `bar`, `chapter`, `time`, `speed`, `volume`, `pip`, `fullscreen`, `thumb`.
- **Caps:** `videoTranscriptLines` (2,000; 1,000 in UNTRUSTED_LIMITS), `videoChapters` (200; 100), `videoCaptionFiles` (12; 6) checked when the page is parsed; `videoVttCues` (5,000; 2,000), `videoVttBytes`, `videoThumbsBytes` and `videoTranscriptBytes` (each 1,000,000; 256,000) travel in the data and are checked in the browser when a captions, thumbs or transcript file loads. Response bytes are capped while reading.
- **doccheck refuses:** no `src`; a `src` that is not a video file; an address that is not allowed; a YouTube or Vimeo address (embeds that phone home are not in this version); `autoplay`; an unknown option; two `default` captions; a captions file that is not `.vtt` or has no label; a `thumbs:` that is not `.vtt`; a clip with sound options, captions, chapters or a transcript; a poster that is not an image; a chapter or transcript line out of order or past `duration=`; a line the part does not know; a video over its caps or over the page's work budget.
