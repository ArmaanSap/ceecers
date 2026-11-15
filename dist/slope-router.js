// Bridge to the slope-based pathfinding module (pathfinding.mjs).
// Until a real DEM terrain.json is supplied (see docs/PATHFINDING.md) this stays in PLACEHOLDER mode:
// the app keeps using rover-corridor routing, off-corridor legs are straight lines and are labelled unmodelled.
import {createPlanner,lonLatToCell,cellSlopeDeg} from './pathfinding.mjs';
import {distance} from './routing.js';
import {classIndex,CLASSES} from './traversability.js';

export const SLOPE_LIMIT_DEG=20;   // planning assumption, not a NASA suit specification

export async function loadTerrain(url='assets/terrain.json',fetchFn=globalThis.fetch){
 try{const r=await fetchFn(url);if(!r.ok)return placeholder('no terrain file');return makeRouter(await r.json())}
 catch(e){return placeholder(String(e?.message||e))}
}
function placeholder(reason){return {mode:'placeholder',reason,model:null,sample:null,spur:(from,to,speed)=>straightSpur(from,to,speed),status:'PLACEHOLDER · slope DEM not loaded. Routes follow the recorded rover corridor. Off-corridor legs are unmodelled straight lines.'}}
// Check a finished route against the DEM: how steep is the ground it actually crosses?
export function checkRouteSlope(router,coords,limitDeg=SLOPE_LIMIT_DEG){
 if(!router?.sample||!coords?.length)return null;let max=0,over=0,total=0,sum=0,n=0,outside=0;const classMeters=CLASSES.map(()=>0);
 for(let i=1;i<coords.length;i++){const a=coords[i-1],b=coords[i],d=distance(a,b);total+=d;const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],s=router.sample.slopeDeg(mid[0],mid[1]);
  if(!Number.isFinite(s)){outside+=d;continue}max=Math.max(max,s);sum+=s*d;n+=d;classMeters[classIndex(s)]+=d;if(s>limitDeg)over+=d}
 return {maxDeg:max,meanDeg:n?sum/n:0,classMeters,overLimitMeters:over,outsideMeters:outside,totalMeters:total,limitDeg,source:'20 m CTX DEM cell slope at each segment midpoint'};
}
export function straightSpur(from,to,speedKmh){
 const d=distance(from,to);return {coords:[from,to],distM:d,minutes:d/(speedKmh*1000)*60,slopeChecked:false,note:'Straight line, slope not modelled'};
}
export function makeRouter(terrainJson,{maxSlopeDeg=SLOPE_LIMIT_DEG}={}){
 const srcName=typeof terrainJson.source==='object'&&terrainJson.source?(terrainJson.source.dem||'DEM'):String(terrainJson.source||'');
 const planners=new Map(),get=speed=>{if(!planners.has(speed))planners.set(speed,createPlanner(terrainJson,{baseSpeedKmh:speed,maxSlopeDeg}));return planners.get(speed)};
 const T=get(2).terrain;
 const cell=(lon,lat)=>{const i=lonLatToCell(T,lon,lat);return i>=0&&i<T.W*T.H?i:-1};
 const sample={
  slopeDeg:(lon,lat)=>{const i=cell(lon,lat);return i<0?NaN:cellSlopeDeg(T,i)},
  // A detrended DEM has relative heights. With terrainJson.elevFit (plane fitted to recorded rover elevations, see scripts/fit_elevation.mjs) we return fitted absolute elevation; without it, NaN.
  elevM:(lon,lat)=>{const i=cell(lon,lat);if(i<0)return NaN;if(!/detrend/i.test(srcName))return T.elev[i];const f=terrainJson.elevFit,b=terrainJson.bounds;if(!f||!b)return NaN;
   const x=(lon-b.west)/(b.east-b.west)*((b.east-b.west)*Math.PI/180*3396190*Math.cos((b.south+b.north)/2*Math.PI/180))/1000,y=(b.north-lat)*Math.PI/180*3396190/1000;return T.elev[i]+f.a+f.b*x+f.c*y},
  elevNote:/detrend/i.test(srcName)&&terrainJson.elevFit?`absolute elevation fitted to ${terrainJson.elevFit.points} recorded rover points (±${terrainJson.elevFit.rmsM} m RMS, in-sample)`:null
 };
 // Slope-aware one-way leg between two points; falls back to a labelled straight line if no passable path exists.
 function spur(from,to,speedKmh){
  try{
   const p=get(speedKmh),plan=p.plan({base:{lon:from[0],lat:from[1]},stops:[{id:'s',lon:to[0],lat:to[1],value:1,durationMin:0}],budgetMin:1e5,reserveFrac:0});
   if(!plan.feasible||!plan.route?.coords?.length)return {...straightSpur(from,to,speedKmh),note:'No slope-feasible path found; straight line shown, slope not verified'};
   const out=plan.legs[0],cum=plan.route.cumDistM;let cut=cum.findIndex(c=>c>=out.distM-1e-6);if(cut<0)cut=cum.length-1;
   return {coords:plan.route.coords.slice(0,cut+1),distM:out.distM,minutes:out.timeMin,slopeChecked:true,maxSlopeDeg:plan.totals.maxCellSlopeDeg,note:'DEM slope-checked path'};
  }catch{return straightSpur(from,to,speedKmh)}
 }
 return {mode:'dem',raw:terrainJson,model:srcName||'DEM terrain model',sample,spur,planner:get,status:`DEM slope model active (${srcName||'source not stated'}, 20 m cells). Slope limit ${maxSlopeDeg}° is a planning assumption.`};
}

// Adds out-and-back spurs for custom points that are not on the recorded rover network.
// Mutates a copy of the plan: adds distance/minutes and spur coordinates to its legs.
export function addSpurs(plan,{speedKmh,router,graph}){
 if(!plan?.legs?.length)return plan;
 const out={...plan,legs:plan.legs.map(l=>({...l})),stops:plan.stops.map(s=>({...s})),spurs:[]};
 let extraM=0,extraMin=0;
 out.legs.forEach((leg,i)=>{
  const stop=out.stops.find(s=>s.name===leg.toName&&s.custom);if(!stop)return;
  const anchor=graph.nodes[stop.node],off=distance(anchor,stop.coord);if(off<5)return;
  const s=router.spur(anchor,stop.coord,speedKmh);
  const there=s.coords,back=[...s.coords].reverse(),next=out.legs[i+1];
  leg.coords=[...leg.coords,...there.slice(1)];leg.distance+=s.distM;leg.slopeChecked=s.slopeChecked;
  if(next){next.coords=[...back,...next.coords.slice(1)];next.distance+=s.distM;next.spurBack=s.distM}
  extraM+=s.distM*2;extraMin+=s.minutes*2;
  out.spurs.push({stop:stop.name,oneWayMeters:s.distM,slopeChecked:s.slopeChecked,note:s.note});
 });
 out.distance+=extraM;out.minutes+=extraMin;out.coords=out.legs.reduce((c,l)=>{c.push(...l.coords.slice(c.length?1:0));return c},[]);
 out.spurMeters=extraM;return out;
}
