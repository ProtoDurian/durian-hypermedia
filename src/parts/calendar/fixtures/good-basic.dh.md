# Example

The host supplies no clock here: Today returns to the authored date. Explore the views, switch calendars and open events. A narrow part starts with three days.

```calendar title="Release week" tz=Europe/London date=2026-11-23 view=week hours=08-18
calendar team "Team" [c2]
2026-11-23 09:00-09:20 Stand-up in team every weekday times=5
2026-11-24 10:00-11:30 Design review @ Studio in team note="Bring the mock-ups"
2026-11-24 10:30-11:00 Review notes in team
2026-11-25 all day Code freeze [warn]
2026-11-26 18:00-19:00 Sydney call tz=Australia/Sydney
```

The static form keeps a complete dated list without controls.

```calendar title="Release checklist" tz=Europe/London date=2026-11-23 static
calendar team "Team" [c2]
2026-11-23 09:00-09:20 Stand-up in team every weekday times=3
2026-11-25 all day Code freeze [warn]
```
