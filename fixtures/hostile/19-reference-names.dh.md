---
title: "Reference names that are refused"
---

# Reference names

[[svg:https://198.51.100.7/logo.svg "a URL"]]

[[svg://203.0.113.9/x.svg "a URL with no scheme"]]

[[svg:www.example.com "a host name"]]

[[chart:../../secrets "a path"]]

[[chart:folder/file "a path with a slash"]]

[[chart:.hidden "a dot first"]]

[[interactive:javascript:alert(1) "a scheme"]]

[[interactive:data:text/html,hi "data"]]

[[terminal:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "a name of 135"]]

[[chart:naïve "a letter outside ASCII"]]

[[chart:sales "<script>window.__pwned = 1</script>"]]

[[chart:sales "<img src=x onerror=alert(1)>"]]

Chips too: [[svg:https://198.51.100.7/a.svg]], [[chart:a/b "x"]] and [[chart:sales "unclosed label]].

[[chart:sales extra words "label"]]

An unclosed one is text: [[chart:sales "label"

[[chart:x [[chart:y]]
