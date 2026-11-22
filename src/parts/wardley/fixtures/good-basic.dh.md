---
title: Wardley, good
---
# Wardley map

Components by evolution and visibility.

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

Every kind of line, with stage words.

```wardley title="Everything"
anchor user "User" visible=1 evolution=product
component app "App" visible=0.7 evolution=custom
component db "Database" visible=0.4 evolution=commodity
component model "Model" visible=0.5 evolution=genesis
user -> app
app -> db
app -> model
inertia db
pipeline db from=0.7 to=0.95
group core "Core": app, db
```
