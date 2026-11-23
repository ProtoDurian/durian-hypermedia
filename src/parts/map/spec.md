#### Map and routes

````
```map title="Lunch near the office"
place office "Office" 37.7897, -122.3972 [c1] note="Front door on Mission Street"
place cafe "Blue Cafe" 37.7880, -122.4010 [c3]
route walk "Walk to lunch" by=walk [acc]: office -> 37.7889, -122.3987 -> cafe
area zone "Delivery zone" [warn]: 37.791, -122.401; 37.791, -122.394; 37.786, -122.394
@step The office.
focus office
@step Four minutes to the cafe.
show walk
```
````

- **Lines:** `place <id> "label" <lat>, <lng> [colour] [note="..."]`; `route <id> "label" by=<way> [colour]: <stop> -> <stop> ...` (a stop is a place id or `lat, lng`; a pair between two stops is a point the line passes through); `area <id> "label" [colour]: <lat, lng>; ...` (3 or more corners); `view <lat>, <lng> zoom=<0-18>`. Under a step: `focus <id>` (the camera flies to it) and `show <id>` (a route draws itself, an area fades in). A route or area written before the first step is drawn from the step that shows it. Latitude comes first. Ways: `walk`, `bike`, `drive`, `transit`, `straight`, `flight` (a great-circle arc).
- **The host picks the provider.** `DocumentView` takes a `map` host capability: Leaflet on OpenStreetMap tiles, MapLibre, Google (its own key), or nothing. With none, and with no host provider, a part draws a still picture of the same view (places, routes, areas, a grid, a scale bar) and a list of places with their coordinates and an "Open in maps" link. A route follows roads only when the host passes its own router (`routing`, an OSRM-style server or Google); a route with points written between its stops is drawn through them; any other is a dashed straight line, and the legend says so.
- **Pins, routes, areas, the card and every gesture are ours on every provider** (a provider is only the tiles under them). A mouse drags, Ctrl + wheel zooms, one finger scrolls the page and two fingers move and pinch the map, arrows pan, `+` and `-` zoom, Tab walks the pins; a pin opens one card (the shared popover) with the coordinates, the note and an "Open in maps" link.
- **The LLM view:** `Map: <title>.`, then the places with coordinates, the routes (`Office -> Blue Cafe (about 0.4 km in a straight line)`), the areas and the step captions. Distances are straight-line (haversine), so they are the same everywhere.
- **doccheck refuses:** a latitude outside -90 to 90 or a longitude outside -180 to 180; a route stop that is neither a place nor a pair; fewer than 2 stops; an area with fewer than 3 corners; an unknown way; a zoom outside 0 to 18; a colour that is not a word; an id used twice; a `focus` or `show` of an unknown id or outside a step; caps (100 places, 50 routes and areas, 2,000 points).


##### Regions coloured by a value

````
```map title="Population, millions" unit="million people" scale=steps steps=5
fill DE 84
fill FR 68 note="Metropolitan France"
fill US-CA 39.5
```
````

- **A line** `fill <region> <value> [note="..."]`: a region is a country by its ISO 3166-1 alpha-2 code in capitals (`DE`) or a US state (`US-CA`). The value is a number (`1_200_000` and `1.5e6` read). Each region has one value. A `fill` under a step appears in that step; `focus <region>` flies to it.
- **Keys on the fence:** `unit="..."` (the unit, shown in the legend and every card), `scale=heat|steps` (a smooth ramp, or `steps=3` to `9` even bands; the default is a smooth ramp), `diverge=<n>` (a neutral middle at `n`, two colours either side: for change, profit and loss), `min=` and `max=` (pin the range; values outside are clamped), `none="No data"` (the legend's word for a region with no value).
- **Boundaries are our own file** from Natural Earth 1:50m (public domain; 236 countries and territories, 51 US states with DC), simplified to about 5 km: about 42 KB compressed for the world and 7 KB for the states, decoded only by a map that has a `fill` or a globe. Antarctica is left out (Web Mercator cannot draw it); Somaliland, Northern Cyprus and Siachen have no ISO code and are not regions. With many other states filled, the default view leaves out Alaska and Hawaii (the list under the map has every value, and the reader can zoom out).
- **Drawn** on the still picture (the land with no value is drawn as "no data"), on any provider's tiles (the filled regions only, 78% opaque) and on the globe, in the `--map-heat-*` colours of the theme (light and dark), with our own legend (a ramp with its ends and middle, or the bands), a list of values highest first (each row is a button that flies to the region and opens its card), and a card on hover, focus and tap with the value and its rank. With 12 regions or fewer each region is also a tab stop.
- **The LLM view:** a table `region | value (unit)` in the order written, the range, and for arcs a list `from -> to: value`.
- **doccheck refuses:** an unknown region code (it names the likely ones: `Germany` gives `DE (Germany)`); a value that is not a number; a region filled twice; text after the value; an unknown key, scale or view; `steps=` outside 3 to 9; `min` not below `max`; `diverge` that is not a number; a `focus` of an unknown code; caps (300 fills).
- **Load-time limits a host can lower** (the part’s `mapGeoPoints` limit, outside the parse budget): `geoPoints: 60000` (over it, every k-th point is kept: the shapes get coarser, never refused), `fills: 300`, `arcs: 200`. Every line is charged to the document's work budget; a wrong code is charged for the search for look-alikes.

##### Arcs between places

````
```map title="Backups" unit="TB per day"
place sfo "San Francisco" 37.77, -122.42
place fra "Frankfurt" 50.11, 8.68
arc sfo -> fra 120 "Primary" [c3] id=a1
arc DE -> US 40
```
````

- **A line** `arc <from> -> <to> <value> ["label"] [colour] [id=name]`: an end is a place id, a region code (the arc starts at its label point) or a `lat, lng` pair. The value is above 0: the width of the arc is its value (a square root scale, 2 to 14 px). `id=` is for a step's `show`.
- **Drawn** as a curve bowed to the left of its travel (a flow and its return take two lanes), with an end dot and moving dots that show the direction (stopped under reduced motion), on any provider, on the still picture and on the globe (a great circle lifted off the sphere). An arc that crosses the date line takes the short way. Hover, tap or Tab (up to 12 arcs; the "Flows" list under the map has every arc) gives a card with the value.
- **doccheck refuses:** the wrong shape (it shows the line), a missing value, a value of 0 or below, the same point at both ends, an end that is not a place, a region or a pair (with the likely codes), a bad colour, extra words, an id used twice, over 200 arcs.

##### Globe

- **`view=globe`** on a `map` fence turns it into a turning globe: three.js draws the sphere with the regions painted in one texture; the pins, arcs, region outline and card are the same DOM as the flat map, so the look is the same. A "Flat map" / "Globe" button switches. `view <lat>, <lng>` sets the first face; `focus` turns to a place, region or arc; `spin=off` keeps it still.
- **Reader:** a mouse drags to turn; on a phone one finger scrolls the page and two fingers turn and pinch; Ctrl + scroll zooms; arrows turn, `+` `-` zoom, `0` turns back; a button pauses the slow turn, which also stops when the reader touches it, a card is open, the pointer is over a region, the globe is off screen, or the reader prefers reduced motion. With no WebGL it draws the flat map and says so.
- **Tokens** (the map’s `style.css`): `--map-ocean`, `--map-land`, `--map-border`, `--map-graticule`, `--map-region-line`, `--map-region-hover`, `--map-arc-opacity`, `--map-globe-h`, `--map-halo`. Slots: `land`, `regions`, `arc`, `scale`, `values`, `arcs`, `globe`.

- **Static:** draws the selected step immediately, without controls, gestures, routing or provider requests. A globe becomes a flat map; bundled boundaries and every value remain available without JavaScript.
- **Provider integration:** import `mapProvider` from `durian-hypermedia/react/map-providers` in host code and pass its result as `DocumentView map={...}`. Install the chosen optional provider and its CSS. This opt-in entry is outside the default and strict renderer graphs; Leaflet, MapLibre and Google have their own CSP requirements. The host can instead supply its own `MapHost` capabilities without these libraries.
