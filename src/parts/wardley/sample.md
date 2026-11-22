Components by evolution (left to right) and visibility (top to bottom). Positions are named keys, so the two numbers cannot be swapped.

```wardley title="A tea shop"
anchor customer "Customer" visible=0.95 evolution=0.6
component cup "Cup of tea" visible=0.8 evolution=0.6
component tea "Tea" visible=0.6 evolution=0.8
component kettle "Kettle" visible=0.45 evolution=0.4
component power "Power" visible=0.1 evolution=0.85
customer -> cup
cup -> tea
cup -> kettle
kettle -> power
note "Kettles are a product now" visible=0.3 evolution=0.1
@step Today the kettle is a product we buy.
highlight kettle
@step A smart kettle moves it further to the right.
evolve kettle 0.65 "smart kettle"
```
