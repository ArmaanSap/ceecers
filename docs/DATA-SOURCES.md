# Data sources and provenance

Snapshot metadata lives in dist/assets/data.json and global-source.json. The route dataset was retrieved during the initial build on November 13, 2026; global context was refreshed during the November 14 release. Individual imagery acquisition times differ. Panorama source links and capture sols are attached to each entry; positionSol is the waypoint used to estimate its location.

- Traverse: https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json
- Rover map and waypoint context: https://science.nasa.gov/mission/mars-2020-perseverance/location-map/
- Mastcam-Z panoramas: https://mastcamz.asu.edu/mastcam-zs-360-panorama-collection/
- NASA Mars Trek imagery/tiles: https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars
- Jezero imagery/terrain: https://astrogeology.usgs.gov/search/map/mars-2020-jezero-crater-landing-site-products
- MOLA: https://pds-geosciences.wustl.edu/missions/mgs/mola.html
- THEMIS: https://pds-geosciences.wustl.edu/missions/odyssey/themis.html
- ODE REST: https://oderest.rsl.wustl.edu/
- PDS API: https://nasa-pds.github.io/pds-api/
- Mars 2020 instruments: https://pds-geosciences.wustl.edu/missions/mars2020/
- CRISM: https://pds-geosciences.wustl.edu/missions/mro/crism.htm
- MEDA: https://atmos.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html
- PLACES: https://pds-geosciences.wustl.edu/missions/mars2020/places.htm
- WebXR reference: https://www.w3.org/TR/webxr/

Local orbital images are prepared mosaics, not the original full-resolution products. MOLA global relief is a low-resolution visual context layer with 2048 × 1024 prepared pixels. Resampling adds no measurement precision. Color-shaded elevation is not natural surface color; THEMIS intensity is not a temperature readout. CRISM footprints indicate product coverage, not confirmed mineral detections.

Chemistry (PIXL, SHERLOC, SuperCam), radar (RIMFAX), weather (MEDA), detailed numerical DEMs and geologic units currently have archive access rather than full scientific processing in the app. Their raw archives are not bundled.

Credits: NASA/JPL-Caltech/University of Arizona/USGS for orbital imagery; NASA/JPL-Caltech/ASU/MSSS for panoramas; NASA/JPL-Caltech for the Mars 2020 traverse; NASA/GSFC and Mars Trek for MOLA context. Consult each source for its full attribution and usage conditions.

## 3D globe
NASA Viking Orbiter / USGS Viking Merged Color Mosaic, hosted by ASU: https://www.mars.asu.edu/data/mdim_color/ . Eight full-resolution tiles were assembled and downsampled to 4096×2048 by `scripts/prepare_globe.py`. Equirectangular, east-positive longitude, −180…180° / −90…90°. The globe shader maps this image to a sphere; lighting is illustrative, not a live Mars day/night forecast. Jezero marker: 77.42° E, 18.46° N. The globe is global context; regional detail switches to the existing HiRISE map. Music attribution is in MUSIC-LICENSE.md and the visible player.

## Default Jezero color map
The bundled 1500×1500 color map comes from the FU Berlin Jezero WebGIS WMS layer `base-hsv`, requested in Mars equirectangular EPSG:49911 over the exact existing bounds [77.36,18.40,77.48,18.52]. Source: https://maps.planet.fu-berlin.de/jezero/ . Dataset processing description: https://www.esa.int/articles/about-us/directorates/science/mars-express/an-interactive-map-to-explore-jezero-crater . HRSC color was pan-sharpened into CTX and HiRISE grayscale imagery by the provider; this is not native full-resolution RGB HiRISE. Credits: ESA/DLR/FU Berlin; NASA/JPL-Caltech/UArizona/USGS. No AI imagery or invented surface colors were added. The exact request is in color-source.json and the reproducible fetch is scripts/prepare_color.py.

Martian Base is a fictional planning label anchored to existing panorama id 17 (Rose River Falls). It is not a NASA facility, identified landing zone, or surveyed astronaut-safe site. Routes still use the same historical rover network.

## Esri Explore Mars terrain integration
Configuration reference: https://github.com/Esri/explore-mars/blob/main/src/utilities/layers.ts (Esri, Apache-2.0 application; our adapter is independently implemented).
- ArcGIS Maps SDK for JavaScript 4.34, CDN https://js.arcgis.com/4.34/ ; governed by Esri SDK terms.
- Elevation: https://astro.arcgis.com/arcgis/rest/services/OnMars/MDEM200M/ImageServer (MOLA/HRSC blended DEM, service title Mars200mDEM; reported approximate horizontal accuracy 100 m, elevation uncertainty at least ±3 m; not local obstacle geometry).
- Global color: ArcGIS item 1efb16809db84f0c892b9b0662dab0c8, https://astro.arcgis.com/arcgis/rest/services/OnMars/MDIM/MapServer . Native global imagery about 231 m/pixel; provider currently labels this service beta.
- Optional HiRISE imagery: ArcGIS item c1c4c750a2154842ae523c984cc14fa5. Imagery detail does not imply equal elevation detail.
- Credits: NASA, ESA, HRSC, Goddard Space Flight Center, USGS Astrogeology Science Center, JPL, Esri. https://explore-mars.esri.com/ . Provider terms: https://links.esri.com/agol_tou . Network services remain remote, with visible attribution; SDK and complete terrain datasets are not redistributed in the ZIP.

## Sapphire Canyon / sample 25
Checked 2026-11-14 against NASA's sample catalog: https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/ . Sapphire Canyon was collected from Cheyava Falls and sealed on July 21, 2024 (sol 1215); current listed carrier is Perseverance. NASA/JPL's September 10, 2025 report describes potential biosignatures requiring further study, not confirmed life: https://www.jpl.nasa.gov/news/nasa-says-mars-rover-discovered-potential-biosignature-last-year/ . The app's transfer procedure and 30-minute duration are proposed planning assumptions. The rendezvous at fictional Martian Base is hypothetical and does not represent the sample's measured current coordinates.

## Elevation in the 3D view
The shipped DEM (`M20_JezeroCrater_CTXDEM_20m_maaz_detrended.tif`, Mangold et al. 2021, CC BY 4.0) is **detrended**: the regional tilt was removed, so its heights are relative. Slope from it is valid.
For the 3D view and elevation readouts we recover absolute elevation with `scripts/fit_elevation.mjs`: a least-squares plane fitted between the DEM and the 17,883 recorded rover elevations in `traverse.json` (z = 0 no-data points excluded). Result: residual 2.3 m RMS (12.3 m with a constant offset only). It is an in-sample fit, so it checks consistency, not independent accuracy. Stored in `terrain.json -> elevFit`.

**Better data to download (not yet used):** the same CaltechData record (https://data.caltech.edu/records/h2xd4-zbd29) also lists three 1 m DEMs, `cenjez_DEM_1m.tif`, `swjez-DEM_1m.tif` and `nf_DEM_1m.tif` (about 200-250 MB each). They are not labelled "detrended" and appear to derive from the HiRISE DEMs, which suggests a MOLA-referenced absolute elevation, but the record does not state the reference, so check before relying on it. Run `python3 scripts/prep_terrain.py` on one, then `node scripts/fit_elevation.mjs` (it will simply fit a near-zero plane if the data is already absolute).

## Slope check and the walking-effort model
- `node scripts/validate_dem_slope.mjs` compares DEM slope with the along-track grade implied by the rover's own recorded elevations (504 stretches of 40-120 m): Pearson r = 0.44, rover grade stays within DEM slope + 3 degrees on 98.8% of stretches. The rover grade is a single direction and its elevations are noisy, so this is a consistency check, not an accuracy figure.
- `dist/effort-model.js` uses the Minetti et al. (2002) walking cost-vs-gradient polynomial (J/kg/m). It is a published physics fit, an Earth-gravity unsuited baseline. Mars gravity and the suit are not modelled, so use it to compare routes, not for oxygen or consumables.
- A machine-learned "where would the rover drive" model was tried on local DEM shape features and did not beat chance under spatial cross-validation (AUC about 0.57), so it is not in the app.
