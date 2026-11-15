#!/usr/bin/env python3
"""
prep_terrain.py - turn a Mars DEM GeoTIFF into the files the MARVIN
pathfinder (pathfinding.mjs) and the map layers need.

Inputs : a DEM GeoTIFF in an equirectangular Mars projection (USGS Jezero
         CTX/HiRISE DEMs are Eqc, lat_ts 0, lon_0 0) and a lon/lat bounding box.
Outputs: terrain.json            slope + elevation grid for the pathfinder
         hazard_polygons.geojson steep-ground polygons for the map
         terrain_summary.json    stats + provenance (use it in your write-up)

Usage:
  python3 prep_terrain.py --dem M20_JezeroCrater_CTXDEM_20m.tif \
      --bbox 77.30 18.30 77.55 18.55 --out out/ [--decimate 1] \
      [--hazard-thresholds 15 20 30]

Assumptions you should check (they are printed at run time):
  * Slope uses GROUND spacing: in an Eqc map, east-west pixel size on the
    ground shrinks by cos(lat)/cos(lat_ts). Ignoring that overstates E-W
    distances by ~5% at Jezero and skews slope.
  * Slope from a coarse DEM smooths out rocks, so it UNDERSTATES local
    hazard. It is not a rock or sand-stability map.
"""
import argparse
import base64
import json
import math
import os
import re
import sys

import numpy as np
import rasterio
from rasterio.features import shapes
from rasterio.windows import from_bounds

DEFAULT_R = 3396190.0  # metres, sphere used by USGS Mars Eqc products


def parse_projection(src, radius, lat_ts, lon0):
    proj = ""
    try:
        proj = src.crs.to_proj4() if src.crs else ""
    except Exception:
        pass
    def grab(key, default):
        m = re.search(r"\+%s=(-?[\d.]+)" % key, proj)
        return float(m.group(1)) if m else default
    R = radius if radius is not None else grab("R", grab("a", DEFAULT_R))
    lts = lat_ts if lat_ts is not None else grab("lat_ts", 0.0)
    l0 = lon0 if lon0 is not None else grab("lon_0", 0.0)
    return R, lts, l0, proj


def block_mean(a, f):
    if f <= 1:
        return a
    h, w = (a.shape[0] // f) * f, (a.shape[1] // f) * f
    a = a[:h, :w].reshape(h // f, f, w // f, f)
    with np.errstate(all="ignore"):
        out = np.nanmean(a, axis=(1, 3))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dem", required=True)
    ap.add_argument("--bbox", required=True, nargs=4, type=float, metavar=("WEST", "SOUTH", "EAST", "NORTH"),
                    help="lon/lat degrees east/north")
    ap.add_argument("--out", required=True)
    ap.add_argument("--decimate", type=int, default=1, help="block-average factor to shrink the grid")
    ap.add_argument("--hazard-thresholds", type=float, nargs="+", default=[20.0],
                    help="slope (deg) thresholds to polygonize")
    ap.add_argument("--radius", type=float, default=None, help="override sphere radius (m)")
    ap.add_argument("--lat-ts", type=float, default=None, help="override latitude of true scale (deg)")
    ap.add_argument("--lon0", type=float, default=None, help="override central meridian (deg)")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    west, south, east, north = args.bbox

    with rasterio.open(args.dem) as src:
        R, lat_ts, lon0, proj = parse_projection(src, args.radius, args.lat_ts, args.lon0)
        print("CRS        :", proj or "(none found - using defaults)")
        print("Assumed    : R=%.1f m, lat_ts=%.2f deg, lon_0=%.2f deg" % (R, lat_ts, lon0))
        k = R * math.cos(math.radians(lat_ts))  # projected x metres per radian of longitude

        def to_xy(lon, lat):
            return (math.radians(lon - lon0) * k, math.radians(lat) * R)

        x0, y0 = to_xy(west, south)
        x1, y1 = to_xy(east, north)
        win = from_bounds(x0, y0, x1, y1, src.transform).round_offsets().round_lengths()
        win = win.intersection(rasterio.windows.Window(0, 0, src.width, src.height))
        if win.width < 3 or win.height < 3:
            sys.exit("bbox does not overlap the DEM (check --bbox order: west south east north)")
        z = src.read(1, window=win).astype("float32")
        transform = src.window_transform(win)
        nodata = src.nodata

    bad = ~np.isfinite(z) | (z < -1e20)
    if nodata is not None:
        bad |= z == np.float32(nodata)
    z[bad] = np.nan

    f = max(1, args.decimate)
    if f > 1:
        z = block_mean(z, f)
        transform = transform * transform.scale(f, f)
    h, w = z.shape
    px, py = transform.a, -transform.e

    rows = np.arange(h)
    y_c = transform.f + (rows + 0.5) * transform.e
    lat_c = y_c / R  # radians
    dx_ground = px * np.cos(lat_c) / math.cos(math.radians(lat_ts))  # metres per column, per row
    dy_ground = py

    dzdx = np.gradient(z, axis=1) / dx_ground[:, None]
    dzdy = np.gradient(z, axis=0) / dy_ground
    slope = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))
    nodata_mask = ~np.isfinite(slope)

    code = np.clip(np.rint(np.nan_to_num(slope, nan=0.0) * 2.0), 0, 254).astype(np.uint8)
    code[nodata_mask] = 255
    elev = z.astype("<f4")

    west_deg = lon0 + math.degrees(transform.c / k)
    east_deg = lon0 + math.degrees((transform.c + w * px) / k)
    north_deg = math.degrees(transform.f / R)
    south_deg = math.degrees((transform.f + h * transform.e) / R)

    terrain = {
        "version": 1,
        "width": w,
        "height": h,
        "bounds": {"west": west_deg, "east": east_deg, "south": south_deg, "north": north_deg},
        "radiusM": R,
        "slopeScaleDeg": 0.5,
        "nodataCode": 255,
        "slope_b64": base64.b64encode(code.tobytes()).decode("ascii"),
        "elev_b64": base64.b64encode(elev.tobytes()).decode("ascii"),
        "source": {"dem": os.path.basename(args.dem), "crs": proj, "latTsDeg": lat_ts,
                   "decimate": f, "cellProjM": [px, py]},
    }
    with open(os.path.join(args.out, "terrain.json"), "w") as fh:
        json.dump(terrain, fh)

    def to_lonlat(xm, ym):
        return [lon0 + math.degrees(xm / k), math.degrees(ym / R)]

    features = []
    for thr in sorted(args.hazard_thresholds):
        mask = np.isfinite(slope) & (slope > thr)
        for geom, val in shapes(mask.astype(np.uint8), mask=mask, transform=transform):
            rings = [[to_lonlat(x, y) for x, y in ring] for ring in geom["coordinates"]]
            features.append({"type": "Feature",
                             "properties": {"kind": "steep_ground", "slope_gt_deg": thr},
                             "geometry": {"type": "Polygon", "coordinates": rings}})
    with open(os.path.join(args.out, "hazard_polygons.geojson"), "w") as fh:
        json.dump({"type": "FeatureCollection", "features": features}, fh)

    valid = slope[np.isfinite(slope)]
    summary = {
        "grid": {"width": w, "height": h, "bounds": terrain["bounds"],
                 "groundCellMetres_eastWest_mean": float(np.mean(dx_ground)),
                 "groundCellMetres_northSouth": float(dy_ground)},
        "slopeDeg": {"min": float(valid.min()), "median": float(np.median(valid)),
                     "p95": float(np.percentile(valid, 95)), "max": float(valid.max())},
        "fractionAbove": {str(t): float(np.mean(valid > t)) for t in sorted(args.hazard_thresholds)},
        "nodataFraction": float(np.mean(nodata_mask)),
        "elevationM": {"min": float(np.nanmin(z)), "max": float(np.nanmax(z))},
        "caveats": [
            "Slope computed from the DEM at its native/decimated resolution; rocks and cross-slopes smaller than a pixel are not represented.",
            "Not a sand-stability or rock-abundance map.",
            "Projection assumed Eqc (lat_ts=%.2f, R=%.1f); verify against the DEM metadata." % (lat_ts, R),
        ],
        "source": terrain["source"],
    }
    with open(os.path.join(args.out, "terrain_summary.json"), "w") as fh:
        json.dump(summary, fh, indent=2)

    print("Grid       : %d x %d cells, ~%.1f m E-W, %.1f m N-S on the ground" %
          (w, h, float(np.mean(dx_ground)), dy_ground))
    print("Slope deg  : median %.1f, p95 %.1f, max %.1f" %
          (summary["slopeDeg"]["median"], summary["slopeDeg"]["p95"], summary["slopeDeg"]["max"]))
    print("Hazards    :", len(features), "polygons")
    print("Wrote      :", os.path.join(args.out, "terrain.json"), "(+ hazard_polygons.geojson, terrain_summary.json)")


if __name__ == "__main__":
    main()
