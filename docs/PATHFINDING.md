# Pathfinding (cost router)

Routes are found over the whole 20 m elevation model (`dist/route-cost.js`), **not** along the rover's recorded tracks. The rover traverse is only a map layer and a source of stops; it does not influence the cost.

## Cost of one step (16 neighbours)
`d * (wE*effort + wT*time + 3*(wM*margin + wC*cross + wR*rough)) / (wE+wT)`

| Term | Meaning | Source |
|---|---|---|
| effort | metabolic cost relative to flat | Minetti et al. 2002 (Earth gravity) |
| time | 1 / walking speed on that slope | Tobler hiking function |
| margin | (steepest of path/ground slope / your limit)^3 | planning assumption |
| cross | side-hill slope (lateral / limit)^2 | planning assumption |
| rough | local slope variation, capped | DEM-derived |

Steps steeper than your slope limit, onto no-data, or on blocked ground are forbidden. Route style presets: balanced, least effort, least time outside, widest slope margin. "No grade filter" uses a 35 degree ceiling.

## Stops
Greedy by value per unit of walking cost (effort, time and margin, not distance), then verified so the walk home fits the budget with a 20% reserve.

## Readable reasons (`route-reasons.js`)
Every leg is compared with its straight line (allowed? steeper? costlier?); every real turn is explained by what lies 150 m straight ahead; a method note lists the weights. All sentences are computed, none invented.

## Limits
- 20 m DEM: cannot see rocks, sand or sub-pixel steep spots.
- Effort is an Earth-gravity baseline, not Mars.
- The slope limit is a planning assumption, not a rover or suit specification.
- Savijarvi et al. (downwelling longwave radiation at Jezero) is background only; it is not used numerically in the cost.
- Abort-to-base and the walk simulator still use constant walking speed.
