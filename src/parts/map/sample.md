Places and written routes work without a tile provider. A dashed route has no road geometry; the host may supply its own router.

```map title="Walk to the garden"
place start "Library" 51.507, -0.128 [c1] note="Meet by the entrance"
place garden "Garden" 51.511, -0.117 [c2]
route walk "Morning walk" by=walk [c2]: start -> 51.508, -0.123 -> garden
@step Meet at the library.
focus start
@step Follow the written route.
show walk
focus walk
```

Country values and flows share one map and one value list; the map is framed on the places that have a value.

```map title="Daily flow" unit="units per day" scale=steps steps=4
fill DE 83.2
fill FR 68.4
arc DE -> FR 24 "Daily flow" [c2]
```

US states work the same way.

```map title="Western states" unit="units per day" scale=steps steps=4
fill US-CA 39.5
fill US-WA 7.7
fill US-AZ 7.2
fill US-OR 4.2
fill US-NV 3.1
```

The globe uses the same data; with no WebGL it falls back to the flat map.

```map title="Global flow" view=globe spin=off unit="units per day"
fill DE 83.2
fill FR 68.4
arc DE -> FR 24 "Daily flow" [c2]
```

A static globe is a flat map with all its values, ready to print.

```map title="A still map" view=globe static
fill DE 83.2
fill FR 68.4
```
