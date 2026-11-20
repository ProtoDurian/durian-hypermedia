---
title: data, vbscript and file URLs
expect: none of them becomes a link or an image source
---

[data html](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)
[vbscript](vbscript:msgbox(1))
[file](file:///etc/passwd)
[blob](blob:https://example.com/123)

![data image](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+)
![javascript image](javascript:alert(1))
![remote over http](http://example.com/pixel.gif)
