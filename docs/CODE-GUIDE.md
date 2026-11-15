# MARVIN code guide: what it is built from and how it fits together

MARVIN = **M**ars **A**daptive **R**outing and **V**isual **I**nformation **N**etwork. A Jezero Crater mission planner for a first human walk.

## 1. The shape of it
- **No framework, no bundler.** Plain HTML + CSS + JavaScript ES modules in `dist/`. The browser loads the files as they are. This keeps it fast to host, easy to inspect, and hard to break.
- **One tiny Node server** (`scripts/serve.mjs`, no npm packages) serves `dist/` and one API route, `/api/capcom`, which holds the Anthropic key so the browser never sees it. It also provides `/healthz`, gzip, ETag and Range.
- **Python scripts** (`scripts/*.py`) were used offline to prepare data (terrain grid, colour map, globe) and to run/evaluate the terrain model. They are not needed at run time.
- **Tests:** about 30 Node test files (`npm test`), a Playwright browser smoke test (119 checks), and an emulated-Quest VR test.

## 2. What each technology is used for
| Piece | Used for | Where |
|---|---|---|
| JavaScript (ES modules) | the whole app | `dist/*.js` |
| Canvas 2D | the 2D map, minimap, elevation profile | `app.js`, `minimap.js` |
| Three.js (vendored) | the 3D terrain (DEM mesh), astronaut, route, VR | `dem3d.js`, `vendor/` |
| WebXR (via Three.js) | Enter VR, controllers, teleport, panels | `dem3d.js` (VR block), `vr.js` for panorama VR |
| ArcGIS Maps SDK 4.34 (Esri, CDN) | the 3D Mars globe and the intro zoom | `globe.js`, `terrain.html`, `experience.js` |
| ONNX Runtime Web (vendored, WASM) | runs our trained terrain model in the browser | `terrain-live.js`, `vendor/ort/` |
| SegFormer-B0 (NVIDIA mit-b0 encoder), fine-tuned on AI4Mars | the terrain AI: loose ground vs rock | `assets/models/` |
| Anthropic Claude API | live CAPCOM answers, via the server | `scripts/capcom-api.mjs`, `capcom.js` |
| Lottie (vendored) | optional animation slots (empty-state slot uses a GIF) | `media-slots.js` |
| Docker + Railway | hosting | `Dockerfile`, `railway.json` |
| Playwright, IWER (test only) | browser and VR emulation tests | `scripts/browser-*.py` |

## 3. Data
- **Elevation:** a 20 m CTX DEM of Jezero (Mangold et al. 2021), packed into `assets/terrain.json` (450 x 474 cells, slope and detrended heights, plus a fitted plane for absolute elevation).
- **Imagery:** FU Berlin colour map and HiRISE detail for Jezero; Viking colour mosaic for the globe; MOLA relief as context.
- **Rover data:** Perseverance traverse, waypoints and 29 Mastcam-Z panoramas (ASU). The traverse is a map layer and a source of stops. **It is not used to compute routes.**
- **Archives linked but not processed numerically:** THEMIS, CRISM, MEDA, PLACES, ODE, PDS and Mars 2020 instrument archives. Say "context and links" for these, not "used in routing".
- **Models and research:** Minetti 2002 (walking energy), Tobler (hiking speed), AI4Mars (NASA/JPL labels) for training.

## 4. How a route is found (the core idea)
Files: `route-cost.js`, `routing.js`, `route-reasons.js`.
1. The 20 m grid is treated as a graph (each cell connects to 16 neighbours).
2. Cost of one step = distance x (effort + time + a penalty for steep ground, side-slope and roughness), with weights per style (Balanced, Least effort, Least time outside, Widest slope margin).
   - effort: Minetti metabolic cost (Earth gravity baseline)
   - time: Tobler hiking speed
   - slope margin: grows sharply as slope approaches your limit
3. Steps steeper than your slope limit, onto no-data, or on blocked ground are forbidden.
4. Dijkstra (binary heap) finds the cheapest path. Stops are chosen greedily by value per unit of walking cost, then checked so the walk home fits the time budget with a 20% reserve.
5. `route-reasons.js` compares every leg with its straight line and explains each real turn by what lies 150 m ahead. All sentences are computed from the route and the DEM, never invented.

Honest limits: 20 m DEM cannot see rocks or sand; effort is Earth gravity; the slope limit is a planning assumption, not a suit or rover spec.

## 5. Terrain AI
Files: `terrain-live.js`, `assets/models/`, `scripts/run_terrain_model.py`, `docs/TERRAIN-AI.md`, `docs/Marvin_terrain_training.ipynb`.
- SegFormer-B0 fine-tuned by us on AI4Mars labels. On the AI4Mars held-out test set mean IoU is 0.833 (four classes; big rock is the weakest at 0.458).
- On **Jezero Mastcam-Z panoramas** our own blind hand check scored 50% on four classes and 81% on the merged loose-ground vs rock split. The app therefore shows two groups, not four, and labels it as an estimate that tends to under-report rock.
- It runs in the browser (ONNX Runtime Web), so no server and no upload. It never sets route safety.

## 6. Other modules
- `walk-sim.js`, `simulator-ui.js`: the walking astronaut, hazard drills, abort-to-base, blocked-path replanning, science log.
- `capcom.js`, `capcom-tools.js`: CAPCOM. Scripted answers from mission facts, or live Claude with tool calls (set view, explain, etc.) when the server has a key.
- `route-notes.js`, `route-notes-ui.js`: numbered map popups with tags (Traversability, Radiation, Distance and time, Terrain AI) plus the "why".
- `dem3d.js`: 3D terrain, route tube, astronaut; VR block with eye-height rig, walk-where-you-look, teleport, follow-the-astronaut, wrist HUD, EXIT button, and a 360 ring of panels built from the page text.
- `experience.js`, `globe.js`: the cinematic intro and Mars globe.
- `marswalk-conditions.js`: modeled radiation/conditions reference (not a Jezero measurement, not a routing input).

## 7. Run, test, deploy
- Run: `node scripts/serve.mjs` then open http://localhost:8123 (or `Run-Marvin.bat`).
- Test and package: `npm run build` (tests, then rebuilds `dist/downloads/Marvin-project.zip`).
- Deploy: see `docs/DEPLOY-RAILWAY.md`. Variables: `ANTHROPIC_API_KEY`, `TRUST_PROXY=1`, optional `CAPCOM_MAX_PER_MIN`.

## 8. Naming note
Internal identifiers still say "marswalk" (saved-settings keys, message names, `marswalk_terrain.onnx`) on purpose, so saved plans and the model keep working.
