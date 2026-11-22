---
title: Video, good
---
# Video

A video with captions, thumbnails and chapters.

```video src="media/c.mp4" poster="media/c.jpg" title="Creating a project" duration=1:58
source: media/c.webm
captions: media/c.en.vtt "English" default
captions: media/c.es.vtt "Español"
thumbs: media/c.thumbs.vtt
chapter 0:00 Start
chapter 0:42 Answer the questions
chapter 1:30 The result
```

A stream, and a silent clip.

```video src="media/live.m3u8"
```

```video src="media/a.mp4" clip loop
```
