import assert from 'node:assert/strict';import fs from 'node:fs';
import {decodeTerrain} from '../dist/dem3d-math.js';import {walkCostJPerKgM,routeEffort} from '../dist/effort-model.js';
// Published anchors (Minetti 2002): ~2.5 J/kg/m level, minimum on a gentle downhill, steep uphill several times level
assert.ok(Math.abs(walkCostJPerKgM(0)-2.5)<.01);assert.ok(walkCostJPerKgM(-.1)<walkCostJPerKgM(0));assert.ok(walkCostJPerKgM(.2)>2.5*2.5);assert.ok(walkCostJPerKgM(.9)===walkCostJPerKgM(.45),'gradient is clamped to the fitted range');
const D=decodeTerrain(JSON.parse(fs.readFileSync(new URL('../dist/assets/terrain.json',import.meta.url))));
const b=D.bounds,c=[[b.west+.3*(b.east-b.west),b.north-.5*(b.north-b.south)],[b.west+.6*(b.east-b.west),b.north-.5*(b.north-b.south)]];
const e=routeEffort(D,c),r=routeEffort(D,[...c].reverse());
assert.ok(e&&e.kcal>0&&e.meters>1000,'effort computed over a real DEM stretch');assert.ok(Math.abs(e.climbM-r.descentM)<1e-6,'climb out equals descent back');
assert.equal(routeEffort(D,[c[0]]),null);assert.ok(/not modelled/.test(e.note));
console.log('Effort model: Minetti polynomial anchors, climb/descent symmetry, null on empty routes.');
