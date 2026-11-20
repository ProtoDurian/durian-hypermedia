---
title: HTML inside every part's text
expect: every part shows the text as text
---

```terminal title="<img src=x onerror=alert(1)>"
$ echo "<script>alert(1)</script>"
<script>alert(2)</script>
```

```filetree
src/  # <img src=x onerror=alert(1)>
  a.ts  (new)  # <script>alert(1)</script>
```

```chart
kind: bar
title: "<img src=x onerror=alert(1)>"
x: ["<script>a</script>", "b"]
series:
  - name: "<b onmouseover=alert(1)>s</b>"
    data: [1, 2]
```

```tierlist title="<script>alert(1)</script>"
S: <img src=x onerror=alert(1)>
A: plain
```

```codewalk
@file a.ts
const a = "<script>alert(1)</script>";
@step a.ts focus=1
A note with <img src=x onerror=alert(1)> and <script>alert(2)</script>.
```

```animation
box a "<img src=x onerror=alert(1)>"
box b "<script>alert(2)</script>"
a -> b
@step Send
send "<svg onload=alert(3)>" a -> b
```
