#### Fishbone

````
```fishbone title="Why is checkout slow?"
effect: Checkout takes 4 seconds at p95
People: on-call is new to the service
Process: no load test before a release
  only staging has real data
```
````

- `effect:` is the head. Every other line is `<category>: <cause>`; an indented line is a cause of that cause (2 levels). Repeat a category to add a cause to its bone. 2 to 8 categories, each in the next family colour.
- **Steps:** build up one category or cause at a time; `highlight <category>` lights a bone. **Narrow:** under 600 px of width the spine turns vertical, the head at the bottom. **Static:** `static=` on the fence draws one step whole.
- **LLM view:** `Fishbone: <title>. Effect: ... Causes by category:` and a nested list (then the step captions, numbered).
- **Caps:** `fishboneCauses` (60) causes and `fishboneSubCauses` (240; 120 in UNTRUSTED_LIMITS) sub-causes a fishbone.
- **doccheck refuses:** no `effect:` or two, an empty effect, fewer than 2 or more than 8 categories, a third level, an indented line with no cause above it, an empty cause, a `highlight` of an unknown category, a line that is not `name: text`, a fishbone over its caps or over the page's work budget.
