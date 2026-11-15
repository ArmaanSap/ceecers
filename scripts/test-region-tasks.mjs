import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildGraph,distance,planMission} from '../dist/routing.js';
import {explainRoute} from '../dist/route-explain.js';
import {regionStops,REGIONS} from '../dist/mission-flow.js';
import {MISSION_BASE} from '../dist/mission-base.js';
import {TASKS,VISIT_TASK,taskAvailable,regionHasTask,composeInstructions,buildDirections,tasksForRegion} from '../dist/region-tasks.js';
import {describeSite} from '../dist/site-info.js';
const data=JSON.parse(fs.readFileSync('dist/assets/data.json')),tr=JSON.parse(fs.readFileSync('dist/assets/traverse.json'));
const g=buildGraph(tr.features,data.bounds);
const panos=data.panoramas.map(p=>({...p,node:g.nearest(p.coord)})).filter(p=>distance(p.coord,g.nodes[p.node])<35);
const base=panos.find(p=>p.id===MISSION_BASE.panoramaId);
// seeded rng
const seeded=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};

// 1. every task belongs to exactly one real region; ids unique; every region has several tasks
const ids=TASKS.map(t=>t.id);assert.equal(new Set(ids).size,ids.length);
for(const t of TASKS)assert.ok(REGIONS.some(r=>r.id===t.region),t.id+' has a real region');
for(const r of REGIONS)assert.ok(tasksForRegion(r.id).filter(t=>!t.atBase).length>=3,r.id+' has at least 3 stop tasks');
// 2. a task is only offered where its own region is. The Perseverance handoff exists only in the region of the base.
for(const t of TASKS)for(const r of REGIONS){const stops=regionStops(panos,r.id);const here=regionHasTask(t,panos,MISSION_BASE.panoramaId);
 if(t.region!==r.id&&!t.atBase)assert.ok(!stops.some(p=>p.id!==base.id&&taskAvailable(t,p)),`${t.id} must not apply in ${r.id}`)}
const sample=TASKS.find(t=>t.id==='sample'),baseRegion=REGIONS.find(r=>r.accept(base)).id;
assert.equal(sample.region,baseRegion);
assert.ok(regionHasTask(sample,panos,base.id));
for(const r of REGIONS.filter(r=>r.id!==baseRegion))assert.ok(sample.region!==r.id,'sample not in '+r.id);
assert.ok(!tasksForRegion('floor').some(t=>t.id==='sample')&&!tasksForRegion('upper').some(t=>t.id==='sample'));
// every region still has at least one stop that can take some task
for(const r of REGIONS){const stops=regionStops(panos,r.id).filter(p=>p.id!==base.id);assert.ok(stops.some(p=>TASKS.some(t=>taskAvailable(t,p))),r.id+' has task-capable stops')}

// 3. instructions: same topic every time, different details across draws
for(const t of [...TASKS,VISIT_TASK]){
 const seen=new Set(),a=composeInstructions(t.id,seeded(1));assert.equal(a.name,t.name);assert.ok(a.steps.length>=2&&a.record&&a.note);
 for(let s=1;s<=40;s++){const c=composeInstructions(t.id,seeded(s));assert.equal(c.name,t.name);assert.equal(c.summary,t.summary||c.summary);seen.add(c.target+'|'+c.steps.join('|'))}
 if(t.id!=='sample')assert.ok(seen.size>=4,`${t.id} varies its details (${seen.size} variants)`);
}
assert.ok(/Visual search targets only/.test(composeInstructions('floor-rock').note));
assert.equal(composeInstructions('no-such'),null);
// 4. directions use real facts
const d=buildDirections({stop:base,arrivalHeading:92,next:'Seitah 1',nextBearing:200,nextMeters:850});
assert.ok(d.some(x=>/E \(92°\)/.test(x))&&d.some(x=>/S\w* \(200°\)/.test(x)||/SW|S /.test(x)));
assert.ok(buildDirections({stop:{name:'Mine'},custom:true}).some(x=>/point you placed/.test(x)));
assert.ok(buildDirections({stop:base,returning:true}).some(x=>/back to base/.test(x)));

// 5. site recommendations come only from the clicked point's region
for(const p of panos.filter(p=>p.id!==base.id).slice(0,40)){
 const s=describeSite(p.coord[0],p.coord[1],{graph:g,panos,base,bounds:data.bounds});
 for(const r of s.recommendations.filter(r=>r.id!=='visit'))assert.equal(TASKS.find(t=>t.id===r.id).region,s.region,'recommendation region matches');
}

// 6. route explanations are grounded and bounded
for(const region of ['floor','delta','upper']){
 const tids=TASKS.filter(t=>t.region===region&&!t.atBase).map(t=>t.id);
 const cands=regionStops(panos,region).filter(p=>p.id!==base.id).map(p=>({...p,tasks:TASKS.filter(t=>tids.includes(t.id)&&taskAvailable(t,p))}));
 const s={maxDistance:20000,budget:480,speed:2,maxGrade:90,preference:'panorama',ids:tids};
 const plan=planMission(g,base,cands,s);if(!plan.stops.length)continue;
 const ex=explainRoute(g,plan,{settings:s});
 assert.ok(ex.length<=10);for(const e of ex){assert.ok(e.title&&e.text.length>20&&Number.isFinite(e.atMeters)&&e.atMeters>=0&&e.atMeters<=plan.distance+1);assert.ok(['detour','turn','retrace','spur','joins','order'].includes(e.kind))}
 assert.deepEqual(ex.map(e=>e.atMeters),[...ex.map(e=>e.atMeters)].sort((a,b)=>a-b),'explanations ordered along the route');
 // grade-limit reason is only claimed when it is true
 for(const e of ex)if(/above your/.test(e.text)){const m=/about (\d+)°, above your (\d+)°/.exec(e.text);assert.ok(+m[1]>+m[2])}
}
assert.deepEqual(explainRoute(g,null),[]);
console.log('Region tasks: unique per region, sample handoff only at base region, varied details on a fixed topic, region-based suggestions, grounded route explanations passed.');
