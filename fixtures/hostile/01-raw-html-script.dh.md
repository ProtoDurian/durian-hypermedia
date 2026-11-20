---
title: Raw HTML block with a script
expect: no <script> element; the HTML shows as text
---

<script>window.__pwned = 1; alert(1)</script>

<div onclick="alert(1)">a div with a handler</div>

<iframe src="https://example.com"></iframe>

<style>body { display: none }</style>
