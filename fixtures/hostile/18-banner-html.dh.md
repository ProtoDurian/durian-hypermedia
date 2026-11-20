---
title: A banner with HTML in it
banner:
  kind: "<script>alert(1)</script>"
  text: "Hello <img src=x onerror=alert(1)> [x](javascript:alert(1))"
expect: the banner text is text; an unknown kind becomes info; the link is dropped
---

Body.
