One line per event, oldest first; an indented line is a detail. A year, a month or a day.

```timeline title="A release plan"
2026-05-04 Design review [c1]
  Scope and owners agreed
2026-09 First release [c2]
2026-11-21 Old drawing code removed [c5]
  New drawn parts take their place
2026-11-23 Version 2 ships [good] note="the big one"
```

With `dir=across` a wide screen lays it out sideways; a phone is always top to bottom. With steps, the events come in one group at a time.

```timeline title="A build-up" dir=across
2026 The idea
@step The first half of the year.
2026-03 A prototype
2026-06 A first user
@step The second half.
2026-09 First release [c2]
2026-12 Version 2 [good]
```
