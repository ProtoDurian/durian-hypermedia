---
title: Compare image, hostile
---
# Compare image refused

Addresses a host never loads, a missing alt text, a quote that never closes and bad options: refused with a line and a fix, never a hang.

```compare-image
before: data:image/png;base64,AAAA "inline"
after: javascript:alert(1) "script"
```

```compare-image before="" start=500 direction=sideways ratio=wide fit=stretch colour=red
before: ../secret.png "up a folder"
after: //example.com/a.png "another host"
```

```compare-image
before: images/a.png
after: images/b.txt "not an image"
before: images/c.png "given twice"
```

```compare-image
before: images/a.png "an alt text that never closes
after: images/b.png "fine"
```
