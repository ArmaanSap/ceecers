import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildGraph,distance,planMission} from '../dist/routing.js';
import {MISSION_BASE} from '../dist/mission-base.js';
import {regionStops} from '../dist/mission-flow.js';
import {buildTimeline,positionAt,WalkSim,planReturn,PLAYBACK_RATES,bearing} from '../dist/walk-sim.js';
import {createPoiStore} from '../dist/poi-store.js';
import {describeSite} from '../dist/site-info.js';
import {NotificationFeed,SIMULATED_EVENTS} from '../dist/notifications.js';
import {MissionLog} from '../dist/mission-log.js';
import {loadTerrain,makeRouter,addSpurs} from '../dist/slope-router.js';

const data=JSON.parse(fs.readFileSync('dist/assets/data.json')),tr=JSON.parse(fs.readFileSync('dist/assets/traverse.json'));
const g=buildGraph(tr.features,data.bounds);
const tasksFor=()=>[{id:'photo',min:12},{id:'mineral',min:20}];
const panos=data.panoramas.map(p=>({...p,node:g.nearest(p.coord),tasks:tasksFor()})).filter(p=>distance(p.coord,g.nodes[p.node])<35);
const base=panos.find(p=>p.id===MISSION_BASE.panoramaId);
const settings={maxDistance:20000,budget:480,speed:2,maxGrade:90,preference:'panorama',ids:['photo','mineral']};
const plan=planMission(g,base,regionStops(panos,'floor').filter(p=>p.id!==base.id),settings);
assert.ok(plan.stops.length&&plan.legs.length);

// ---- timeline / walking speed vs playback rate ----
const tl=buildTimeline(plan.legs,2);
const walkMin=plan.legs.reduce((s,l)=>s+l.distance/(2*1000)*60,0),sciMin=plan.legs.reduce((s,l)=>s+l.scienceMinutes,0);
assert.ok(Math.abs(tl.totalMinutes-(walkMin+sciMin))<walkMin*0.01+0.01,'timeline matches planner minutes: '+tl.totalMinutes+' vs '+(walkMin+sciMin));
assert.ok(Math.abs(tl.totalMinutes-plan.minutes)<plan.minutes*0.01+0.1);
assert.ok(distance(positionAt(tl,0).coord,g.nodes[base.node])<1);
assert.ok(distance(positionAt(tl,tl.totalMinutes).coord,g.nodes[base.node])<1);
const slow=buildTimeline(plan.legs,1);assert.ok(slow.totalMinutes>tl.totalMinutes,'slower walking takes longer');
assert.throws(()=>buildTimeline(plan.legs,0));
const sim=new WalkSim(tl,{rate:1});const total0=sim.total;
for(const r of PLAYBACK_RATES){sim.setRate(r);assert.equal(sim.total,total0,'playback rate must not change walking timeline')}
assert.throws(()=>sim.setRate(3));
assert.ok(Math.abs(bearing([0,0],[0,1])-0)<1e-6&&Math.abs(bearing([0,0],[1,0])-90)<1e-6);

// ---- state machine ----
const events=[];const s2=new WalkSim(buildTimeline(plan.legs,2),{rate:10});s2.on(e=>events.push(e.type));
assert.equal(s2.state,'idle');s2.tick(1);assert.equal(s2.minute,0,'idle does not advance');
s2.play();assert.equal(s2.state,'playing');s2.tick(1);assert.ok(Math.abs(s2.minute-10)<1e-9,'10x = 10 mission minutes per second');
s2.pause();const m=s2.minute;s2.tick(5);assert.equal(s2.minute,m,'paused does not advance');s2.play();assert.ok(events.includes('pause')&&events.includes('resume'));
s2.setRate(50);s2.tick(1);assert.ok(Math.abs(s2.minute-(m+50))<1e-9);
// abort & return
const here=s2.position().coord,legs=planReturn(g,here,base.node);assert.ok(legs?.length,'return path exists');
const before=s2.walkedMeters;assert.ok(s2.abort(legs));assert.equal(s2.returning,true);assert.ok(events.includes('abort'));
assert.ok(distance(s2.position().coord,here)<2,'position continuous across abort');
assert.equal(s2.abort(legs),false,'cannot abort twice');
for(let i=0;i<2000&&s2.state==='playing';i++)s2.tick(1);
assert.equal(s2.state,'complete');assert.ok(distance(s2.position().coord,g.nodes[base.node])<2,'returns to base');assert.ok(s2.walkedMeters>=before);
const ev=events.filter(e=>e==='complete');assert.equal(ev.length,1);
s2.restart();assert.equal(s2.state,'idle');assert.equal(s2.minute,0);assert.equal(s2.returning,false);assert.equal(s2.total,total0);
// full run emits a segment event for every segment, in order
const seen=[];const s3=new WalkSim(buildTimeline(plan.legs,2),{rate:50});s3.on(e=>{if(e.type==='segment')seen.push(e.index)});s3.play();for(let i=0;i<5000&&s3.state==='playing';i++)s3.tick(1);
assert.deepEqual(seen,[...seen.keys()]);assert.equal(seen.length,s3.tl.segments.length);

// ---- POI store ----
const mem=()=>{const m={};return {getItem:k=>m[k]??null,setItem:(k,v)=>{m[k]=v},m}};
const st=mem(),store=createPoiStore(st);
const a=store.add({lon:77.41,lat:18.45,name:'  Test\n\tpoint ',experimentIds:['photo']});
assert.equal(a.name,'Test point');assert.equal(a.id,'custom-1');
assert.throws(()=>store.add({lon:NaN,lat:1}));assert.throws(()=>store.add({lon:200,lat:1}));
assert.ok(store.rename(a.id,'Renamed'));assert.equal(store.rename(a.id,'   '),false);
const again=createPoiStore(st);assert.equal(again.list()[0].name,'Renamed','persisted');
const b=again.add({lon:77.42,lat:18.46});assert.equal(b.id,'custom-2');assert.ok(again.remove(a.id));assert.equal(again.add({lon:77.4,lat:18.4}).id,'custom-1','ids reused after delete');
assert.equal(createPoiStore({getItem:()=>'not json',setItem(){}}).list().length,0,'corrupt storage tolerated');
assert.equal(createPoiStore({getItem(){throw new Error('x')},setItem(){throw new Error('x')}}).add({lon:1,lat:1}).id,'custom-1','storage failures tolerated');
for(let i=0;i<60;i++){try{again.add({lon:77.4,lat:18.4})}catch{}}assert.ok(again.list().length<=40);

// ---- site info ----
const baseObj={coord:g.nodes[base.node]};
const onPath=describeSite(base.coord[0],base.coord[1],{graph:g,panos,base:baseObj,bounds:data.bounds});
assert.ok(onPath.covered&&onPath.elevation!=null&&onPath.recommendations.length>=2&&onPath.recommendations.every(r=>r.id!=="sample"));
assert.equal(onPath.fields.find(f=>f.label==='Slope').provenance,'placeholder','slope is a placeholder without DEM');
assert.ok(onPath.recommendations[0].score>=onPath.recommendations.at(-1).score);
assert.ok(onPath.recommendations.every(r=>r.why.length&&['rule-based suggestion','available at this point of interest','user-chosen waypoint'].includes(r.basis)));
const outside=describeSite(data.bounds[0]-1,data.bounds[1]-1,{graph:g,panos,base:baseObj,bounds:data.bounds});
assert.equal(outside.covered,false);assert.equal(outside.recommendations.length,0);assert.ok(outside.cautions.length);
const far=describeSite(data.bounds[0]+0.001,data.bounds[1]+0.001,{graph:g,panos,base:baseObj,bounds:data.bounds});
assert.ok(far.fields.some(f=>f.label==='Elevation')&&(far.elevation==null||far.nodeDist<=200),'no elevation invented far from rover data');

// ---- notifications ----
const feed=new NotificationFeed({panos,slopeLimitDeg:20,reserveMinutes:60,missionMinutes:300});feed.start();
assert.ok(feed.items.every(i=>i.provenance&&i.source&&i.severity));
const p0=panos[0],at={coord:p0.coord,kind:'walk',gradeDeg:0,distanceM:0};
const nearP0=panos.filter(p=>distance(p.coord,p0.coord)<=60).length;assert.equal(feed.update(at,{minute:1}).filter(n=>n.category==='discovery').length,nearP0);assert.ok(nearP0>=1);
assert.equal(feed.update(at,{minute:2}).filter(n=>n.category==='discovery').length,0,'panorama discovery de-duplicated');
assert.equal(feed.update({...at,coord:[0,0],gradeDeg:25,distanceM:100},{minute:3})[0].severity,'warning');
assert.equal(feed.update({...at,coord:[0,0],gradeDeg:25,distanceM:100},{minute:3}).length,0,'same steep stretch not repeated');
assert.ok(feed.update({...at,coord:[0,0]},{minute:250}).some(n=>n.key==='reserve'));
const sim1=feed.simulate('dust',10);assert.equal(sim1.provenance,'simulated');assert.deepEqual(sim1.actions,['abort']);assert.ok(Object.keys(SIMULATED_EVENTS).length>=3);
assert.throws(()=>feed.push({severity:'bad',provenance:'derived'}));
assert.ok(feed.counts().critical>=1);

// ---- mission log ----
const log=new MissionLog();log.planTasks([{key:'1-photo',stop:'A<b>',name:'Photo'},{key:'1-mineral',stop:'A',name:'Mineral'}]);
log.add('arrive','Arrived at A',{minute:12.34,coord:[77.4,18.4]});log.setTask('1-photo',true,'good <img src=x>');assert.equal(log.setTask('nope',true),false);
const ctx={route:plan,settings,sim:s3,discovered:[1,2],counts:feed.counts(),aborted:false,customPois:[]};
const sum=log.summary(ctx);assert.equal(sum.tasksPlanned,2);assert.equal(sum.tasksCompleted,1);assert.equal(sum.outcome,'Completed and returned to base');
assert.equal(sum.radiationEstimate.provenance,'modeled');assert.ok(sum.radiationEstimate.mSv>0);assert.ok(sum.walkedMeters>0);
const html=log.toPrintableHTML(ctx);assert.ok(!html.includes('<img src=x>')&&!html.includes('A<b>'),'HTML escaped');assert.ok(html.includes('modeled'));
assert.equal(JSON.parse(JSON.stringify(log.toJSON(ctx))).schema,'marswalk.science-log.v1');

// ---- slope router: placeholder, then DEM ----
const ph=await loadTerrain('x',async()=>({ok:false}));assert.equal(ph.mode,'placeholder');assert.match(ph.status,/PLACEHOLDER/);
const ph2=await loadTerrain('x',async()=>{throw new Error('offline')});assert.equal(ph2.mode,'placeholder');
const sp=ph.spur([77.4,18.4],[77.401,18.4],2);assert.equal(sp.slopeChecked,false);assert.ok(sp.minutes>0);
const terrainJson=JSON.parse(fs.readFileSync('scripts/fixtures/synthetic_terrain.json'));
const dem=makeRouter(terrainJson);assert.equal(dem.mode,'dem');
const tb=terrainJson.bounds,mid=[(tb.west+tb.east)/2,(tb.south+tb.north)/2];assert.ok(Number.isFinite(dem.sample.slopeDeg(...mid))&&Number.isFinite(dem.sample.elevM(...mid)));
const sd=dem.spur([tb.west+(tb.east-tb.west)*.1,tb.south+(tb.north-tb.south)*.5],[tb.west+(tb.east-tb.west)*.4,tb.south+(tb.north-tb.south)*.5],2);
assert.equal(sd.slopeChecked,true);assert.ok(sd.distM>0&&sd.minutes>0);
const withDem=describeSite(mid[0],mid[1],{graph:g,panos,base:baseObj,bounds:[tb.west-1,tb.south-1,tb.east+1,tb.north+1],terrain:dem.sample});
assert.equal(withDem.fields.find(f=>f.label==='Slope').provenance,'derived from loaded elevation model');
// custom stop off the corridor gets a labelled spur, with time and distance added
const custom={id:'custom-1',custom:true,name:'Custom point',coord:[base.coord[0]+0.0006,base.coord[1]],node:plan.stops[0].node,tasks:[{id:'photo',min:12}],arrival:5};
const cplan={...plan,stops:[{...custom,node:g.nearest(base.coord)},...plan.stops.slice(1)],legs:plan.legs.map((l,i)=>i===0?{...l,toName:'Custom point'}:l)};
const withSpur=addSpurs(cplan,{speedKmh:2,router:ph,graph:g});
assert.equal(withSpur.spurs.length,1);assert.equal(withSpur.spurs[0].slopeChecked,false);assert.ok(withSpur.distance>cplan.distance);assert.ok(withSpur.minutes>cplan.minutes);
assert.ok(distance(withSpur.legs[0].coords.at(-1),custom.coord)<1,'leg ends at the custom point');
assert.ok(distance(withSpur.legs[1].coords[0],custom.coord)<1,'next leg begins at the custom point');
assert.ok(distance(withSpur.coords[0],cplan.coords[0])<1&&distance(withSpur.coords.at(-1),cplan.coords.at(-1))<1,'still a round trip');
console.log('Simulator: timeline vs playback rate, state machine, abort/return, POI store, site info, notifications, science log/export, slope router (placeholder + DEM) passed.');
{ // fastest abort: direct DEM-verified line beats a longer network path; unverified lines are never used
 const P=[[77.40,18.45],[77.40,18.47],[77.42,18.47],[77.42,18.45]],pts=[];P.slice(0,-1).forEach((a,k)=>{const b=P[k+1];for(let t=0;t<20;t++)pts.push([a[0]+(b[0]-a[0])*t/20,a[1]+(b[1]-a[1])*t/20,0])});pts.push([...P.at(-1),0]);const g3=buildGraph([{geometry:{coordinates:pts}}],[77.39,18.4,77.5,18.5]);assert.ok(g3.edges.length>=50,'graph has edges');
 const here=[77.40,18.45],okDirect={check:()=>({ok:true,maxDeg:4.2})},badDirect={check:()=>({ok:false})};
 const fast=planReturn(g3,here,g3.nodes.length-1,{direct:okDirect});assert.equal(fast.info.mode,'direct');assert.ok(fast.info.meters<fast.info.networkMeters*.95,'direct is shorter');assert.equal(fast.at(-1).shortcut,true);
 assert.equal(planReturn(g3,here,g3.nodes.length-1,{direct:badDirect}).info.mode,'network');assert.equal(planReturn(g3,here,g3.nodes.length-1).info.mode,'network');
 assert.equal(planReturn(g3,here,g3.nodes.length-1,{direct:okDirect,blocked:new Set(g3.edges.map(e=>e.id))}).info.mode,'direct','direct still works if the network is blocked');
 console.log('Fastest abort: direct line chosen only when DEM-verified and clearly shorter.');
}

// Unique point names: two unnamed points must never share a name (routing, the plan panel and CAPCOM find stops by name)
{const mem={};const st={getItem:k=>mem[k]??null,setItem:(k,v)=>{mem[k]=v}};const s=createPoiStore(st);
 const a=s.add({lon:77.4,lat:18.4,name:'Point'}),b=s.add({lon:77.41,lat:18.41,name:'Point'}),c=s.add({lon:77.42,lat:18.42,name:'point'});
 assert.deepEqual([a.name,b.name,c.name],['Point','Point 2','point 3'],'duplicate names get a number');
 assert.equal(s.rename(c.id,'Point 2'),true);assert.equal(s.get(c.id).name,'Point 2 2','renaming into a taken name stays unique');
 const old={'marswalk-custom-pois':JSON.stringify([{id:'custom-1',coord:[77.4,18.4],name:'Name this point'},{id:'custom-2',coord:[77.41,18.41],name:'Name this point'}])};
 const s2=createPoiStore({getItem:k=>old[k]??null,setItem(){}});assert.deepEqual(s2.list().map(p=>p.name),['Name this point','Name this point 2'],'points saved earlier with the same name are made unique on load');
 console.log('Point names: unique on add, rename and load.')}
