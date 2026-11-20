---
title: javascript links in every disguise
expect: no href that runs script; each link's text stays, without a link
---

[plain](javascript:alert(1))
[upper](JaVaScRiPt:alert(1))
[entity](&#106;avascript:alert(1))
[hex entity](&#x6A;avascript:alert(1))
[named colon](javascript&colon;alert(1))
[tab inside](java&#9;script:alert(1))
[percent](%6Aavascript:alert(1))
[spaces]( javascript:alert(1))
[autolink]: javascript:alert(1)
<javascript:alert(1)>
[reference link][autolink]
