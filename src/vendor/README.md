# Vendored code

## markdown-it.js

- What: the library build of [markdown-it](https://github.com/markdown-it/markdown-it) 15.0.3 (`dist/markdown-it.mjs`
  and its types `dist/markdown-it.d.mts`, here `markdown-it.js` and `markdown-it.d.ts`). Licence: MIT, in
  `markdown-it.LICENSE`.
- Why vendored: the npm package also installs its command line tool's argument parser, whose licence is not MIT, BSD or
  Apache. The library itself does not use it. Its runtime imports (`mdurl`, `uc.micro`, `entities`, `linkify-it`,
  `punycode.js`; MIT and BSD-2-Clause) are ordinary dependencies of this package.
- Why markdown-it: it reads Markdown in time linear in the text (its pathological tests; measured again for this
  package, see test/markdown-work.test.ts). marked 15 and later backtrack on several common shapes of text.
- Changes from upstream: the last line (`//# sourceMappingURL=markdown-it.mjs.map`) is removed, since the map is not
  vendored. Nothing else.
- Upstream sha256: `markdown-it.mjs` 60dff81404169420bc0dae52e221c933ef48bd38a66eb9ca657c582621782047,
  `markdown-it.d.mts` 03973d3c4ca1ebf17052a772fcb67d919ab9963d227b38a907a3782a1af582fb.
- To update: copy the two files from the new release, drop the source map line, update this file, and run the
  Markdown tests (they compare the tree and the work counts).
