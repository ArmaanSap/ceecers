import assert from 'node:assert/strict';import fs from 'node:fs';
import {REGIONS,regionStops,poiDescription} from '../dist/mission-flow.js';
import {MISSION_BASE} from '../dist/mission-base.js';
import {buildGraph,distance,planMission} from '../dist/routing.js';
const data=JSON.parse(fs.readFileSync('dist/assets/data.json')),tr=JSON.parse(fs.readFileSync('dist/assets/traverse.json'));
const g=buildGraph(tr.features,data.bounds),panos=data.panoramas.map(p=>({...p,node:g.nearest(p.coord),tasks:[{id:'photo',min:12}]})).filter(p=>distance(p.coord,g.nodes[p.node])<35),base=panos.find(p=>p.id===MISSION_BASE.panoramaId);
const ids=REGIONS.flatMap(r=>regionStops(panos,r.id).map(p=>p.id));assert.equal(ids.length,panos.length);assert.equal(new Set(ids).size,panos.length);assert.deepEqual(regionStops(panos,'invalid'),[]);
for(const r of REGIONS){const candidates=regionStops(panos,r.id).filter(p=>p.id!==base.id);assert.ok(candidates.length);const route=planMission(g,base,candidates,{maxDistance:20000,budget:480,speed:3,maxGrade:90,preference:'panorama',ids:['photo']});assert.ok(route.stops.length);assert.ok(route.stops.every(p=>r.accept(p)));assert.ok(distance(route.coords[0],g.nodes[base.node])<.1);assert.ok(distance(route.coords.at(-1),g.nodes[base.node])<.1)}
for(const name of ['Martre Outcrop 1','Enchanted Lake']){const p=panos.find(p=>p.name===name);assert.ok(p);assert.ok(poiDescription(p).length>30)}
console.log('Region grouping, region-filtered plans, base returns and major POI descriptions passed.');
