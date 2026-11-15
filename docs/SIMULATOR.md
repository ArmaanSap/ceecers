# Simulator, points, feed and log

## Time model
- **Walking speed** (1, 2 or 3 km/h) is a plan setting. It fixes the mission timeline: walking time plus science minutes.
- **Playback** (1x, 2x, 5x, 10x, 20x, 50x) only changes how fast that timeline is shown. 1x = 1 mission minute per real second. Changing playback never changes the plan.
- The position is simulated. Mars has no GPS.

## Camera modes (Esri 3D scene)
follow (behind and above), free (the viewer's own camera is never touched), first person (1.7 m eye height), third person, overhead. Elevation uses the recorded rover elevation at the walker's position.

## Abort and return
Abort keeps the walker where it is and plans a return: a straight, unmodelled hop to the nearest recorded rover vertex, then the shortest recorded path to the base. Flagged blocked segments are avoided. The summary says the mission was aborted.

## Click-anywhere points
Information shown is labelled by origin: recorded traverse data (elevation within 200 m of a rover vertex, distance to rover path, nearest panorama), derived (distance from base) and DEM-derived (slope, only when `assets/terrain.json` is present). Where nothing is known it says "Not available". Suggested experiments come from simple rules (region, nearest panorama, slope, distance from rover data), each with its reason. They are proposals, not detections. Points are stored in this browser's localStorage (max 40). A point ticked as a waypoint is prioritised by the planner. If it is off the recorded rover network, an out-and-back spur is added and labelled as slope-checked (DEM loaded) or **slope NOT modelled** (placeholder).

## Notifications
Severity: info, caution, warning, critical. Provenance: `historical` (real recorded observation), `modeled` (derived or scaled from cited data), `simulated` (drill, no real basis), `derived` (computed from the plan or route). Terrain alerts use recorded rover elevations over about 30 m against the 20 degree planning limit. There is no live weather, dust or radiation feed.

## Science log and summary
Entries are timestamped in mission minutes. Tasks completed are whatever the user ticks in the itinerary. The estimated radiation figure scales Curiosity's Gale Crater average (0.67 mSv/day) over the simulated duration and is labelled modeled.

## Stops, tasks and explanations
- **Arrival popup:** reaching any stop (including base handoff and chosen visit stops) pauses the sim and opens `#taskDialog`. Continue seeks to the end of the science window and resumes.
- **Region tasks:** `region-tasks.js` lists tasks per region (floor / delta / upper). `composeInstructions(id)` picks fresh details (target, step wording, numbers) each call; the cached copy for a stop is reused within one run and re-drawn on restart. Targets are visual search targets only, never claims a mineral is present.
- **Priority / Visit:** priority stops go to the planner's pinned set; visit stops are pinned and get the generic `visit` task if no other task applies.
- **Route explanations:** `route-explain.js` searches the graph for the shorter alternative and states what rules it out (blocked flag, grade limit, gentle preference, no recorded track). Reasons are never guessed.
- **Alerts:** max 2 visible, 14 s idle fade.

## Not covered
Rocks, sand, cross-slopes, suit constraints, communications and real hazards. Not EVA-certified.
