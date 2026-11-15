import {MISSION_BASE} from '../dist/mission-base.js';
import assert from 'node:assert/strict';import fs from 'node:fs';import {distance,buildGraph,shortest,planMission} from '../dist/routing.js';
assert(Math.abs(distance([0,0],[1,0])-59274.7)<1);
const data=JSON.parse(fs.readFileSync('dist/assets/data.json'));let tr=JSON.parse(fs.readFileSync('dist/assets/traverse.json'));let g=buildGraph(tr.features,data.bounds);let ps=data.panoramas.map(p=>({...p,node:g.nearest(p.coord),tasks:[{id:'photo',min:12}]})).filter(p=>distance(p.coord,g.nodes[p.node])<35);let start=ps.find(p=>p.id===MISSION_BASE.panoramaId);let s={maxDistance:5000,budget:240,speed:2,maxGrade:20,preference:'science',ids:['photo']};let plan=planMission(g,start,ps.filter(p=>p!==start),s);assert(plan.stops.length>0);assert(plan.distance<=s.maxDistance);assert(plan.minutes<=s.budget*.8);assert(distance(plan.coords[0],plan.coords.at(-1))<.1);assert(plan.legs.length===plan.stops.length+1);const impossible=planMission(g,start,ps.filter(p=>p!==start),{...s,maxDistance:1,budget:1});assert.equal(impossible.stops.length,0);let p=shortest(g,start.node,plan.stops[0].node,s);let blocked=new Set([p.edgeIds[Math.floor(p.edgeIds.length/2)]]);let replanned=shortest(g,start.node,plan.stops[0].node,s,blocked);if(replanned)assert(!replanned.edgeIds.some(x=>blocked.has(x)));console.log(JSON.stringify({nodes:g.nodes.length,edges:g.edges.length,panoramas:ps.length,stops:plan.stops.length,distance:plan.distance,minutes:plan.minutes,tests:'passed'}));
const {panoramaSequence}=await import('../dist/routing.js');
const scenic=planMission(g,start,ps.filter(p=>p!==start),{...s,budget:480,maxDistance:14500,preference:'panorama'});
assert(scenic.distance<=14500);assert(scenic.minutes<=480*.8);
const seq=panoramaSequence(scenic.coords,ps);
assert(seq.length>=scenic.stops.length);
assert(seq.every((p,i)=>p.offsetMeters<=35&&(!i||p.routeMeters>=seq[i-1].routeMeters)));
assert.equal(new Set(seq.map(p=>p.id)).size,seq.length);
assert.deepEqual(panoramaSequence([],ps),[]);
// A line with seven photographed destinations verifies panorama mode can go beyond the old six-stop cap.
const f=[{geometry:{coordinates:Array.from({length:9},(_,i)=>[77.4+i*.001,18.45,-2500])}}];
const fg=buildGraph(f,[77.39,18.4,77.5,18.5]);
const fp=fg.nodes.map((coord,node)=>({id:node,name:`View ${node}`,node,coord,tasks:[{id:'photo',min:1}],sol:node}));
const opts={maxDistance:10000,budget:480,speed:2,maxGrade:20,ids:['photo']};
const regular=planMission(fg,fp[0],fp.slice(1),{...opts,preference:'science'});
const photoRoute=planMission(fg,fp[0],fp.slice(1),{...opts,preference:'panorama'});
assert(photoRoute.stops.length>regular.stops.length);
assert.equal(panoramaSequence(photoRoute.coords,fp).length,9);
console.log(JSON.stringify({panoramaTests:'passed',realRouteViews:seq.length,realRouteStops:scenic.stops.length,syntheticViews:9}));

assert.equal(start.coord[0],MISSION_BASE.longitude);assert.equal(start.coord[1],MISSION_BASE.latitude);assert.equal(MISSION_BASE.fictional,true);assert(distance(plan.coords[0],g.nodes[start.node])<.1);assert(distance(plan.coords.at(-1),g.nodes[start.node])<.1);
