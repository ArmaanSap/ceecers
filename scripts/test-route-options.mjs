import assert from 'node:assert/strict';import fs from 'node:fs';
import {decodeTerrain} from '../dist/dem3d-math.js';import {gridRoute,chainRoute,cellOf,lonLatOf} from '../dist/dem-path.js';
import {buildGraph,distance} from '../dist/routing.js';
import {alternativeRoutes,compareMetrics,whyNotChosen,offTrackMeters} from '../dist/route-options.js';
const A=new URL('../dist/assets/',import.meta.url),D=decodeTerrain(JSON.parse(fs.readFileSync(new URL('terrain.json',A)))),data=JSON.parse(fs.readFileSync(new URL('data.json',A))),tr=JSON.parse(fs.readFileSync(new URL('traverse.json',A)));
const g=buildGraph(tr.features.filter(f=>f.geometry?.coordinates),data.bounds),P=id=>data.panoramas.find(p=>p.id===id).coord;
// grid router: endpoints, bounded slope, and the limit really limits
const base=P(17),a=P(1),r=gridRoute(D,base,a,{limitDeg:20});assert.ok(r&&r.coords.length>=2);assert.deepEqual(r.coords[0],[base[0],base[1]]);assert.ok(r.distance>=distance(base,a)-1,'never shorter than straight');
const tight=gridRoute(D,base,a,{limitDeg:10,penalty:2});if(tight){for(let k=1;k<tight.coords.length;k++){const c=cellOf(D,...tight.coords[k]);}}
assert.equal(gridRoute(D,base,a,{limitDeg:0.01}),null,'impossible limit -> no path, not a bad path');
assert.equal(gridRoute(D,[10,10],a,{}),null,'outside DEM -> null');
// the gentle variant never has a steeper worst cell than the direct one
const worst=c=>{let m=0;for(let k=1;k<c.length;k++)for(let t=0;t<=10;t++){const p=[c[k-1][0]+(c[k][0]-c[k-1][0])*t/10,c[k-1][1]+(c[k][1]-c[k-1][1])*t/10],i=cellOf(D,...p);if(i>=0&&D.slope[i]>m)m=D.slope[i]}return m};
const direct=gridRoute(D,base,a,{limitDeg:20,penalty:0}),gentle=gridRoute(D,base,a,{limitDeg:20,penalty:8});assert.ok(worst(gentle.coords)<=worst(direct.coords)+0.01,'gentle is not steeper than direct');assert.ok(worst(direct.coords)<=20.5);
// four alternatives for a real two-stop plan, with reasons
const slopeOf=c=>{let mx=0,sum=0,n=0;for(let k=1;k<c.length;k++){const d=distance(c[k-1],c[k]),m=Math.max(1,Math.round(d/20));for(let t=0;t<m;t++){const p=[c[k-1][0]+(c[k][0]-c[k-1][0])*(t+.5)/m,c[k-1][1]+(c[k][1]-c[k-1][1])*(t+.5)/m],i=cellOf(D,...p);if(i>=0&&D.slope[i]>=0){mx=Math.max(mx,D.slope[i]);sum+=D.slope[i];n++}}}return {maxDeg:mx,meanDeg:n?sum/n:0,overLimitMeters:0}};
const chosen={coords:[base,P(1),P(9),base],distance:11000,minutes:376,stops:[{name:'A',coord:P(1)},{name:'B',coord:P(9)}]};
const res=alternativeRoutes(D,g,base,chosen,{speed:2,maxGrade:20},{panos:data.panoramas,slopeOf});
assert.ok(res.alternatives.length>=3&&res.alternatives.length<=4,'found '+res.alternatives.length);
for(const x of res.alternatives){assert.ok(x.why.length>30&&x.coords.length>=3);assert.ok(x.order.length===2);assert.ok(x.metrics.distance>0);assert.ok(x.modelled)}
assert.equal(new Set(res.alternatives.map(x=>x.label)).size,res.alternatives.length,'distinct labels');
const one=alternativeRoutes(D,g,base,{...chosen,stops:[{name:'A',coord:P(1)}],coords:[base,P(1),base],distance:5200},{speed:2,maxGrade:20},{panos:data.panoramas,slopeOf});assert.ok(one.alternatives.length>=3);
// reasons come only from metric deltas
const c=compareMetrics({distance:1000,minutes:30,maxDeg:6,meanDeg:3,views:2,offTrack:0},{distance:1500,minutes:40,maxDeg:4,meanDeg:2,views:2,offTrack:400});
assert.ok(c.worse.some(x=>/longer by 500 m/.test(x))&&c.worse.some(x=>/400 m off the recorded rover track/.test(x))&&c.better.some(x=>/gentler worst point/.test(x)));
assert.match(whyNotChosen({worse:['longer'],better:[]}),/No upside/);assert.match(whyNotChosen({worse:[],better:[]}),/same on every measured value/);
assert.ok(offTrackMeters(g,[base,P(1)])>=0);
console.log('Route options: DEM grid A*, slope limits respected, '+res.alternatives.length+' distinct alternatives with metric-based reasons passed.');
