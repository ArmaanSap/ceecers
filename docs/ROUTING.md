# How routing works

Source of truth: dist/routing.js and its callers in dist/app.js.

1. Load NASA/JPL's historical Perseverance traverse and keep vertices within 77.36–77.48° E, 18.40–18.52° N. Discard coordinates without finite elevation. Thin consecutive points closer than 5 m (except line endpoints), deduplicate rounded positions, and connect successive retained points less than 500 m apart.
2. Add inferred connections between nearby vertices within 10 m. They resolve track overlaps and localization differences, but do not establish physical traversability. Their total distance is reported in the mission and exported JSON.
3. Calculate horizontal great-circle distance with the haversine formula using Mars radius 3,396,190 m. Approximate edge grade is atan2(abs(elevation change), horizontal distance), in degrees. This is track grade, not a detailed surface or cross-slope model.
4. Snap panorama candidates to their nearest graph node; the app retains candidates within 35 m. Locations are approximations from historical rover waypoints. Candidate science tasks are proposed activities, not instrument measurements or confirmed science findings.
5. Run Dijkstra's algorithm with a min-heap for paths between stops. Exclude simulated blocked edges and edges exceeding the selected grade threshold. Edge cost is distance, or distance × (1 + grade/8) for the gentler-grade preference.
6. Build the itinerary greedily. For each possible next stop, test distance already traveled + next leg + return to departure. Test travel time (distance / selected walking speed) + science time against 80% of the mission budget, retaining 20% as reserve. Score eligible stops for selected activities, priority pins and travel cost. Panorama mode rewards previously unseen candidate viewpoints along the outgoing/return paths. Choose the best next stop and repeat.
7. Cap selected stops at 6 normally or 29 in panorama mode; suppress repeat nodes and candidates within 25 m of a selected stop. Append the return leg. Report omitted tasks and prioritized stops that could not fit.
8. Build the panorama walkthrough from views within 35 m of route vertices, sorted by their nearest route position. Show each view once. Gaps are jumps, not continuous photographic coverage.

## What this means

Dijkstra finds a minimum-cost leg in the constructed graph. The greedy whole-mission selection is NOT a guaranteed globally shortest itinerary or maximum-panorama solution. The graph follows rover corridors and inferred joins; it does not compute arbitrary walking paths across terrain from HiRISE images, MOLA colors, lidar point clouds, a numeric DEM, or mineral maps.

It does not currently model sand stability, boulders, local cross-slopes, spacesuit energy/oxygen, radiation, live weather, communications, or astronaut traversability. Obstacle replanning starts again from the chosen departure, not an estimated in-field astronaut position. Global Mars context is for orientation only; the mission network and POIs remain in Jezero.
