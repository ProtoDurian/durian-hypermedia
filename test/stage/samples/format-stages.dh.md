---
title: The composed stage samples
description: Every Format page section that holds a composed stage, on one page.
roles:
  client: c1
  server: c2
  store: c3
  job: c4
  cache: c5
  ops: c6
  plain: c0
---

# The composed stage samples

## Animation: a composed stage

An animation is **composed** by default: lanes left to right, cards with lines and badges, bands under lanes, then steps that show, light, tag and connect. The stage is laid out once for every step, so nothing moves; connectors are drawn after layout, from fanned ports, with their labels in the gap between lanes. Colours come from the page's `roles:` in the front matter, one per role on the whole page. A phone stacks the lanes. `layout=graph` on the fence sends a scene to the graph engine below instead.

```animation
title: Orders | one request, end to end
## Browsers
client b1..b4: laptop; phone; tablet; kiosk | sends GET /orders
... about 2,000 sessions
## Servers
server s0,s1: api 0; api 1 | answers in JSON
  + (a) worker a; (b) worker b
## Storage
store db: orders database | primary | region east
## _ under Servers..Storage
ops cfg: config service | pushes routes and limits
@step Ask: Each browser asks one server.
b1,b3 --> s0: GET
b2,b4 --> s1: GET
tag b1,b3: to api 0
tag b2,b4: to api 1
light s0,s1
@step Read: The servers read from the database.
s0,s1 --> db (store): SELECT
say db: one primary
light db
@step Config: The config service is off the data path.
cfg -> s1, db: polled
light cfg
@step In short: Browsers pull from servers; servers read one database.
key client: GET  browser to server
key store: SELECT  server to database
```

## Animation: a phase strip and swapped panels

A `track:` is a strip of phases, coloured by role; `at` puts each step on it, and `carry:` follows the step. A panel (`grid`, `rows`, `map`, `list`) shows only in its step, in one region as tall as the tallest, so the page does not jump. A grid item ends with a verdict, `[+ kept]` or `[- why]`.

```animation
track: job fetch, resolve | cache lookup | job build, test | store publish
carry: one package
where: a monorepo of 40 packages · the main branch
@step Resolve: Every package is listed; drafts and private ones are dropped.
at resolve
grid 2
  job: ui-kit | 3.2.0 · ready [+ kept]
  job: router | 1.9.4 · ready [+ kept]
  job: icons | 0.8.0 · draft [- draft: skip]
  job: internal-tools | 0.1.0 · private [- private: skip]
foot: only ready, public packages go on
@step Cache: Each package's hash picks its cache shard.
at lookup
rows
  ui-kit ; 3.2.0 | hash = 0x51a2 ; * shard 2 of 8 | => cache: cache shard 2 | a hit ; built before
  router ; 1.9.4 | hash = 0x9f07 ; * shard 7 of 8 | => cache: cache shard 7 | ! a miss ; build it
  ! a miss sends the package on to build
@step Publish: The built package is renamed for the registry.
at publish
map rename
  job: router 1.9.4
  built from the main branch
  to
  + name; + version; + licence; - source maps; - test files
```

## Animation: a worksheet

A `sheet:` lines up values in cells per row, rows in groups, and one outcome column. Steps `mark` a cell, give each row a `value`, `sum` a group (its result goes to the outcome column next) and write the `total`; `note:` and `= ...` are bands under the stage.

```animation
title: Takings | per hour, two shops
sheet: two shops, each with its own tills | 3 tills
server s0: shop north | 2 tills
  plain t1 "till 1": 40 55 70 85 20 35 50
  plain t2 "till 2": 10 20 30 40 50 60 70
server s1: shop south | 1 till
  plain t3 "till 3": 100 130 160 190 220 250 280
=> store out: head office | adds the shops
@step Counts: Each till's running count, read every 10 minutes.
@step Emptied: A drop means the till was emptied; the count before it is added back.
mark t1 5: bad +85
note: till 1 was emptied | 85 then 20 goes down: the till was emptied | so 85 is added back
@step Per hour: Each till's increase over the hour.
value t1 t2 t3: per hour | 95, 60, 180
@step Shops: Each shop adds its own tills.
sum s0: shop north | 95 + 60 = 155 -> 155
sum s1: shop south | 180 -> 180
@step Office: The office adds the shops.
total out: 155 + 180 = 335 => takings per hour | 335
aside out: an emptied till loses nothing
```

## Animation: a swimlane matrix

A `matrix:` crosses **lanes** (rows) with **columns** (`column id: Title`) into cells; each cell holds cards, chips and an "and more" line. `light lane.column: words` lights a cell with a few words under its contents; `show t4` brings a card in and `light t3` puts one in focus. Every cell and card has its place from the first step, so nothing moves. A phone stacks the matrix by lane: each lane is a block, with its columns as small headings.

```animation
title: A photo upload | who does what, stage by stage
matrix: Who holds the photo | five parts, four stages
column sb: Submit | the request
column qu: Queue | waits for a worker
column rn: Run | the work
column rp: Report | the answer
client c: Browser | the person
  sb: [u1] Upload | 4 MB, one file
  rp: [u3] Done page | thumbnail shown
server a: API | checks and accepts
  sb: [a1] Accept | size and type checked; + 202
  rp: [a2] Status | answers polling
job w: Worker | does the slow part
  rn: [w1] Resize | three sizes; + strip metadata
cache k: Job queue | keeps the order
  qu: [q1] Waiting job | first in, first out; ... about 30 more
store s: Storage | keeps the files
  rn: + original; + 3 sizes
@step Send: The browser sends the file.
light c.sb: the request leaves
light u1
@step Accept: The API checks it and queues a job.
light a.sb: 202 sent back
light k.qu: one more waiting
@step Work: A worker takes the job and writes the sizes.
light w.rn
light s.rn: files written
@step Done: The browser polls and shows the result.
show u3
light c.rp, a.rp
```

## Animation: time

A `time:` block is a real axis: a tick ruler, rows of states, and per step a marker (`at`) or a bracket over a span (`span`). Every mark sits at its true place.

```animation
title: A pipeline | build, then test, then deploy
time: 0..60 | seconds
row job j1 "build": queued 0..4; +running 4..31; done 31..60
row job j2 "test": queued 0..31; +running 31..52; done 52..60
row server d1 "deploy": waiting 0..52; +rolling 52..60
@step Build: The build runs first, for 27 seconds.
span j1 4..31: 27 s
@step Test: The test starts when the build ends.
at 31: build done
@step Deploy: The deploy starts at 52 seconds.
at 52: tests pass
```

## Animation: time up close

The full ruler and an enlarged inset share the same data. The handoff marker stays at 30 seconds, and progress uses a continuous value axis. A narrow page stacks the inset below the overview.

```animation
title: A studio export | prepare, render, deliver
time: 0..60 | seconds
ticks: 0, 15, 30, 45, 60
row job export "export": +prepare 0..24; +render 24..36; delivered 36..60
row server review "review": waiting 0..30; +checking 30..45; accepted 45..60
at 30: 30 s, review starts
zoom: 24..36 | Close-up
plot: 0..100 | percent complete
point job start at 0: 0 | Start
point job prepared at 24: 25 | Prepared
point job halfway at 30: 50 | Halfway
point job rendered at 36: 75 | Rendered
point job finish at 60: 100 | Complete
@step Prepare: Preparation takes the first 24 seconds.
span export 0..24: preparation
@step Handoff: Review begins halfway through rendering.
at 30: halfway
span export 24..36: rendering
@step Deliver: The export finishes before review ends.
at 36: export complete
```

## Animation: counted units

Each square is one unit. The grid includes the unassigned remainder, so the total can be counted directly.

```animation
title: A sample library | one square per clip
units 64: kept 16, added 8, removed 4
```

## Animation: time detail, static

The same real axes can be printed as a selected step. The marker, inset and values keep their places.

```animation static=2
title: A studio export | the handoff, held still
time: 0..60 | seconds
row job export "export": +prepare 0..24; +render 24..36; delivered 36..60
at 30: 30 s, review starts
zoom: 24..36 | Close-up
plot: 0..100 | percent complete
point job start at 0: 0 | Start
point job halfway at 30: 50 | Halfway
point job finish at 60: 100 | Complete
@step Prepare: The first 24 seconds prepare the export.
span export 0..24: preparation
@step Handoff: Review begins halfway through rendering.
at 30: halfway
```

## Animation: units on a ruler

Every cell is one hour. State changes, markers and spans use the same ruler.

```animation
title: A workshop day | one cell per hour
time: 0..12 | hours
cells: 1
ticks: 0, 3, 6, 9, 12
row job batch "batch": queued 0..3; +working 3..9; done 9..12 @2
row server pack "packing": _ 0..6 [dashed]; hold 6..7 @1 [warn]; +box 6..7 @2 [lit]; packing 7..11 @2 [good]; done 11..12 @2
at 6: packing begins
@step Make: The batch takes six hours to make.
keep span batch 3..9 [warn]: six hours
@step Pack: Packing overlaps the last three hours of making.
keep at 6 [bad]: both are active
```

## Animation: cells exchange a copy

Roomy cells can keep words while idle, change their state on a later step, and pass a copy to another row. Row labels can include a badge and a second line.

```animation
title: A print desk | one column per sheet
time: 0..4 | sheets
cells: 1 | roomy
ticks: 0.5 first, 1.5 second, 2.5 third, 3.5 fourth
row job draft "(a) Draft | writes": +×1 0..1; hold 1..2 @1 [warn]; +×2 1..2 @2 [lit]; +×3 2..3 @3; _ 3..4 @3 [dashed]
row server copy "| Copy | stores": paused 0..1 [dashed]; +×1 1..2 @2; issue 2..3 @2 [bad]; ×3 2..3 @3 [good]; _ 3..4 @3 [dashed]
@step Draft: The second sheet waits at the desk.
@step Copy: A saved copy returns to the draft row; the third sheet's copy has an issue.
arrow copy -> draft at 1.5: saved copy
@step Input: The third copy is stored after all, and a new sheet arrives from above.
arrow above -> draft at 2.5 [dashed]: new sheet
```

## Animation: dots on a ruler

Dots can sit on the ruler without a value plot. A dashed box names the observation window, and a marker above the ruler stays visible from its step onward.

```animation
title: A delivery check | samples along a window
time: 0..40 | minutes
ticks: 0 start, 10, 20, 30, 40 check
window: 0..40 | observation window
zoom: 38..42 | A write around the check | below @1..1
zoom ticks: 40 check
zoom labels: 38 before, 39 near, 41 after, 42 end
zoom row job receipt "Receipt: three entries": +writing 39..41 [warn]
dot 5, 15
dot 25 [good]: saved
dot 30: newest
@step Watch: One newer sample arrives during the window.
span axis 0..20 [line] [warn]: first half
keep span receipt 39..41 [line] [warn]: three entries
@step Check: The check runs at the end of the window.
keep at 40 [solid] [plain]: check runs
span axis 0..20 [line] [warn]: first half
@step Retire: The marker line stays while its label retires.
hush at 40
span axis 0..20 [line] [warn]: first half
```

## Animation: two clocks

Name each axis when a scene compares clocks. A numbered state prints each cell's interval start, and a marker can name its axis explicitly.

```animation
title: Two clocks | one task at two scales
time minutes: 0..8 | minutes
ruler: none
cells: 1
row job m "Minutes": +_ 0..4 [numbered]; _ 4..8 @2 [numbered]
time ticks: 40..48 | ticks
ruler: none
cells: 1
row server r "": +_ 40..44 [numbered]; _ 44..48 @2 [numbered]
@step First: The clocks show different ranges.
keep at minutes 3 [guide] [below]: minute
keep at ticks 43 [solid] [plain] [below]: tick
@step Second: The later cells arrive without moving earlier ones.
keep span r 40..44 [line]: early range
```

## Animation: a late timeline

A named time block can appear in a later step without moving the surrounding drawing. Hide its ruler while retaining its caption and true proportions. Words may sit after thin bars.

```animation
title: A publishing desk | three measured intervals
track: job prepare, review, publish
time durations: 0..24 | seconds
ruler: none
row job first "First": _ 0..6 [dashed] [after]
row server next "Next": +ready 0..12 [after]
row job last "Last": +finish 0..24 [after]
@step Prepare: The intervals have a reserved place.
at prepare
@step Review: The layout stays fixed.
at review
@step Publish: The measured bars appear together.
at publish
show durations
```

## Animation: counted pieces beside a card

Counted rows can sit beside another step panel. The role before the parentheses colours the squares; the role inside colours the badge. Plain and muted text follow the counts.

```animation
title: A copy desk | counted pieces
@step Leaving: Some pieces are leaving each desk.
card job: Draft | A copy remains here.
beside
units Stored pieces | One square is one piece.
  job (client) 12: kept 8, leaving 4
  job (server) 12: kept 10, leaving 2
  c, the client desk: 8 kept, 4 leaving.
  s, the server desk: 10 kept, 2 leaving.
  ~ Thick borders show departing pieces.
@step Gone: The departed pieces are faint.
card job: Draft | The retained copy is ready.
beside
units Stored pieces | One square is one piece.
  job (client) 12: kept 8, gone 4
  job (server) 12: kept 10, gone 2
  c, the client desk: 8 kept, 4 gone.
  s, the server desk: 10 kept, 2 gone.
  ~ Faint squares show departed pieces.
```

## Animation: cards inside cards

A card line indented under a card is a card **inside** it (one level). The outer card is as tall as what it holds, and a connector to or from an inner card starts or ends at the card that holds it, so no line crosses a card. A title may end in a state word, `[+ open]` (good) or `[- shut]` (bad), that a step changes with `state`; `text id: line | line` gives a card new lines from that step on; `dashed` draws a card that is not there yet, and `dashed id off` makes it solid. `## Desk across Branches..Readers` is a band whose cards run left to right in one row; a line `next row` starts the row under them, centred.

```animation
title: A library | books between branches
## Branches
store h: main branch | two floors | open late
  store f1: ground floor [+ open] | returns desk
  store f2: top floor [- shut] | reading room
## Vans
job v: book van | one driver
  job v1: morning run | 8 stops
  job v2: evening run | 5 stops
## Readers
client r: readers
  client r1: card holder | borrows 3
  client r2: new reader | no card yet
## Desk across Branches..Readers
ops a: check in
ops b: shelve
ops c: lend
next row
ops d: repair
@step Morning: Books leave the main branch on the morning van.
dashed r2
f1 -> v: 40 books
v1 -> r: drop-off
@step Evening: The top floor opens and a new reader joins.
state f2: [+ open]
text v2: 5 stops | and the late club
dashed r2 off
tag r2: joined
say v2: runs late tonight and comes back by ten | one driver
say v2: no stops on the hill
@step Desk: Every book goes through the desk, one step at a time.
clear
a --> b: next
b --> c: next
d -> b: mended
```

## Animation: pills that move

`pill ids: words; words` under a card stacks pills at its foot. `move p3 to w` draws the pill in the other card from that step on; both cards keep a place for it, so nothing else moves. `light p1: note` lights a pill with a note at its right end, `tone id bad` (or `good`, `warn`, `accent`, `off`) and `dim id` change a card from that step on, and `align: top` gives the cards of a row one top and one foot.

```animation
title: Bakery shelves | trays move as they sell
align: top
## Oven
job o: oven | batch 1
cache t: timer | 20 minutes
## Shelf A
server sa: shelf A | by the door
  pill p1,p2,p3: rye · fresh; spelt · fresh; oat · cooling
## Shelf B
server sb: shelf B | at the back
  pill p4: seed · fresh
## Window
client w: window | on the street
  pill p5: brioche · on show
@step Bake: The oven fills shelf A.
o -> sa: trays
@step Sell: Rye sells out and the oat loaf moves to the window.
move p3 to w
light p1: sold
dim p1
text sa: rye is gone | spelt stays
@step Late: Shelf B runs low and closes; the timer is off.
tone sb bad
dim t
text sb: closed for the night
```

## Animation: token chips and a record

`tokens: ...` under a card lays out its words as chips, in order, wrapped. `mark id word, word: tone remark` boxes some in a tone for that step only, with the remark under their row (a word with a comma is named without it, or by its place, `#3`). `keys: A; B` makes the card a record whose values read `...` until a step fills them: `fill id A, B: value; value`. The record keeps its size on every step.

```animation
title: Reading a recipe line | words become a plan
## _
plain q: the line
  tokens: mix ( flour, sugar, salt ) then bake ( 180C, 25min )
store r: the plan
  keys: Action; Inputs; Then; Heat; Time
@step Read: The line is read word by word; the plan is still empty.
@step Mix: The first call names what to mix.
mark q mix, flour, sugar, salt: accent
fill r Action, Inputs: mix; flour, sugar, salt
@step Drop: Salt is optional here, so it is dropped.
mark q salt: bad dropped: optional
fill r Inputs: flour, sugar
@step Bake: Then the oven, hot and for a time.
mark q bake, 180C, 25min: accent
fill r Then, Heat, Time: bake; 180C; 25 minutes
```

## Animation: two arrows, one label each

A connector line of one pair keeps its own label: two lines that both say `30 crates` show it on both arrows. A line of several pairs, `m -> s, t: 12 each`, shows its label once for the bundle, and so do such lines with one label across one gap.

```animation
title: A market morning | crates in, crates out
## Farms
job a: hill farm | apples
job b: river farm | pears
## Market
store m: market hall | one floor
## Shops
client s: corner shop
client t: station kiosk
@step Arrive: Both farms bring the same load.
a -> m: 30 crates
b -> m: 30 crates
@step Share: The hall sends some on, the same to each shop.
m -> s, t: 12 each
@step Again: Next morning the hill farm comes again with the same load.
clear
a -> m: 30 crates
```

## Animation: a key

With the setup line `key at: top right`, the scene's `key role: words; words` entries form a legend at the stage's top right, each a small swatch in the role's colour with its words beside it. An entry shows from the step that writes it; its place is kept from the start, so nothing moves. Without that line the key stays at the bottom left.

```animation
title: A bike shop | parts in, bikes out
key at: top right
## Store room
store p: parts shelf | wheels, chains
## Bench
job f: fitter | one bench
## Door
client c: rider
@step Parts: The fitter takes parts from the shelf.
p -> f: two wheels
key store: kept in stock
key job: work done here
@step Ride: The bike goes out of the door.
f -> c: one bike
key client: who it is for
```

## Animation: boxes inside boxes

A `nest:` draws wrappers as boxes inside boxes, outside first, each with a role, a title, a size and its fields; a field after `> ` sits at the box's end, under what it holds. Every box has its place from the first step, so a wrapper put round later, or taken off, moves nothing. A step can `show` a wrapper, `light` it or one of its fields, give it new `fields` or a new `title`, `set` one field (the old value struck beside the new one, for that step), `unwrap` it (the wrapper comes off what it holds: dashed and struck for that step, then gone) or `hide` it. Fields are written in the mono face, so they line up.

```animation
title: A parcel | wrapped for the trip, unwrapped at the door
nest: The parcel | outside in
  store crate: shipping crate | 40 kg | to the depot; from the warehouse; > seal 7731
  job box: box | 2 kg | to the house; status: packed
  client gift: gift | a mug | wrapped in paper
@step Boxed: The gift goes in a box addressed to the house.
light gift
@step Crated: The box rides in a crate addressed to the depot, not to the house.
show crate
light crate: to the depot
@step At the depot: The crate comes off; the box goes on the van.
unwrap crate
set box: status: packed => status: out for delivery
@step At the door: The box comes off, and the gift is there.
unwrap box
light gift
```

## Animation: counted columns

A `columns` block is a dot histogram: one column per category, one dot per counted thing, stacked from the bottom. The columns' places are kept for the widest step, so adding columns moves nothing; `new` lights columns in the step that adds them.

```animation
title: A lending library | one dot per book returned
columns 12 store: books returned each month, one dot each, in their month's column | books
  every 3
  labels: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
@step First half: Six months: 12 to 31 books a month.
counts 6: 24, 19, 31, 22, 27, 12
@step The year: The second half adds six columns; the summer months are quiet.
counts 12: 24, 19, 31, 22, 27, 12, 9, 11, 28, 30, 26, 35
light Jul..Dec
@step December: December is the busiest month of the year.
light Dec
```

## Animation: a bar chart in a scene

A `bars` block is a small bar chart on one value axis: grid values, reference lines, and per step new values, a dotted peak line, a dashed limit (bars over it light up in its step), and moves from one bar to others, drawn as dashed arrows with the moved amount stacked on the taker. Every bar top and line sits at its true value.

```animation
title: A café | cups sold, by day
bars 7 server: day of the week · bar = cups sold ÷ the weekly average | ×
  axis 0, 0.5, 1, 1.5
  line average: 1
  labels: Mon, Tue, Wed, Thu, Fri, Sat, Sun
  tabs One barista: 1..3; Two baristas: 4
@step Busy Friday: Friday sells 1.4 times the average day.
values: 0.7 0.8 0.9 1.0 1.4 1.3 0.9
peak: busiest 1.4×
heading: cups by day | the week of 3 March
big: 1.4× | busiest ÷ average
@step A cap: No day should go over 1.2 times the average; two days do.
limit 1.2: cap 1.2×
heading: cap = 1.2 × the average · 2 days are over it
@step Move orders: Friday and Saturday hand pre-orders to Monday and Tuesday.
values: 0.9 0.9 0.9 1.0 1.2 1.2 0.9
move 2 from Fri to Mon; 1 from Sat to Tue
peak: busiest 1.2×
big: 1.2× | busiest ÷ average
heading: the moves: Fri → Mon (2 trays), Sat → Tue (1 tray) | the week's total does not change
@step Two baristas: Saturday remains the busiest day; Friday is also above average.
values: 0.9 0.9 1.0 1.0 1.1 1.2 0.9
light Sat: the busiest
heading: two baristas, a month later
```

## Animation: dots with short words

On a phone, a row of dots keeps its short word beside the dot when it fits, with the row heading immediately above. Each dot stays on its true time.

```animation
title: A small copy desk | two arrivals
time: 0..10 | seconds
ruler: none
row job draft "Draft": +draft 2.9..3.1 @1..1 [dot]; +stored 2.9..3.1 @2 [dot]
row server copy "Copy": +copy 4.9..5.1 @1..1 [dot]; +saved 4.9..5.1 @2 [dot]
@step Arrive: The pieces arrive at different times.
keep at 3 [guide]: first copy
keep at 5 [guide] [good]: last copy
@step Save: The words change while the dots stay still.
```

## Animation: a package journey

A standalone phase strip connects every adjacent phase, including links that wrap to another row on a phone.

```animation
title: A package journey | fetch through publish
track: job fetch, resolve | cache lookup | job build, test | store publish
carry: one package
@step Resolve: The package starts with its dependencies.
at resolve
@step Cache: The cache answers.
at lookup
@step Publish: The package reaches the registry.
at publish
```

## Animation: labelled columns

Boxed headers use the same columns as the ordinary cell rows. Tick positions name column centres; labels can include a short word.

```animation
title: A work week | one column per shift
time: 0..7 | shifts
cells: 1 | headers
ticks: 0.5 first, 1.5 second, 2.5 third check, 3.5 fourth, 4.5 fifth, 5.5 sixth switch, 6.5 seventh
row job draft "Draft": +ready 0..4; waiting 4..5 @1; +ready 4..5 @2; waiting 5..7
row server copy "Copy": waiting 0..7
@step Wait: The fifth shift waits.
@step Ready: The fifth shift is ready.
```

## Animation: compact numeric rows

On a phone, dense numbered cells show every digit, bottom to top when the number cannot fit level. A short row heading can sit beside the cells.

```animation
title: A compact schedule | two clocks
time slots: 200..232 | shifts
ruler: none
cells: 1
row job slots "": +_ 200..232 [numbered]
time reads: 0..31 | reading clock
ruler: none
row labels: beside
cells: 1
row server readings "reads": 0 0..1; 1 1..2; 2 2..3; 3 3..4; 4 4..5; 5 5..6; 6 6..7; 7 7..8; 8 8..9; 9 9..10; 10 10..11; 11 11..12; 12 12..13; 13 13..14; 14 14..15; 15 15..16; 16 16..17; 17 17..18; 18 18..19; 19 19..20; 20 20..21; 21 21..22; 22 22..23; 23 23..24; 24 24..25; 25 25..26; 26 26..27; 27 27..28; 28 28..29; 29 29..30; 30 30..31
@step Read: Both clocks keep their full ranges.
@step Check: A guide marks a saved reading.
keep at reads 12 [guide]: saved
```

## Animation: a panel with an enlarged inset

Place the panels before the time block. A lone panel with two shares leaves room for the enlarged inset; on a phone the panel, inset and overview stack in that order.

```animation
title: A close look | panel and detail
panels
time: 0..12 | overview
ticks: 0, 4, 8, 12
zoom: 8..12 | enlarged
zoom ticks: 8, 10, 12
zoom row job detail "Detail": +working 8..12
row job run "Run": +working 0..12
@step Begin: The same places are reserved from the first step.
@step Calculate: A calculation occupies the left half.
beside 1, 1
list Calculation
  first: 1
  second: 2
note: The saved sample is checked before the overview continues.
@step Finish: The result keeps the same place.
beside 1, 1
list Result
  first: 3
note: The result is ready to compare with the full window.
```

## Animation: every tick keeps its words

On a phone, tick labels can share several lines. No labelled tick is removed to make room for another one.

```animation
title: A labelled schedule | full words
time: 0..32
ticks: 0 p0, 4 p4 ▲ parcel ready, 8 p8, 28 p28, 30 p30, 32 p32
row job run "Run": +working 0..32
@step See: Every labelled tick keeps its words.
@step Lost: At 16 a copy is lost; the tick words stay.
keep at 16 [bad]: copy lost
```

## Animation: full words in narrow columns

When a word cannot fit inside a phone cell, its full caption sits below the row. Long header words share several lines above their columns.

```animation
title: A labelled archive | full cell words
time: 0..8
cells: 1 | headers
ticks: 0.5 first, 1.5 receiptTick, 2.5 third, 3.5 fourth, 4.5 fifth, 5.5 sixth, 6.5 seventh, 7.5 eighth
row job archive "": operators 0..4; /receipt 4..5; archived 5..6; payload 6..7 @2; paused 7..8 @2
@step Read: Full words remain readable.
@step Keep: The payload and the pause arrive; the other cells keep their places.
```

## Animation: arrivals over a bottom ruler

The ruler can sit below the rows. Arrival dots use their role’s pale fill and coloured border, and a marker can put its words in the step caption without a second stage label.

```animation
title: A parcel strip | arrivals over time
time: 0..12 | parcel spacing
ruler: below
row labels: beside
ticks: 0, 4, 8, 12
at 10 [solid] [good]: storage ready
row job first "First": packed 3.9..4.1 [dot]
row server second "Second": stored 7.9..8.1 @2 [dot]
at 6 [solid] [good] [caption]: The parcel is released.
@step Pack: The first dot records packing.
@step Store: The second dot records storage.
```

## Animation: roomy rows across a phone

Columns keep their full-axis pitch as cells appear. Row headings sit above phone cells; a transfer starts outside its source heading. Whole words retain the shared phone size.

```animation
title: A parcel desk | one column per shift
time: 0..7 | shifts
cells: 1 | roomy
row job draft "(a) Draft | first writer": +×1 0..4; +×2 4..7 @3
row server copy "(b) Copy | spare writer": +×1 0..4; lost 4..7 @3 [bad]
row job archive "| Archive": reads a parcel 0..4; +stored 4..7 @3
@step Draft: Four columns are revealed.
@step Copy: The copy is ready, but no reply reaches the draft.
tag copy 0..2: copy is ready
foot (job): the draft keeps its colour
arrow copy -> draft at 0.5 [dashed]: no reply
@step Input: The remaining columns appear in place.
arrow above -> draft at 5.5 [dashed]: a new parcel
```

## Animation: short pulses, readable intervals

Short interval captions keep each complete range and pack several entries onto a phone line.

```animation
title: Repeated pings | short intervals
time: 0..24 | seconds
row job refresh "Refreshes": ping 0.2..0.8; ping 2.2..2.8; ping 4.2..4.8; ping 6.2..6.8
row server engine "Engine": +working behind peers 0..24
@step Watch: Each ping keeps its exact range.
@step Complete: The captions keep their places.
at 20 [good]: all refreshed
```

## Animation: open and neutral arrival dots

A dot uses its row’s pale colour and outline. The existing plain style gives a neutral filled dot.

```animation
title: Arrivals by row | distinct dot styles
time: 0..8
ruler: none
row job root "Root": sent 1..2 [dot] [plain]
row server engine "Engine": working 3..4 [dot]
row job store "Store": saved 5..6 [dot] [plain] @5
@step Send: The root and engine are visible.
@step Pulse: The engine dot is solid for one step.
fill engine
@step Open: The dot returns to its pale paint.
@step Hold: The engine stays solid.
keep fill engine
@step Store: A neutral dot records storage.
@step Reset: The engine returns to its declared paint.
off engine
```

## Animation: bins

A `bins:` block sorts an inventory into named bins. `items p1..p8: words` names the things (one label for all, or one per id split by `;`); `items 40: word` is a count with no names, drawn as small squares. Each `bin role id "Label": the rule | a second line` is one bin, coloured by its role. In a step, `into <bin>: p1, p2..p4` drops those things, or `into <bin>: 12` drops the next 12 left. The block works out the count of each bin, the leftover in the inventory and a running total, and draws them: every thing has one place in the inventory and one reserved slot in its bin, so nothing moves between steps. A narrow screen stacks the bins.

```animation
title: Library returns | one trolley run
bins: Returned books | books
items b1..b9: Atlas; Birds; Cooking; Dunes; Engines; Fungi; Gardens; Harbours; Insects
bin job s "Science": shelves 500 to 599
bin store r "Reference": stays in the building
bin ops h "Home": goes back to a branch
@step Science: Natural history goes to the science shelves.
into s: b2, b4, b6, b9
@step Reference: Two heavy books stay in the building.
into r: b1, b5
@step Branch: Three go back to a branch.
into h: b3, b7, b8
@step Done: Every book has a bin; the inventory is empty.
```

The same block with many unnamed things: each square is one thing, the counts do the talking.

```animation
title: Seed packets | 60 packets, sorted by season
bins: Packets by season | packets
items 60: packet
bin job a "Spring": sow in March
bin store b "Summer": sow in June
bin ops c "Autumn": sow in September
@step Spring: The first batch is spring seed.
into a: 24
@step Summer: Then summer seed.
into b: 20
@step Autumn: Twelve go to autumn; four are left over.
into c: 12
```

A thing can drop again in a later step: it **moves** to another bin, and its old place stays as a dashed outline. `show c` in step 2 makes bin c appear there (its place is reserved from the start); `light c: words` lights a bin with a note in it. `ledger: Photo | Album` (or `... | Album from 0` to number the bins from 0) adds a list of every thing with the number of its bin in each step; a move reads `1 → 3` in the warning tone. A long label wraps inside its chip; it is never cut. `inventory: off` drops the inventory frame when everything is binned in step 1.

```animation
title: Photo albums | nine photos, re-sorted
bins: Albums | photos
items p1..p9: Beach · sunny; Beach · dusk; Hike · summit; Hike · lake; City · night; City · market; Beach · kite; Hike · camp; City · bridge
bin job a "Album 1": the first sort
bin store b "Album 2": the first sort
bin ops c "Album 3": added in step 2
ledger: Photo | Album
inventory: off
@step Two albums: Nine photos sit in two albums.
into a: p1, p2, p7, p3, p4
into b: p5, p6, p8, p9
@step Three albums: A third album appears and four photos move to it.
show c
light c: four photos move here
into c: p3, p4, p8, p9
```

## Animation: dense points with clear labels

A phone keeps the planned dot pitch and clears marker strokes behind caption words. Fill changes only paint.

```animation
title: Receiver pulses | points stay in place
time: -150..212 | seconds
ruler: below
row labels: beside
ticks: -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180, 210
row server receiver "Receiver": _ -150..-148 [dot]; _ -135..-133 [dot]; _ -120..-118 [dot]; _ -105..-103 [dot]; _ -90..-88 [dot]; _ -75..-73 [dot]; _ -60..-58 [dot]; _ -45..-43 [dot]; _ -30..-28 [dot]; _ -15..-13 [dot]; _ 0..2 [dot]; _ 15..17 [dot]; _ 30..32 [dot]; _ 45..47 [dot] @2; _ 60..62 [dot] @2; _ 75..77 [dot] @2; _ 90..92 [dot] @2; _ 105..107 [dot] @2; _ 120..122 [dot] @2; _ 135..137 [dot] @2; _ 150..152 [dot] @2; _ 165..167 [dot] @2; _ 180..182 [dot] @2; _ 195..197 [dot] @2; _ 210..212 [dot] @2
row job storage "Storage": received 36..38 [dot] [plain]
at 37 [solid]: checkpoint
@step Receive: The first points appear.
@step Fill: Solid points retain the same centres.
keep fill receiver
keep span receiver -150..2 [line] [plain]: one range caption
@step Reset: The open paint returns.
off receiver
```

## Animation: boxed headers with independent rows

Each tick header is a band. Independent row ranges reveal in place without an extra header body row.

```animation
title: Numbered shifts | boxed tick headers
time: 840..872
cells: 1 | headers
row job draft "draft": +x 840..848 @2; x 848..869 @3 [warn]; x 869..872 @4 [good]
row server copy "copy": +x 840..848 @2; x 848..869 @3 [warn]; x 869..872 @4 [good]
row job archive "archive": +x 840..848 @2; x 848..869 @3 [warn]; x 869..872 @4 [good]
@step Wait: The fixed header shows the planned domain; the rows keep their places, empty.
@step Eight: Each row shows eight cells.
@step Continue: The next interval appears.
@step Finish: The final interval appears.
```

## Animation: keyed cell captions below markers

Words too wide for a phone cell keep a numbered key and a packed caption row. Marker formulas sit below their lines, with fixed positions across steps.

```animation
title: Parcel receipts | complete words in a short grid
time: 0..7 | shifts
cells: 1
ticks: 0, 1, 2, 3, 4, 5, 6, 7
row job draft "Draft": +operators 0..4; +payload 4..7 @3
row server receiver "Receiver": +save, payload 0..2 @2; +to two operators 2..7 @3
row job archive "Archive": +receipt 0..2; +archived, payload 2..4 @2; _ 4..7 @3
@step Begin: The first entries keep their places.
keep at 2 [accent] [below]: check = shift 2
@step Copy: The receiver records the parcel.
@step Finish: Every full word remains readable.
keep at 4 [bad] [below]: switch = shift 4
```

## Animation: compact desktop tick headers

Dense numeric tick headers share a compact strip. Longer desktop row labels have room beside the cells; formulas remain below their lines.

```animation
title: Parcel holders | a dense tick grid
panels
time: 840..872 | ticks per parcel
cells: 1 | headers
row job old "parcel 7 · old keeper": _ 840..872
row server next "parcel 32 · new keeper": _ 840..872
row job receiver "receiver": _ 840..872
@step Begin: Half of parcel 7's pieces are leaving its old holder.
units Stored pieces | one square per parcel
  job 16: kept 8, leaving 8
  j, parcel 7: 8 kept, 8 leaving.
@step Change: The leaving pieces are gone; the summary keeps its place.
units Stored pieces | one square per parcel
  job 16: kept 8, gone 8
  j, parcel 7: 8 kept, 8 gone.
foot: 8 of 16 pieces stay.
keep at 848 [below]: previousTick
keep at 870 [bad] [below]: currentTick
```
