# VR

Two VR modes (WebXR, tested on Meta Quest Browser targets; emulated Quest in CI-style tests, **not yet on a physical headset**):

1. **Panorama VR** (existing): stand inside a rover panorama.
2. **Jezero in VR** (DEM 3D view, "Enter VR"): you stand on the 20 m elevation model at eye height with the terrain all around you, route and stops as beacons.
   - Trigger: teleport where the ray lands. Left stick: walk (click = fast). Right stick: snap turn. A: jump to next stop. B: ride along with the simulated walk / go free.
   - A wrist panel on the left controller shows the next stop, distance, compass bearing, slope underfoot and the route's "why this way" reason.

Honest limits: a browser cannot show the normal page inside a headset, so the site's panels are replaced by that in-world panel. At eye height a 20 m DEM looks smooth, not rocky; textures are the CTX/HiRISE colour, so there are no individual rocks. Needs https and a WebXR browser.
Tests: `scripts/browser-vr.py` (IWER emulator, MIT, in scripts/fixtures) and VR math in `scripts/test-dem3d.mjs`.
