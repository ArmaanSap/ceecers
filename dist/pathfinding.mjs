// pathfinding.mjs - MARVIN route planning. No dependencies; runs in the browser or Node 18+.
//
//   import { createPlanner } from "./pathfinding.mjs";
//   const planner = createPlanner(terrainJson, { baseSpeedKmh: 2, maxSlopeDeg: 20 });
//   const plan = planner.plan({ base, stops, budgetMin: 240, reserveFrac: 0.2, maxDistM: 8000 });
//   planner.flagObstacle({ lon, lat, radiusM: 60 });
//   const { before, after } = planner.replan();
//
// terrainJson is the terrain.json written by prep_terrain.py.
// Stops: { id, lon, lat, value = 1, durationMin = 0 }.   base: { lon, lat }.
//
// ASSUMPTIONS (edit, and state them in your write-up):
//   * Walking speed follows a Tobler-style slope curve scaled so flat ground = baseSpeedKmh, capped there.
//     This is NOT measured suited-astronaut data.
//   * maxSlopeDeg is a planning limit, not a NASA suit specification.
//   * Slope comes from the DEM; rocks, sand, and cross-slopes below pixel size are not modelled.

const D2R = Math.PI / 180;

// ---------- terrain decoding ----------
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function decodeTerrain(t) {
  const slopeCode = b64ToBytes(t.slope_b64);
  const elev = new Float32Array(b64ToBytes(t.elev_b64).buffer); // little-endian float32, fresh aligned buffer
  const { west, east, south, north } = t.bounds;
  const W = t.width, H = t.height;
  const dlon = (east - west) / W, dlat = (north - south) / H;
  const cosLat = new Float64Array(H);
  for (let r = 0; r < H; r++) cosLat[r] = Math.cos((north - (r + 0.5) * dlat) * D2R);
  return { W, H, west, north, dlon, dlat, R: t.radiusM, cosLat, slopeCode, elev,
           slopeScaleDeg: t.slopeScaleDeg, nodataCode: t.nodataCode };
}

export const cellSlopeDeg = (T, i) => T.slopeCode[i] === T.nodataCode ? NaN : T.slopeCode[i] * T.slopeScaleDeg;
export const cellToLonLat = (T, r, c) => [T.west + (c + 0.5) * T.dlon, T.north - (r + 0.5) * T.dlat];
export function lonLatToCell(T, lon, lat) {
  const c = Math.floor((lon - T.west) / T.dlon), r = Math.floor((T.north - lat) / T.dlat);
  return (r < 0 || c < 0 || r >= T.H || c >= T.W) ? -1 : r * T.W + c;
}

// ---------- cost field ----------
export function toblerFactor(S) {          // S = rise/run along the step; 1 on flat ground, never above 1
  return Math.max(0.05, Math.min(1, Math.exp(-3.5 * (Math.abs(S + 0.05) - 0.05))));
}

export function buildField(T, opts = {}) {
  const o = { baseSpeedKmh: 2, maxSlopeDeg: 20, ...opts };
  const N = T.W * T.H;
  const pass = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const s = cellSlopeDeg(T, i);
    pass[i] = (Number.isFinite(s) && s <= o.maxSlopeDeg && Number.isFinite(T.elev[i])) ? 1 : 0;
  }
  return { T, o, pass, mult: new Float32Array(N).fill(1), speedMps: o.baseSpeedKmh / 3.6 };
}

export function cloneField(f) {
  return { T: f.T, o: { ...f.o }, pass: f.pass.slice(), mult: f.mult.slice(), speedMps: f.speedMps };
}

// Block cells within radiusM of a point (a flagged obstacle or hazard zone).
export function blockDisc(field, lon, lat, radiusM) {
  const T = field.T, c0 = lonLatToCell(T, lon, lat);
  if (c0 < 0) return 0;
  const r0 = (c0 / T.W) | 0, cc0 = c0 - r0 * T.W;
  const span = Math.ceil(radiusM / (T.R * T.dlat * D2R)) + 2;
  let n = 0;
  for (let r = Math.max(0, r0 - span); r <= Math.min(T.H - 1, r0 + span); r++) {
    for (let c = Math.max(0, cc0 - span * 2); c <= Math.min(T.W - 1, cc0 + span * 2); c++) {
      const dy = (r - r0) * T.R * T.dlat * D2R;
      const dx = (c - cc0) * T.R * T.dlon * D2R * T.cosLat[r];
      if (dx * dx + dy * dy <= radiusM * radiusM) { const i = r * T.W + c; if (field.pass[i]) { field.pass[i] = 0; n++; } }
    }
  }
  return n;
}

// Slow (never speed up) an area, e.g. a dust-storm or radiation-penalty zone. factor >= 1.
export function penalizeDisc(field, lon, lat, radiusM, factor) {
  const T = field.T, c0 = lonLatToCell(T, lon, lat);
  if (c0 < 0) return;
  const r0 = (c0 / T.W) | 0, cc0 = c0 - r0 * T.W;
  const span = Math.ceil(radiusM / (T.R * T.dlat * D2R)) + 2;
  for (let r = Math.max(0, r0 - span); r <= Math.min(T.H - 1, r0 + span); r++) {
    for (let c = Math.max(0, cc0 - span * 2); c <= Math.min(T.W - 1, cc0 + span * 2); c++) {
      const dy = (r - r0) * T.R * T.dlat * D2R, dx = (c - cc0) * T.R * T.dlon * D2R * T.cosLat[r];
      if (dx * dx + dy * dy <= radiusM * radiusM) { const i = r * T.W + c; field.mult[i] = Math.max(field.mult[i], Math.max(1, factor)); }
    }
  }
}

// ---------- search ----------
class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, topV = v[0], lastK = k.pop(), lastV = v.pop(), n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lastK) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lastK; v[i] = lastV;
    }
    return topV;
  }
}

const N8 = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];

function stepInfo(F, i, r, c, dr, dc) {
  const T = F.T, nr = r + dr, nc = c + dc;
  if (nr < 0 || nc < 0 || nr >= T.H || nc >= T.W) return null;
  const j = nr * T.W + nc;
  if (!F.pass[j]) return null;
  if (dr && dc && (!F.pass[r * T.W + nc] || !F.pass[nr * T.W + c])) return null; // no corner cutting
  const cosMid = (T.cosLat[r] + T.cosLat[nr]) / 2;
  const dxm = dc * T.dlon * D2R * T.R * cosMid, dym = dr * T.dlat * D2R * T.R;
  const dist = Math.hypot(dxm, dym);
  const S = (T.elev[j] - T.elev[i]) / dist;
  if (Math.atan(Math.abs(S)) / D2R > F.o.maxSlopeDeg) return null;
  const f = F.o.speedFn ? F.o.speedFn(S) : toblerFactor(S);
  const t = dist / (F.speedMps * f) * (F.mult[i] + F.mult[j]) / 2;
  return { j, dist, t };
}

// Dijkstra/A* from src. If goal >= 0 uses an admissible heuristic and stops there.
// If targets is given (array of indices) stops once all are settled. Returns arrays for path reconstruction.
function search(F, src, goal, targets) {
  const T = F.T, N = T.W * T.H;
  const g = new Float64Array(N).fill(Infinity), gd = new Float64Array(N), prev = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const remaining = targets ? new Set(targets) : null;
  const minCos = Math.min(...T.cosLat);
  const gr = goal >= 0 ? (goal / T.W) | 0 : 0, gc = goal >= 0 ? goal - gr * T.W : 0;
  const h = (i) => {
    if (goal < 0) return 0;
    const r = (i / T.W) | 0, c = i - r * T.W;
    return Math.hypot((c - gc) * T.dlon * D2R * T.R * minCos, (r - gr) * T.dlat * D2R * T.R) / F.speedMps;
  };
  const heap = new MinHeap();
  g[src] = 0; heap.push(h(src), src);
  while (heap.size) {
    const i = heap.pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === goal) break;
    if (remaining) { remaining.delete(i); if (!remaining.size) break; }
    const r = (i / T.W) | 0, c = i - r * T.W;
    for (const [dr, dc] of N8) {
      const s = stepInfo(F, i, r, c, dr, dc);
      if (!s || closed[s.j]) continue;
      const nt = g[i] + s.t;
      if (nt < g[s.j]) { g[s.j] = nt; gd[s.j] = gd[i] + s.dist; prev[s.j] = i; heap.push(nt + h(s.j), s.j); }
    }
  }
  return { g, gd, prev };
}

function pathFrom(prev, goal) {
  const p = [];
  for (let i = goal; i !== -1; i = prev[i]) p.push(i);
  return p.reverse();
}

export function snapToPassable(F, lon, lat, maxRing = 15) {
  const T = F.T, i0 = lonLatToCell(T, lon, lat);
  if (i0 < 0) return -1;
  const r0 = (i0 / T.W) | 0, c0 = i0 - r0 * T.W;
  for (let ring = 0; ring <= maxRing; ring++) {
    let best = -1, bd = Infinity;
    for (let r = r0 - ring; r <= r0 + ring; r++) for (let c = c0 - ring; c <= c0 + ring; c++) {
      if (r < 0 || c < 0 || r >= T.H || c >= T.W) continue;
      if (Math.max(Math.abs(r - r0), Math.abs(c - c0)) !== ring) continue;
      const i = r * T.W + c; if (!F.pass[i]) continue;
      const d = (r - r0) ** 2 + (c - c0) ** 2; if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) return best;
  }
  return -1;
}

// ---------- orienteering: choose and order stops ----------
// Node 0 = base, nodes 1..n = stops. timeMat/distMat are (n+1)x(n+1), svc[j] minutes at node j.
// Exact for time; for distance it accepts a stop set if the min-time order OR the min-distance order meets both limits.
export function solveOrienteering({ n, timeMat, distMat, svc, values, budgetMin, maxDistM = Infinity }) {
  if (n > 14) throw new Error("solveOrienteering: pre-select at most 14 candidate stops");
  const S = 1 << n;
  const dp = (cost, service, limit) => {
    const best = new Float64Array(S * n).fill(Infinity), prv = new Int8Array(S * n).fill(-1);
    for (let j = 0; j < n; j++) { const v = cost[0][j + 1] + service[j + 1]; if (v <= limit) best[(1 << j) * n + j] = v; }
    for (let m = 1; m < S; m++) for (let j = 0; j < n; j++) {
      if (!(m & (1 << j))) continue;
      const cur = best[m * n + j]; if (!Number.isFinite(cur)) continue;
      for (let k = 0; k < n; k++) {
        if (m & (1 << k)) continue;
        const v = cur + cost[j + 1][k + 1] + service[k + 1];
        const nm = m | (1 << k);
        if (v <= limit && v < best[nm * n + k]) { best[nm * n + k] = v; prv[nm * n + k] = j; }
      }
    }
    return { best, prv };
  };
  const zero = new Array(n + 1).fill(0);
  const tDP = dp(timeMat, svc, budgetMin);
  const dDP = Number.isFinite(maxDistM) ? dp(distMat, zero, maxDistM) : null;
  const orderOf = (D, cost, m) => {
    let bj = -1, bv = Infinity;
    for (let j = 0; j < n; j++) { const v = D.best[m * n + j] + cost[j + 1][0]; if (v < bv) { bv = v; bj = j; } }
    if (bj < 0 || !Number.isFinite(bv)) return null;
    const ord = []; let mm = m, j = bj;
    while (j !== -1) { ord.push(j + 1); const pj = D.prv[mm * n + j]; mm &= ~(1 << j); j = pj; }
    return ord.reverse();
  };
  const evalOrder = (ord) => {
    let t = 0, d = 0, at = 0;
    for (const nd of ord) { t += timeMat[at][nd] + svc[nd]; d += distMat[at][nd]; at = nd; }
    return { timeMin: t + timeMat[at][0], distM: d + distMat[at][0] };
  };
  let bestRes = { order: [], score: 0, timeMin: 0, distM: 0 };
  for (let m = 1; m < S; m++) {
    let score = 0; for (let j = 0; j < n; j++) if (m & (1 << j)) score += values[j + 1];
    if (score < bestRes.score) continue;
    const cands = [orderOf(tDP, timeMat, m)];
    if (dDP) cands.push(orderOf(dDP, distMat, m));
    for (const ord of cands) {
      if (!ord) continue;
      const e = evalOrder(ord);
      if (e.timeMin > budgetMin + 1e-9 || e.distM > maxDistM + 1e-9) continue;
      if (score > bestRes.score || (score === bestRes.score && e.timeMin < bestRes.timeMin)) bestRes = { order: ord, score, ...e };
    }
  }
  return bestRes;
}

// ---------- full mission ----------
export function planMission(F, { base, stops, budgetMin, reserveFrac = 0.2, maxDistM = Infinity }) {
  const T = F.T;
  const nodes = [{ id: "base", ...base, value: 0, durationMin: 0 }, ...stops.map(s => ({ value: 1, durationMin: 0, ...s }))];
  const dropped = [];
  const keep = [];
  nodes.forEach((nd, k) => {
    const cell = snapToPassable(F, nd.lon, nd.lat);
    if (cell < 0) { if (k === 0) throw new Error("base is not on passable ground"); dropped.push({ id: nd.id, reason: "no passable ground nearby" }); }
    else keep.push({ ...nd, cell });
  });
  const cells = keep.map(k => k.cell);
  const m = keep.length, tm = [], dm = [];
  for (let a = 0; a < m; a++) {
    const sr = search(F, cells[a], -1, cells);
    tm.push(Array.from(cells, c => sr.g[c] / 60));   // minutes
    dm.push(Array.from(cells, c => sr.gd[c]));
  }
  // drop stops that cannot be reached from base and back
  const ok = [0];
  for (let k = 1; k < m; k++) {
    if (Number.isFinite(tm[0][k]) && Number.isFinite(tm[k][0])) ok.push(k);
    else dropped.push({ id: keep[k].id, reason: "unreachable under current constraints" });
  }
  const sel = ok.map(k => keep[k]);
  const pick = (mat) => ok.map(a => ok.map(b => mat[a][b]));
  const tmat = pick(tm), dmat = pick(dm);
  const n = sel.length - 1;
  const budget = budgetMin * (1 - reserveFrac);
  const sol = n > 0 ? solveOrienteering({
    n, timeMat: tmat, distMat: dmat, svc: sel.map(s => s.durationMin), values: sel.map(s => s.value),
    budgetMin: budget, maxDistM }) : { order: [], score: 0, timeMin: 0, distM: 0 };

  const seq = [0, ...sol.order, 0];
  const legs = [];
  let ascentM = 0, maxSlope = 0, descentM = 0;
  const coords = [], elevProfile = [], cum = [];
  let cumD = 0;
  for (let k = 0; k + 1 < seq.length; k++) {
    const a = sel[seq[k]].cell, b = sel[seq[k + 1]].cell;
    const sr = search(F, a, b, null);
    const path = pathFrom(sr.prev, b);
    legs.push({ from: sel[seq[k]].id, to: sel[seq[k + 1]].id, timeMin: sr.g[b] / 60, distM: sr.gd[b] });
    path.forEach((i, idx) => {
      if (idx === 0 && coords.length) return;
      const r = (i / T.W) | 0, c = i - r * T.W;
      coords.push(cellToLonLat(T, r, c));
      elevProfile.push(T.elev[i]);
      if (idx > 0) {
        const p = path[idx - 1], pr = (p / T.W) | 0, pc = p - pr * T.W;
        const dx = (c - pc) * T.dlon * D2R * T.R * (T.cosLat[r] + T.cosLat[pr]) / 2, dy = (r - pr) * T.dlat * D2R * T.R;
        cumD += Math.hypot(dx, dy);
        const dz = T.elev[i] - T.elev[p]; if (dz > 0) ascentM += dz; else descentM -= dz;
      }
      cum.push(cumD);
      const s = cellSlopeDeg(T, i); if (Number.isFinite(s)) maxSlope = Math.max(maxSlope, s);
    });
  }
  const orderIds = sol.order.map(j => sel[j].id);
  return {
    feasible: n > 0 && sol.order.length > 0,
    order: orderIds, dropped, legs,
    totals: { moveAndServiceMin: sol.timeMin, serviceMin: sol.order.reduce((s, j) => s + sel[j].durationMin, 0),
              budgetMin, reserveMin: budgetMin * reserveFrac, distM: sol.distM, ascentM, descentM,
              maxCellSlopeDeg: maxSlope, score: sol.score },
    stops: sol.order.map(j => ({ id: sel[j].id, lon: sel[j].lon, lat: sel[j].lat })),
    base: { lon: base.lon, lat: base.lat },
    route: { coords, elevM: elevProfile, cumDistM: cum },
  };
}

export function routeToGeoJSON(plan) {
  const feats = [];
  if (plan.route.coords.length > 1) feats.push({ type: "Feature", properties: { kind: "route", ...plan.totals },
    geometry: { type: "LineString", coordinates: plan.route.coords } });
  feats.push({ type: "Feature", properties: { kind: "base" }, geometry: { type: "Point", coordinates: [plan.base.lon, plan.base.lat] } });
  plan.stops.forEach((s, k) => feats.push({ type: "Feature", properties: { kind: "stop", id: s.id, order: k + 1 },
    geometry: { type: "Point", coordinates: [s.lon, s.lat] } }));
  return { type: "FeatureCollection", features: feats };
}

// ---------- session wrapper with obstacle re-route ----------
export function createPlanner(terrainJson, opts = {}) {
  const T = decodeTerrain(terrainJson);
  const baseField = buildField(T, opts);
  let field = cloneField(baseField), lastReq = null, lastPlan = null;
  const flags = [];
  return {
    terrain: T,
    plan(req) { lastReq = req; lastPlan = planMission(field, req); return lastPlan; },
    flagObstacle({ lon, lat, radiusM = 50 }) { flags.push({ lon, lat, radiusM }); return blockDisc(field, lon, lat, radiusM); },
    penalizeZone({ lon, lat, radiusM, factor }) { penalizeDisc(field, lon, lat, radiusM, factor); },
    clearFlags() { field = cloneField(baseField); flags.length = 0; },
    flags: () => flags.slice(),
    replan() {
      if (!lastReq) throw new Error("call plan() first");
      const before = lastPlan, after = planMission(field, lastReq);
      lastPlan = after;
      return { before, after,
        deltaTimeMin: after.totals.moveAndServiceMin - before.totals.moveAndServiceMin,
        deltaDistM: after.totals.distM - before.totals.distM,
        stopsLost: before.order.filter(id => !after.order.includes(id)) };
    },
  };
}

// exposed for tests
export const _search = search;
