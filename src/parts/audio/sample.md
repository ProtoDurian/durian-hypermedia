An audio part is a player of our own. The wave is drawn from a small peaks file and moves with the sound; chapters split it, a marker flags one moment, and the transcript follows the voice.

```audio src="media/talk.mp3" title="A page that talks" duration=0:57 wave=bars skip=10 transcript=open
peaks: media/talk.peaks.json
chapter 0:00 Welcome
chapter 0:24 The transcript
chapter 0:38 The marker
marker 0:38 Where the example crashed [bad]
0:00 Ana: Welcome back. Today we look at a page that can talk.
0:04 Ben: A page that talks. Do you mean the audio part?
0:08 Ana: Yes. You write one fence, with a file, a title, and a few lines of transcript.
0:14 Ben: And the reader sees a wave that moves while the voice plays.
0:18 Ana: The wave is drawn from a small peaks file, so it appears before the sound starts.
0:24 Ben: What about people who cannot listen right now?
0:27 Ana: The transcript follows the voice. Tap a line, and the player jumps there.
0:33 Ben: Chapters split the wave into parts, and a marker flags one moment.
0:38 Ana: Here is the marker. This is where the example crashed.
0:42 Ben: And a language model reads the same page as plain text.
0:46 Ana: It gets the title, the chapters, and the transcript, never a picture of a wave.
0:52 Ben: That is the whole part. Press play, and listen again.
```

`wave=mirror` reflects the wave, `wave=dots` draws it in dots, `wave=live` shows a window of the sound that scrolls past "now", and `compact` makes one row. The colour is a word (`tone=c4`), never a hex value.

```audio src="media/talk.mp3" title="Mirror wave, in family colour 4" wave=mirror tone=c4 height=s duration=0:57
peaks: media/talk.peaks.json
```

```audio src="media/talk.mp3" title="Compact" compact wave=line duration=0:57
peaks: media/talk.peaks.json
```
