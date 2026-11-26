#### Audio

````
```audio src="media/episode-12.mp3" title="Episode 12: the crash" wave=bars duration=12:34 skip=10
peaks: media/episode-12.peaks.json
chapter 0:00 Welcome
chapter 3:20 The bug
marker 5:02 The crash [bad]
0:00 Ana: Welcome back.
0:04 Ben: Today we look at a crash.
```
````

- **Options:** `src` (mp3, m4a, aac, wav, ogg, oga, opus, weba, flac), `title`, `wave=bars|line|mirror|dots|live`, `height=s|m|l`, `compact`, `tone=<colour word>`, `speed=on|off`, `speeds=0.75,1,1.25,1.5,2`, `skip=10|15|30` (back and forward buttons), `start=1:20`, `loop`, `volume=on|off`, `download=on`, `transcript=open|closed|off`, `duration=12:34`. Flags are bare words (`loop`, `compact`). **`autoplay` is refused: a reader presses Play.** Times are `m:ss` or `h:mm:ss`.
- **Body lines:** `peaks: <file.json>` (the BBC audiowaveform format; `bun src/parts/audio/peaks.ts <file>` writes one with ffmpeg), `transcript: <file.vtt|.srt>`, `chapter m:ss Title`, `marker m:ss Title [colour]`, and transcript lines `m:ss Speaker: text` (or `m:ss text`). `//` starts a comment.
- **The wave** is drawn across the player from the peaks (without a peaks file the browser decodes the file when it is on the page's own origin and under `audioDecodeBytes`, else a flat line until it plays). While it plays, the played part fills, the playhead glides, and the bars around it rise and fall with the sound (the Web Audio analyser when the file is same-origin, else a pulse on the peaks; none under reduced motion). `wave=live` shows a window of eight seconds, centred on now. Chapters split the wave with gaps, markers are flags on it.
- **The transcript** lights the line being spoken and keeps it in view inside its own box (the page never scrolls by itself); a tap on a line seeks there; a search box filters and marks words. **Keys** (the player has focus): Space or `k` play and pause, `j` and `l` 10 s, Left and Right 5 s, `,` and `.` speed, `0` to `9` a tenth of the way, `m` mute, Home and End. The wave is a slider (`role=slider`, `aria-valuetext` "1:23 of 12:34").
- **Addresses:** the file, the peaks file and the transcript file go through the host's `urlPolicy` as `image` when the player is drawn; a refused file shows a note. Nothing is fetched before the page is drawn, and nothing plays before Play. With a host media loader (`loadMedia`, section 8b) the loader is asked first for every address, as the load rule there says.
- **LLM view:** `Audio: <title> (<duration>), <address>. Chapters: ... Markers: ...` and then the transcript as written.
- **Tokens:** `--audio-bg`, `--audio-ink`, `--audio-wave`, `--audio-played`, `--audio-played-2`, `--audio-playhead`, `--audio-buffer`, `--audio-chapter-gap`, `--audio-marker`, `--audio-radius`, `--audio-bar-w`, `--audio-bar-gap`. **Slots:** `play`, `wave`, `chapter`, `marker`, `time`, `speed`, `volume`, `transcript`, `cue`, `cue-active`.
- **Caps:** `audioTranscriptLines` (2,000; 1,000 in UNTRUSTED_LIMITS), `audioChapters` (200; 100), `audioMarkers` (200; 100) checked when the page is parsed; `audioVttCues` (5,000; 2,000), `audioWaveformSamples` (20,000; 10,000), `audioPeaksBytes` (1 MB; 500 KB), `audioDecodeBytes` (20 MB; 10 MB) and `audioTranscriptBytes` (1,000,000; 256,000) travel in the data and are checked in the browser when the file loads. Response bytes are capped while reading.
- **doccheck refuses:** no `src`; a `src` that is not an audio file; an address that is not allowed (`data:`, `blob:`, `javascript:`, `file:`, `//`); `autoplay`; an unknown option; a wave style, tone word, `skip=`, `speeds=`, `duration=`, `start=` or `transcript=` that is wrong; a chapter out of order or past `duration=`; a transcript line out of order or past it; a `transcript:` file that is not `.vtt` or `.srt`; a `peaks:` file that is not `.json`; a marker colour that is not a colour word; a line the part does not know; a player over its caps or over the page's work budget.
