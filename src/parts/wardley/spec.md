#### Wardley map

````
```wardley title="A tea shop"
anchor customer "Customer" visible=0.95 evolution=0.6
component kettle "Kettle" visible=0.45 evolution=0.4
component power "Power" visible=0.1 evolution=0.85
customer -> kettle
kettle -> power
@step Today the kettle is a product we buy.
highlight kettle
@step A smart kettle moves it further to the right.
evolve kettle 0.65 "smart kettle"
```
````

- **Axes:** evolution left to right (genesis, custom built, product, commodity), visibility top (seen by the user) to bottom. Positions are named keys: `visible=` 0 to 1, `evolution=` 0 to 1 or a stage word (`genesis`, `custom`, `product`, `commodity`: the middle of that stage). A bare pair like `[0.4, 0.6]` is refused.
- **Lines:** `anchor` and `component <id> "label" visible= evolution=` (an id is letters, digits, `-`, `_` and `.`), `a -> b` (a needs b), `evolve <id> <evolution> ["label"]`, `inertia <id>`, `pipeline <id> from= to=`, `note "text" visible= evolution=`, `group <id> "label": a, b`, `highlight <id>`.
- **Steps:** build up; `evolve` under a step moves the component along its dashed arrow, `highlight` rings one. **Static:** `static=` on the fence draws one step whole.
- **Look:** a small word placer keeps each label off the dots, the lines and the other labels. On a narrow stage the map scrolls sideways in its own box.
- **LLM view:** a table `component | evolution | visible` (`product (0.40)`), then the needs, moves, inertia, pipelines, groups and notes as lines, then the step captions.
- **Caps:** `wardleyComponents` (60; 40 in UNTRUSTED_LIMITS). The word placer looks at a bounded number of things for each label, and its cost is charged to the budget when the map is drawn.
- **doccheck refuses:** a bare pair, a value outside 0 to 1, a component with no `visible=` or no `evolution=`, an unknown key, an id with a character outside the set or written twice, a need, `inertia`, `highlight`, `pipeline`, `group` or `evolve` that names something that is not a component, a pipeline with no `from=` or `to=`, a note with no text or position, needs that go round in a circle, a line that is none of these, no component, more components than the cap, an unknown attribute, and a part over the page's work budget. It warns when `evolve` goes to the left.
