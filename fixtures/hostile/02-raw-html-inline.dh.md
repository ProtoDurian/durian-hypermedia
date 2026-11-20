---
title: Inline HTML with event handlers
expect: no onerror or onload attribute; the tags show as text
---

Text with an image <img src=x onerror="alert(1)"> and a <svg onload="alert(1)"></svg> and <a href="javascript:alert(1)">a link</a>.
