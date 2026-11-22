---
title: Video, hostile
---
# Video, hostile

Autoplay, a streaming-site address, two default captions, a clip with sound options and chapters, and a poster that is not a picture: refused with a line and a fix, never a hang.

```video src="https://www.youtube.com/watch?v=abc" autoplay poster=p.txt
captions: a.vtt "A" default
captions: b.vtt "B" default
captions: c.srt "C"
captions: d.vtt
thumbs: t.json
```

```video src="a.mp4" clip volume=off
chapter 0:00 A
```

```video src="a.mp4" duration=0:30
chapter 1:00 Late
```
