// Slope pathfinding module tests on SYNTHETIC terrain (algorithm checks, not Mars). Run: node --test scripts/test-pathfinding.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPlanner, solveOrienteering, cellToLonLat, lonLatToCell, buildField, snapToPassable, _search } from "../dist/pathfinding.mjs";

const terrainJson = JSON.parse(readFileSync(new URL("./fixtures/synthetic_terrain.json", import.meta.url)));
const mk = () => createPlanner(terrainJson, { baseSpeedKmh: 2, maxSlopeDeg: 20 });
const at = (p, r, c) => { const [lon, lat] = cellToLonLat(p.terrain, r, c); return { lon, lat }; };
const cellsOf = (p, plan) => plan.route.coords.map(([lon, lat]) => { const i = lonLatToCell(p.terrain, lon, lat); const r = (i / p.terrain.W) | 0; return [r, i - r * p.terrain.W]; });

test("route crosses the ridge only through a gap", () => {
  const p = mk();
  const plan = p.plan({ base: at(p, 125, 20), stops: [{ id: "A", ...at(p, 125, 150), value: 1 }], budgetMin: 600, reserveFrac: 0 });
  assert.equal(plan.feasible, true);
  const crossing = cellsOf(p, plan).filter(([r, c]) => c >= 100 && c <= 102);
  assert.ok(crossing.length > 0, "route should cross the wall");
  for (const [r] of crossing) assert.ok((r >= 120 && r <= 130) || (r >= 30 && r <= 36), "crossed at row " + r);
});

test("flagging the near gap forces the long way around, and costs time", () => {
  const p = mk();
  const req = { base: at(p, 125, 20), stops: [{ id: "A", ...at(p, 125, 150), value: 1 }], budgetMin: 900, reserveFrac: 0 };
  const first = p.plan(req);
  const [lon, lat] = cellToLonLat(p.terrain, 125, 101);
  p.flagObstacle({ lon, lat, radiusM: 300 });
  const { after, deltaTimeMin } = p.replan();
  assert.equal(after.feasible, true);
  assert.ok(deltaTimeMin > 5, "detour should add time, added " + deltaTimeMin);
  for (const [r, c] of cellsOf(p, after).filter(([r, c]) => c >= 100 && c <= 102)) assert.ok(r >= 30 && r <= 36, "now crosses at row " + r);
  assert.ok(first.totals.distM < after.totals.distM);
});

test("sealing both gaps makes the far stop unreachable and it is reported", () => {
  const p = mk();
  p.plan({ base: at(p, 125, 20), stops: [{ id: "A", ...at(p, 125, 150) }, { id: "near", ...at(p, 125, 60) }], budgetMin: 900, reserveFrac: 0 });
  for (const row of [125, 33]) { const [lon, lat] = cellToLonLat(p.terrain, row, 101); p.flagObstacle({ lon, lat, radiusM: 300 }); }
  const { after } = p.replan();
  assert.ok(after.dropped.some(d => d.id === "A"), "A should be dropped");
  assert.deepEqual(after.order, ["near"]);
});

test("time budget and reserve are respected", () => {
  const p = mk();
  const plan = p.plan({ base: at(p, 125, 20), budgetMin: 100, reserveFrac: 0.2,
    stops: [{ id: "s1", ...at(p, 125, 60), durationMin: 10 }, { id: "s2", ...at(p, 140, 80), durationMin: 10 }, { id: "far", ...at(p, 125, 180), durationMin: 10 }] });
  assert.ok(plan.totals.moveAndServiceMin <= 80 + 1e-6, "used " + plan.totals.moveAndServiceMin);
});

test("A* with heuristic gives the same time as plain Dijkstra (heuristic is admissible)", () => {
  const p = mk();
  const F = buildField(p.terrain, { baseSpeedKmh: 2, maxSlopeDeg: 20 });
  const pairs = [[[125, 20], [60, 60]], [[125, 20], [140, 150]], [[60, 20], [33, 160]], [[10, 10], [190, 90]]];
  for (const [[r1, c1], [r2, c2]] of pairs) {
    const a = snapToPassable(F, ...cellToLonLat(p.terrain, r1, c1)), b = snapToPassable(F, ...cellToLonLat(p.terrain, r2, c2));
    const withH = _search(F, a, b, null).g[b], plain = _search(F, a, -1, null).g[b];
    assert.ok(Number.isFinite(plain), "pair should be connected");
    assert.ok(Math.abs(withH - plain) < 1e-6, `A* ${withH} vs Dijkstra ${plain}`);
  }
});

// ---- orienteering solver vs brute force ----
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
function brute({ n, timeMat, distMat, svc, values, budgetMin, maxDistM }) {
  let best = { score: 0, timeMin: 0 };
  const perms = (arr) => arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map(r => [x, ...r]));
  for (let m = 1; m < (1 << n); m++) {
    const set = []; for (let j = 0; j < n; j++) if (m & (1 << j)) set.push(j + 1);
    const score = set.reduce((s, j) => s + values[j], 0);
    for (const ord of perms(set)) {
      let t = 0, d = 0, a = 0;
      for (const nd of ord) { t += timeMat[a][nd] + svc[nd]; d += distMat[a][nd]; a = nd; }
      t += timeMat[a][0]; d += distMat[a][0];
      if (t > budgetMin || d > maxDistM) continue;
      if (score > best.score || (score === best.score && t < best.timeMin)) best = { score, timeMin: t };
    }
  }
  return best;
}
function randomProblem(seed, n, tight) {
  const r = rng(seed), pts = Array.from({ length: n + 1 }, () => [r() * 3000, r() * 3000]);
  const distMat = pts.map(a => pts.map(b => Math.hypot(a[0] - b[0], a[1] - b[1])));
  const timeMat = distMat.map((row, i) => row.map((d, j) => i === j ? 0 : d / 30 * (1 + 0.3 * r())));  // asymmetric
  return { n, timeMat, distMat, svc: [0, ...Array.from({ length: n }, () => 3 + Math.floor(r() * 10))],
           values: [0, ...Array.from({ length: n }, () => 1 + Math.floor(r() * 5))], budgetMin: tight ? 120 : 200, maxDistM: Infinity };
}

test("orienteering DP equals brute force on random problems (time constraint)", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const prob = randomProblem(seed, 6, seed % 2 === 0);
    const got = solveOrienteering(prob), want = brute(prob);
    assert.equal(got.score, want.score, "seed " + seed);
    if (want.score > 0) assert.ok(Math.abs(got.timeMin - want.timeMin) < 1e-6, "seed " + seed);
  }
});

test("orienteering DP honours a distance cap", () => {
  for (let seed = 20; seed < 28; seed++) {
    const prob = { ...randomProblem(seed, 6, false), maxDistM: 5500 };
    const got = solveOrienteering(prob), want = brute(prob);
    assert.ok(got.distM <= 5500 + 1e-6 && got.timeMin <= prob.budgetMin + 1e-6);
    assert.ok(got.score <= want.score, "cannot beat the exact optimum");
  }
});
