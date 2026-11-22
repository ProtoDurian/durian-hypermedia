A video part keeps the browser's video and draws its own controls: a big play button on the poster, a bar with the chapters as segments (point at it to see the chapter and a still), captions drawn by us from a WebVTT file, picture in picture and full screen. The picture here is a made-up moving gradient.

```video src="media/sample.mp4" poster="media/poster.jpg" title="Colours drifting" duration=0:12
captions: media/sample.en.vtt "English" default
thumbs: media/thumbs.vtt
chapter 0:00 Warm
chapter 0:04 Cool
chapter 0:08 Bright
0:00 The colours drift slowly across the frame.
0:04 Captions are drawn by the part from a WebVTT file.
0:08 Press C to turn them off, and F for full screen.
```

`clip` is for a short screen recording that would otherwise be a GIF: it plays muted and in a loop while it is on screen, stops when it scrolls away, and stays still when the reader asks for less motion.

```video src="media/clip.mp4" title="A short silent loop" clip height=s
```
