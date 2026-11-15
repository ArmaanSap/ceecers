## Terrain AI runs live in the browser
- Our ONNX model now runs in the browser with onnxruntime-web (vendored in `dist/vendor/ort`, WASM, one thread, loaded only when used). Button in the panorama viewer: scans the open panorama tile by tile, the overlay fills in, and the result is compared with the offline Python run (99% pixel agreement, about 3 to 5 s). Same tiling, Hanning blending and ground mask as `scripts/run_terrain_model.py`. Code: `terrain-live.js`, test `scripts/test-terrain-live.mjs`.
- Terrain AI tag in route popups for stops near panoramas; CAPCOM's route brief adds the ground mix along the route; About page has a model card with measured numbers and limits and a "Run it live" button.
- Note: `run_terrain_model.py` writes the four-class overlay colours; the shipped overlays and `summary.json` were merged to two groups afterwards, so re-running the script needs the same merge step.

## Route notes on the map, nearby stops fixed
- Fixed: chosen stops within 25 m of each other (or on the same track node) were dropped as duplicates, so several nearby picks showed "did not fit". They now merge into one stop that keeps every task and shows "also here". Regression test: `scripts/test-nearby-stops.mjs`.
- New: numbered markers on the 2D map at stop arrivals, verified turns/detours and the steepest ground. Clicking one opens a popup with distance, time and short why-tags: Traversability (DEM slope, rover-driven track vs spur), Radiation (reference rate x time outside, labelled as not a Jezero measurement), Distance & time, Views, Reserve. "Explain with CAPCOM" asks live Claude, or says it is offline and keeps the measured facts; either way it is logged in the CAPCOM history. Code: `route-notes.js`, `route-notes-ui.js`.

## Terrain AI hand check, two-group display
- Blind hand check on our Mastcam-Z panoramas: 4-class accuracy 50%, loose-vs-rock 81% (74 points, one labeller). The 4-way split was unreliable, so the overlay, legend, Live views bars, CAPCOM and `describe_terrain` now report two groups: loose ground (soil+sand) and rock (bedrock+big rock), with the under-reports-rock caveat. Overlays recoloured; raw shares kept in `summary.json`. Tool: `tools/terrain-eval/`.

## Terrain AI (our trained model)
- Added a SegFormer-B0 fine-tuned by the team on NASA AI4Mars (held-out mIoU 0.833; big rock IoU 0.458). Run offline on all 29 real panoramas; see `docs/TERRAIN-AI.md`.
- Panorama viewer: Terrain AI overlay toggle, class shares and an honest model note. Live views: a composition bar per panorama. CAPCOM: answers terrain questions and has a `describe_terrain` tool.
- Honest limits: measured on Mastcam-Z only by a small hand check (see below); sky, rover and no-data are masked with a heuristic; not a safety rating and not used by the route planner.

## 2D default, M.A.R.V.I.N. welcome, Live views
- Arrival lands on the 2D map again; the 3D crater button pulses with a "SEE THE CRATER IN 3D" pointer until it is used.
- CAPCOM opens with a welcome (M.A.R.V.I.N. is the project's name for the assistant; edit `WELCOME` in `simulator-ui.js` to change the wording or the expansion). Alerts, route briefings and the welcome also pop up as notifications and stay in the CAPCOM history. Alerts: OFF silences the popups.
- CAPCOM input is a larger box above the Send button (Enter sends, Shift+Enter adds a line).
- Live views (left panel): the 4 nearest real Mastcam-Z panoramas with thumbnails, distance and compass direction from the astronaut (from base when not walking); click to open. They are historical images, not a live camera.
- Fixed: unnamed points all got the same name ("Name this point"), and routing, the plan panel and CAPCOM find stops by name, so several points confused them. Names are now unique when added, renamed or loaded.

## 3D-first arrival, CAPCOM tools, effort model
- Arrival is now: globe zoom into Jezero, then the globe pane pans out (fades) over the 3D crater view already in place, and the interface slides in. No second flight. DEM 3D is the default view; the 2D map is one button away.
- You can pick stops in 3D: click the terrain or a cyan panorama pin to open the same stop picker as the 2D map.
- Removed: DEM-check line, traversability class bar and reserve gauge in the plan panel; the walker/rover animation slot. CAPCOM now has a pixel-art avatar (`assets/media/capcom.svg`).
- CAPCOM can act (live Claude only): assess_route, list_alternates, preview_alternate, replan, open_panorama, set_view, abort_to_base. Tool inputs are validated twice (page and server), the key stays in the server, and a failed follow-up reports honestly what was done.
- New `effort-model.js`: walking energy from the published Minetti 2002 gradient polynomial (Earth gravity, no suit), used by CAPCOM's assess_route.
- New `scripts/validate_dem_slope.mjs`: DEM slope vs rover-recorded grade (r = 0.44, 98.8% of stretches within DEM slope + 3 degrees; in-sample), stored in terrain.json.
- Tried and dropped: a learned "rover-likeness" model (logistic regression on DEM shape features, spatial cross-validation AUC about 0.57, close to chance). Terrain shape from a 20 m DEM does not predict where the rover chose to drive, so it was not shipped.

## 2D-first, calmer UI
- Arrival: full-globe zoom (Esri scene) then it fades onto the 2D map, which is the main view. DEM 3D, 3D terrain and Panorama are optional buttons.
- Removed the relief slider: the 3D view is true scale, using absolute elevation fitted to the rover's recorded elevations (2.3 m RMS, see docs/DATA-SOURCES.md).
- DEM 3D controls moved into a dock below the map. Astronaut now shows in Orbit (scaled to stay visible) and Follow.
- Cassette, VHS display, Walk-this-route button, 4-number metrics strip and map caption removed; Panorama button opens the panorama viewer at the nearest view. Elevation profile moved into the plan panel.
- Lottie/picture slots (`data-slot`, `assets/media/manifest.json`, README there) with dashed placeholders.

## CAPCOM backend, two-act intro, leaner UI
- Claude key moved to the server (`scripts/capcom-api.mjs`, served by `scripts/serve.mjs`); the browser key field and direct API call were removed. Tests: `test-capcom-api.mjs`.
- Intro restored to the full-globe zoom (Esri), then cross-fades into the DEM crater view. If Esri is unavailable it skips straight to the DEM. Esri stays available as the "3D terrain" button.
- Removed the title strip and soundtrack bar; sound, export and credits are in Options.
- Route notes, alternates reasons and alerts are voiced by CAPCOM; sidebar text shortened.

## DEM 3D becomes the main 3D view
- The arrival intro now flies down into the DEM 3D orbit view (the Esri scene is no longer preloaded; it is an optional button).
- Only one big view at a time: DEM 3D, Esri 3D terrain and the 2D map switch cleanly (buttons, 2D map, Escape). DEM 3D no longer traps you.
- Removed the Color, B&W, CTX, Elevation and Thermal tabs; the 2D map shows one colour base layer.
- **Four alternate routes** for the same stops, planned on the DEM slope grid (`dem-path.js`, `route-options.js`): direct, gentlest, cautious (<=10 deg), and a reordered/balanced option. Each has numbers and a "why it was not chosen" built only from measured differences (distance, time, steepest and mean slope, photographed locations passed, metres off the recorded rover track). They are previewable in 2D and 3D, labelled modelled and not rover-verified.
- Notifications are merged into CAPCOM (no popup stack), shown only for warnings and criticals, at most one warning per 4 mission minutes, with an Alerts ON/OFF toggle. Steep-grade warnings trigger once per 400 m; the incline caution was removed. Drills always show.
- Follow camera in DEM 3D shows an astronaut model with a walking cycle.
- Abort now takes the fastest way home: a direct line when the DEM verifies it (max 20 deg, inside the DEM) and it is clearly shorter, otherwise the shortest recorded-track path. CAPCOM states which and why.
- Tests: `test-route-options.mjs`, fastest-abort cases in `test-simulator.mjs`, and smoke checks for all of the above.

## DEM 3D view
- New **DEM 3D** button: the project's own 20 m CTX DEM rendered as a 3D mesh (Three.js r160, vendored in `dist/vendor/`, MIT), no Esri or network needed.
- Route draped on the ground, stop poles with labels, Martian Base marker, and the walker (Orbit / Follow / Rover eye cameras). Surface can be imagery, hillshade or traversability class; relief slider 1-6x.
- Heights are relative (the DEM is detrended), so relief is true but absolute elevation is not shown. Imagery covers the central area; the DEM edge ring is shaded only.
- Tests: `scripts/test-dem3d.mjs` (geometry, shading, draping) and new browser-smoke checks.

## Mission list, retro UI, Claude-powered CAPCOM
- Removed the "where to" picker. Click a major POI, then a task in its bubble; the task joins the mission list. "Make route" is enabled with one stop.
- Traversability classes I-VIII (slope-only) with grounded explanation, per-value sources, slope-band and region polygon layers, and a route class bar.
- Pixel fonts, square corners, louder music (volume slider).
- CAPCOM can use your Anthropic API key (stored in this browser only, sent only to api.anthropic.com). Answers are limited to mission facts; falls back to scripted on any failure.

# Project changes

## November 14, 2026 · DEM, layout, mission plan, CAPCOM
- **DEM:** processed the 20 m detrended CTX DEM (`assets/terrain.json`, `hazard_polygons.geojson`, `terrain_summary.json`). Slope router now runs in DEM mode: routes are slope-checked (`checkRouteSlope`), off-track spurs are A* slope-routed, steep ground is an overlay in the 2D map and the 3D scene. Detrended heights are used for slope only, never shown as absolute elevation.
- **Layout:** one slim transport bar (play, restart, abort, latching rate keys, scrubber, clock, ⚙ Options drawer for camera and drills). Metrics are one line; the elevation profile is a thin strip with a live position marker. F-key row removed; itinerary text, science log and notification history fold away.
- **Mission plan (right):** live stop list with ETAs, task switches synced with the popup, ★/➜ marks, reserve gauge and current-stop highlight; click a row to fly the 2D/3D view to it. Route notes and "why the path looks like this" live here.
- **Minimap:** drag it anywhere (mouse, touch or arrow keys); position is remembered; double-click or Home resets.
- **CAPCOM:** scripted in-character briefing at each stop, Q&A box, and an end-of-mission debrief, all grounded in mission data and labelled SCRIPTED. Optional live AI through `scripts/capcom-proxy.mjs` (key stays on your machine; page falls back to scripted on any failure). Untested against a live key.
- `docs/DEMO.md`: 90-second demo path.

## November 14, 2026 · Stops, region tasks, explanations, hardware skin
- Walk pauses at every stop and shows a large printout: the task, what to look for, steps, how to record it and directions. Continue resumes.
- Each region has its own tasks (`dist/region-tasks.js`); the Perseverance sample handoff exists only in the region of the base. Instruction details are re-drawn every time; the topic never changes.
- Priority (★) and Visit (➜) stop picker; Visit stops need no science task.
- "Why the path looks like this": `dist/route-explain.js` checks detours, sharp turns, retracing and spurs against the route graph; the walk raises a note when it reaches each one.
- At most two alerts on screen; the oldest fades when a third arrives; all fade after a quiet spell. The feed panel keeps the full history.
- Amber-and-phosphor hardware skin (`hardware.css`): metal bezel, keycaps, toggle switches, latching rate keys, LEDs, WebAudio key clicks (`hardware.js`, mute switch in the soundtrack bar).

## November 14, 2026 · Core simulator and dataterm theme
- Pinned-point report is now a bubble over the map, anchored beside the clicked spot (3D scene and 2D map). All notifications, including app messages, now appear in a stack at the top of the screen; history is kept in a collapsed panel.
- Simpler layout and softer, more human styling: rounded hardware, warm phosphor, an astronaut figure as the walker and on the minimap. Retro motion: CRT warm-up / switch-off for bubbles and alerts, VHS on-screen display (PLAY, PAUSE, RETURN, timecode) with tracking glitches, scanlines, and a cassette whose reels turn at the playback rate. All motion is disabled under reduced-motion.
- Fix: the dataterm chamfer `clip-path` on the map frame cropped the full-screen arrival pane. It is now removed while the arrival plays, so the scene fills the screen before the UI slides in.
- Walking camera now defaults to a fixed top-down view of the whole route (north up, like the 2D map) with the astronaut and trail moving over it. Added Top-down follow; chase, first, third and free remain.
- Added the walking simulator: Start / pause / resume / restart / abort-and-return, playback 1x–50x (1x = 1 mission minute per second, independent of the plan's walking speed), scrub bar, and five camera modes (follow, free, first person, third person, overhead). Runs in the Esri 3D scene via a validated same-origin `marswalk-walker` message; trail and walker marker are drawn on their own layer.
- Added click-anywhere points: click the 3D terrain (or the 2D map) for a location report (coordinates, recorded elevation, distance to rover path and panorama, distance from base, DEM slope when available), rule-based experiment suggestions with reasons, and save / rename / delete in browser storage. Saved points can be ticked as mission waypoints; off-corridor spurs are added to distance and time and labelled slope-checked or not.
- Added the notification feed (terrain, radiation, atmosphere, science, discovery, safety) with severity levels, source and a provenance label (real historical / modeled / simulated drill / derived). Panorama discovery is de-duplicated and offers open, VR and keep-walking actions. Safety drills are explicitly simulated.
- Added the mission science log, completion summary, JSON export and printable log. The radiation figure is a labelled model scaled from Curiosity's Gale Crater average, not a Jezero or suit-dose prediction.
- Plugged in the slope pathfinding module (`pathfinding.mjs`, `slope-router.js`). Without `assets/terrain.json` it stays in labelled placeholder mode; see `docs/PATHFINDING.md`.
- Added the dataterm theme (`dataterm.css`: Ruggon-style tile menu and F1–F5 key row, cyberpunk HUD palette, chamfered panels, route minimap). Remove its `<link>` from `index.html` to return to the previous look.
- Added `Run-Marvin.bat` (Windows), `Run-Marvin.command`, `scripts/serve.mjs`, `scripts/browser-smoke.py`, and tests `test-simulator`, `test-terrain-walker`, `test-pathfinding`.
- Not verified here: the Esri 3D scene itself (needs internet and a GPU), real Jezero DEM routing, Quest 2 hardware.

## November 14, 2026
- Added reproducible project ZIP, source hashes, hosted current-download link, local watch mode, build verification and Git pre-commit archive refresh.
- Added route-method and dataset documentation plus portable preparation-script paths.
- Restored and completed the previously unpublished larger map, global MOLA context, All Mars / Return to Jezero controls and expanded map layout after workspace cleanup.

## November 13, 2026
- Created Jezero mission planner, NASA data snapshots, bounded route selection, itinerary, elevation profile, simulation and mission export.
- Added connected panorama walkthrough, panorama-focused route preference and field-atlas styling.
- Added native WebXR panorama viewing and Quest-oriented controller controls. Physical headset verification remains outstanding.

## 2026-11-14 · Orbital terminal
- CRT power-on screen with skip and reduced-motion support; orbit spin and flight into Jezero.
- Native WebGL 3D Mars using NASA Viking color texture; drag/keyboard rotation and zoom-out transition from the regional map.
- KSP soundtrack track Frozen Star with explicit playback controls, volume and CC BY attribution.
- VR helmet corner guides, acquisition animation and archive information panel during image loads.
- Added globe projection checks; regenerated complete project ZIP. Physical headset and browser GPU visual verification remain outstanding.

## 2026-11-14 · Required arrival and terminal theme
- Removed intro skipping and music opt-in/player switches; Power on starts the soundtrack.
- Reverse CRT point/line/screen effect, longer orbital approach, map docking and side-panel entrance.
- Consistent retrofuturistic palette, instrument panels and typography across every page.
- Required-intro fallback tests cover blocked audio, missing WebGL, Escape and UI unlock.
- Reduced motion follows the same sequence with fades. Full project ZIP refreshed.

## 2026-11-14 · Color map and Martian Base
- Default to the provider's HRSC-colorized HiRISE/CTX Jezero mosaic; retain B&W as an optional layer.
- Automatic orbital arrival replaces Power on/CRT boot; longer map blend and first-interaction audio fallback.
- One fictional Martian Base departure and return point; saved alternate starts ignored; exports include base provenance.
- Shorter interface text; metadata, equipment/simulation and soundtrack credits collapsed.
- Fixed-base round-trip and automatic-intro tests passed; complete ZIP refreshed.

## 2026-11-14 · Region-first mission picker
- Restored automatic CRT startup without a Power on button.
- Replaced left settings bar with a single right-side region/task picker, confirmation prompts and simple symbols.
- Science candidates are restricted to the confirmed region; routes still depart from and return to Martian Base.
- Added map POI dot buttons and hover/focus/tap bubbles with descriptions and panorama actions.
- Region routing checks pass for all three groups; project ZIP refreshed. Browser visual and physical headset QA remain outstanding.

## 2026-11-14 · Esri terrain and alternatives
- Added native ArcGIS Mars 3D terrain mode with selected-route/POI overlay, globe navigation, optional HiRISE imagery and 2D fallback.
- Added explicit alternative-route approval with changed limits and omitted experiments listed before application.
- Removed rover-traverse, grid and footprint line overlays from the planning map.
- Alternative-route checks passed. Browser GPU and live 3D interaction still need visual verification. ZIP refreshed.

## 2026-11-14 · Default 3D mission view
- 3D terrain preloads and opens by default after the automatic arrival.
- 3D POIs expose science-task context and panorama actions; region selection updates the scene camera.
- Added concise mission-data/conditions status and labeled optional 2D science layers.
- Existing automated checks pass; live browser/3D and headset verification remain outstanding. ZIP refreshed.

## 2026-11-14 · Continuous scene / camera correction
- Removed the 2D arrival snapshot and separate globe renderer from the startup; one Esri iframe stays live through the flight and docking.
- Camera frames the full POI extent, then refits after docking. HiRISE enabled by default; POIs raised above ground with larger 3D icons.
- Added a hypothetical Sapphire Canyon sample handoff at Martian Base, once-per-mission handling time, exported provenance and reserve-aware alternatives.
- Added scene-adapter, camera-framing and handoff regression checks. Browser GPU rendering remains unverified. ZIP refreshed.

## 2026-11-14 · Audio level
- Increased default music volume from 30% to 50%; refreshed the project ZIP.

## Pathfinding revamp
- New DEM cost router (`route-cost.js`) replaces rover-track Dijkstra for routing; reasons in `route-reasons.js`; Route style selector.
- Blocking and alternative-route search work with grid routes.
- Intro fallback glides into the 2D map instead of fading.

## VR + pixel rover
- DEM 3D view gets "Enter VR": stand on Jezero, walk/teleport, wrist HUD with route reasons.
- Pixel-art rover GIF in the empty mission-list slot.

## Railway readiness
- serve.mjs: PORT/0.0.0.0, /healthz, gzip, ETag/304, Range, safer paths, graceful shutdown.
- CAPCOM: per-visitor limits behind a proxy, whole-server cap.
- Dockerfile, railway.json, .dockerignore, docs/DEPLOY-RAILWAY.md.

## Rebrand: MARVIN
- Marswalk is now MARVIN (Mars Astronaut Route Visualization Intelligence Navigator). Header, intro card, About, footer, exports, downloads (`Marvin-project.zip`), launchers (`Run-Marvin.*`), docs.
- Internal identifiers (localStorage keys, postMessage types, `marswalk_terrain.onnx`) keep the old name on purpose so saved plans and the model keep working.

## VR exit and 360 panels
- Grip exits VR; floating Enter VR button when a headset is detected; ring of site panels around you.

## VR fixes
- Walking follows head direction in world space (was ignoring the rig turn); thin route line and raised eye height; astronaut visible and followed; grip exit also polled; red EXIT VR button on the wrist panel.
