Flame port verification

- Part tests and folder contract: 51 passed, 0 failed.
- Browser check: 1280 and 390, light and dark; browser-only rendering under strict Trusted Types. No script or policy errors, no page overflow, smallest text 12 px. All four screenshots inspected: chart descends, folded graph grows upward; phone drawing scrolls within its own box. Desktop width accounts for the card padding.
- Type check: the 11 pre-existing errors outside the part; no added errors.
- Hygiene and public-text checks: 0 hits.
- Both presets: flameFrames 2000, flameLines 6000, flameDepth 80, flameName 120. The document work budget may refuse a large input before a size cap.
- Hostile fixture parse and check, worst observed across repeated sets of ten: LIMITS 16.26 ms; UNTRUSTED_LIMITS 6.11 ms. These are observations on a shared machine, not timing assertions.
- Parser, search and lexical ordering use forward scans and radix passes; doubling charges measured at three sizes. Accumulated counts must stay finite.
- No extra library. Words retain the prototype's English fallback. Hosts can adjust the flame-prefixed tokens.
