import assert from 'node:assert/strict';import {createCostRouter,STYLES} from '../dist/route-cost.js';import {synthTerrain} from './fixtures-synth-terrain.mjs';
// 100x60 cells (2 km x 1.2 km). A steep ridge (30 m high, ~45 deg flanks) runs north-south at x=1000 m, with a low saddle at y=900 m.
const ridge=(x,y)=>{const sad=Math.exp(-(((y-900)/160)**2));return 30*Math.exp(-(((x-1000)/30)**2))*(1-.95*sad)};
const T=synthTerrain(100,60,ridge),A=T.at(200,300),B=T.at(1800,300),Fl=synthTerrain(100,60,()=>0);
// flat ground: straight line, cost ~ distance
{const R=createCostRouter(Fl,{limitDeg:20,speedKmh:2}),t=R.tree(Fl.at(100,600)).to(Fl.at(1900,600));assert.ok(t.distance>1790&&t.distance<1900,'flat route is near straight: '+t.distance);
 assert.ok(Math.abs(t.minutes-t.distance/2000*60)<1,'flat time = distance / speed');assert.ok(t.maxSlopeDeg<1&&t.ascent<1);
 assert.ok(t.kcal>100&&t.kcal<200,'about 80 kcal per km for 100 kg: '+t.kcal.toFixed(0))}
// the ridge is steeper than the limit: the straight line is not allowed, the route goes through the saddle
{const R=createCostRouter(T,{limitDeg:20,speedKmh:2}),p=R.tree(A).to(B),s=R.straight(A,B);
 assert.ok(s.overLimitMeters>20,'direct line crosses ground over the limit: '+s.overLimitMeters);assert.ok(p&&p.maxSlopeDeg<=20,'route respects the limit');
 assert.ok(p.distance>s.distance*1.15,'route detours via the saddle: '+p.distance+' vs '+s.distance);
 assert.ok(p.coords.some(c=>{const y=(18.45+30*20/(3396190*Math.PI/180)-c[1])*3396190*Math.PI/180;return y>700&&y<1100}),'it crosses near the saddle')}
// looser limit lets it go over the ridge; stricter limit still finds the saddle
{const hi=createCostRouter(T,{limitDeg:60}).tree(A).to(B),lo=createCostRouter(T,{limitDeg:12}).tree(A).to(B);assert.ok(hi&&lo);assert.ok(hi.distance<=lo.distance+1,'looser limit never makes the route longer')}
// styles: least effort never uses more energy than least time outside, and least time is never slower
{const hill=synthTerrain(100,60,(x,y)=>12*Math.sin(x/260)*Math.cos(y/220));const E=createCostRouter(hill,{limitDeg:25,style:'effort'}),F=createCostRouter(hill,{limitDeg:25,style:'fast'}),a=hill.at(100,100),b=hill.at(1900,1000);
 const pe=E.tree(a).to(b),pf=F.tree(a).to(b);assert.ok(pe.kcal<=pf.kcal+1e-6,'effort style: kcal '+pe.kcal+' <= '+pf.kcal);assert.ok(pf.minutes<=pe.minutes+1e-6,'fast style: minutes '+pf.minutes+' <= '+pe.minutes)}
// uphill vs downhill are not the same cost (Minetti is directional): trip up costs more energy than the way back down only if steep enough
{const slopeT=synthTerrain(100,60,x=>x*0.12);const R=createCostRouter(slopeT,{limitDeg:20}),up=R.tree(slopeT.at(200,600)).to(slopeT.at(1800,600)),down=R.tree(slopeT.at(1800,600)).to(slopeT.at(200,600));
 assert.ok(up.ascent>150&&down.ascent<5,'ascent counted per direction');assert.ok(up.kcal>down.kcal*1.3,'climbing costs more energy than descending: '+up.kcal.toFixed(0)+' vs '+down.kcal.toFixed(0))}
// reverse tree gives cost-to-destination paths in travel order, ending at the destination
{const R=createCostRouter(T,{limitDeg:20}),rev=R.tree(B,{reverse:true}),p=rev.from(A);assert.ok(p&&p.coords.length>3);const first=p.coords[0],last=p.coords.at(-1);assert.ok(Math.hypot(first[0]-A[0],first[1]-A[1])<5e-4&&Math.hypot(last[0]-B[0],last[1]-B[1])<5e-4,'from A to B')}
// blocking a disc across the saddle forces a different (longer or impossible) route and invalidates cached trees
{const R=createCostRouter(T,{limitDeg:20}),p0=R.tree(A).to(B),mid=p0.edgeIds[Math.floor(p0.edgeIds.length/2)];const v=R.version;const n=R.setBlocked([mid],80);assert.ok(n>5&&R.version>v);const p1=R.tree(A).to(B);assert.ok(!p1||p1.edgeIds.indexOf(mid)<0,'new route avoids the blocked disc');R.setBlocked([]);assert.equal(R.blockedCount(),0)}
// endpoints outside the DEM give no route; unreachable (walled off) gives null
{const R=createCostRouter(T,{limitDeg:20});assert.equal(R.tree([10,10]).to(B),null);assert.equal(R.tree(A).to([10,10]),null)}
// planner integration: the stop behind the ridge is reached through the saddle, legs carry cost metrics, return leg is counted
{const {planMission,setPathRouter}=await import('../dist/routing.js');const R=createCostRouter(T,{limitDeg:20});setPathRouter(R);
 const base={id:0,node:0,name:'Base',coord:A},mk=(id,name,c)=>({id,node:id,name,coord:c,tasks:[{id:'visit',name:'Visit',min:10}]});
 const plan=planMission(null,base,[mk(1,'Behind ridge',B),mk(2,'Near',T.at(500,350))],{maxDistance:20000,budget:600,speed:2,maxGrade:20,preference:'science',ids:['visit'],routeStyle:'balanced'},new Set(),new Set([1]));
 setPathRouter(null);assert.ok(plan.grid&&plan.stops.some(s=>s.name==='Behind ridge'),'reaches the far stop');assert.ok(plan.legs.every(l=>l.grid&&l.cost>0&&l.minutes>0&&l.kcal>0),'legs carry cost metrics');
 assert.ok(plan.legs.length===plan.stops.length+1&&plan.legs.at(-1).toName==='Base','return leg included');assert.ok(plan.minutes>plan.legs.reduce((v,l)=>v+l.minutes,0),'science time on top of walking');assert.ok(plan.kcal>50);
 const sameSig=R.setBlocked([]);assert.equal(sameSig,0)}
assert.ok(STYLES.balanced&&STYLES.effort&&STYLES.fast&&STYLES.safe);
console.log('Route cost: steep ground forbidden, detours through the saddle, directional effort, styles weigh effort vs time, blocking works.');
