---
title: A banner is refused
banner:
  kind: "<script>alert(1)</script>"
  text: "Hello <img src=x onerror=alert(1)> [x](javascript:alert(1))"
expect: format version 10 has no banner; the renderer draws nothing for it and check() refuses it
---

Body.
