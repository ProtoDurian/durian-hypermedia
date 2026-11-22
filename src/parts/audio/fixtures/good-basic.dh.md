---
title: Audio, good
---
# Audio

A player with a wave, chapters, a marker and a transcript.

```audio src="media/episode.mp3" title="Episode 12: the crash" wave=mirror duration=12:34 skip=15 tone=c3 speeds=0.75,1,2
peaks: media/episode.peaks.json
chapter 0:00 Welcome
chapter 3:20 The bug
chapter 9:45 The fix
marker 5:02 The crash [bad]
0:00 Ana: Welcome back.
0:04 Ben: Today we look at a crash.
5:10 Plain line with no speaker
```

A compact one, and one with a transcript file.

```audio src="https://example.com/a.mp3" compact loop download=on
```

```audio src="media/b.ogg" title="With a transcript file" transcript=open
transcript: media/b.en.vtt
```
