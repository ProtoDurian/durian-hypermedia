Example forecasts written in the source, not current conditions; nothing is fetched. The units menu on the part switches °C and °F, km/h, mph, m/s and knots, mm and inches, hPa and inHg, and your choice is remembered in this browser.

```weather place="San Francisco" unit=c tz=America/Los_Angeles
2026-11-22 sun 18/11 rain=0% wind=12km/h pressure=1021hPa
2026-11-23 partly 16/10 rain=10% wind=15km/h pressure=1018hPa
2026-11-24 rain 14/9 rain=80% wind=30km/h precip=6mm pressure=1004hPa
2026-11-25 storm 13/8 rain=95% wind=45km/h precip=14mm pressure=996hPa note="Ferry may stop"
2026-11-26 cloud 12/7 rain=30% wind=20km/h precip=1mm pressure=1009hPa
```

Hours work the same way, with one temperature, here written in °F and mph.

```weather place="Oakland" unit=f wind=mph tz=America/Los_Angeles
2026-11-24 06:00 fog 48 rain=5% wind=4mph
2026-11-24 09:00 cloud 52 rain=20% wind=8mph
2026-11-24 12:00 drizzle 57 rain=60% wind=11mph
2026-11-24 15:00 rain 59 rain=85% wind=14mph
2026-11-24 18:00 rain 55 rain=70% wind=12mph
2026-11-24 21:00 cloud 51 rain=25% wind=7mph
```

A different example forecast with `static`: drawn whole in the fence's unit, with no menu.

```weather static place="Sydney" title="Example spring forecast" unit=c wind=kmh
2026-11-22 sun 24/17 rain=0% wind=14km/h
2026-11-23 partly 22/16 rain=20% wind=18km/h
2026-11-24 rain 20/15 rain=70% wind=22km/h note="Showers later"
```
