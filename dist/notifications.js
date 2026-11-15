// Mission notification feed. Every item carries a severity, a source and a provenance label:
//   historical = a real recorded observation, modeled = derived/scaled from cited data,
//   simulated  = a drill with no real-world basis, derived = computed from the plan/route itself.
// No live Mars feed exists; nothing here is operational clearance.
import {distance} from './routing.js';

export const SEVERITIES=Object.freeze(['info','caution','warning','critical']);
export const PROVENANCE=Object.freeze(['historical','modeled','simulated','derived']);
export const DISCOVERY_RADIUS_M=60;
export const GALE_RAD_MSV_DAY=0.67;   // Curiosity RAD, Gale Crater 2012-2013. Different site; context only.

export const SIMULATED_EVENTS=Object.freeze({
 dust:{severity:'critical',category:'atmosphere',title:'Simulated dust-storm warning',body:'Drill only: optical depth rising. In a real mission this would trigger the abort-and-return decision. Recommend aborting to base.',source:'MARVIN drill (no real data)',abort:true},
 solar:{severity:'warning',category:'radiation',title:'Simulated solar-particle event',body:'Drill only: elevated radiation. Limit time outside and consider returning to base.',source:'MARVIN drill (no real data)',abort:true},
 suit:{severity:'caution',category:'safety',title:'Simulated suit-pressure drift',body:'Drill only: minor drift in a suit parameter. Verify with the buddy check.',source:'MARVIN drill (no real data)',abort:false}
});

export class NotificationFeed{
 constructor({panos=[],slopeLimitDeg=20,reserveMinutes=0,missionMinutes=0}={}){
  this.panos=panos;this.slopeLimit=slopeLimitDeg;this.reserveAt=missionMinutes-reserveMinutes;this.items=[];this.seen=new Set();this.counter=0;this.discovered=new Set();this.onChange=()=>{};
 }
 push(n){
  if(n.key){if(this.seen.has(n.key))return null;this.seen.add(n.key)}
  if(!SEVERITIES.includes(n.severity)||!PROVENANCE.includes(n.provenance))throw new Error('notification needs a valid severity and provenance');
  const item={id:++this.counter,minute:0,actions:[],...n};this.items.push(item);this.onChange(item);return item;
 }
 start(){
  this.push({key:'rad-context',severity:'info',category:'radiation',title:'Radiation context',provenance:'historical',source:'NASA / Curiosity RAD (Gale Crater)',body:`Curiosity measured an average of ${GALE_RAD_MSV_DAY} mSv/day at Gale Crater (2012–2013). Jezero has no live dose feed here; this is a different site and not a suit-dose prediction.`});
  this.push({key:'dust-context',severity:'info',category:'atmosphere',title:'Dust context',provenance:'historical',source:'JGR Planets Mastcam-Z / MEDA study',body:'A Jezero dust event peaked around sol 316 at optical depth about 1.4. No current forecast is connected.'});
 }
 // Call each frame with the sim position; returns the notifications raised by this update.
 update(pos,{minute=0}={}){
  const out=[];const add=n=>{const i=this.push({minute,...n});if(i)out.push(i)};
  if(pos.kind==='walk'&&Math.abs(pos.gradeDeg)>=this.slopeLimit)add({key:`steep-${Math.round(pos.distanceM/400)}`,severity:'warning',category:'terrain',title:'Steep recorded grade ahead',provenance:'derived',source:'Recorded rover elevations (traverse data)',body:`Local grade about ${Math.abs(pos.gradeDeg).toFixed(0)}°, above the ${this.slopeLimit}° planning limit. Rocks and sand are not modelled.`});
  for(const p of this.panos){if(this.discovered.has(p.id))continue;if(distance(pos.coord,p.coord)<=DISCOVERY_RADIUS_M){this.discovered.add(p.id);add({key:`pano-${p.id}`,severity:'info',category:'discovery',title:`Panorama discovered: ${p.name}`,provenance:'historical',source:`Mastcam-Z, sol ${p.sol}`,body:'A rover panorama was captured near here. View it, enter VR, or keep walking.',actions:['open','vr','return'],panoramaId:p.id})}}
  if(this.reserveAt>0&&minute>=this.reserveAt)add({key:'reserve',severity:'warning',category:'safety',title:'Return reserve reached',provenance:'derived',source:'Mission plan (20% reserve)',body:'Only the return reserve remains. Head to base.'});
  return out;
 }
 science(stopName,tasks,minute){return this.push({key:`science-${stopName}`,minute,severity:'info',category:'science',title:`Science window: ${stopName}`,provenance:'derived',source:'Mission plan',body:tasks.length?`Proposed: ${tasks.join('; ')}.`:'No tasks planned here.'})}
 simulate(kind,minute=0){const e=SIMULATED_EVENTS[kind];if(!e)return null;return this.push({minute,provenance:'simulated',actions:e.abort?['abort']:[],...e,abort:undefined,key:`sim-${kind}-${++this.counter}`})}
 counts(){const c=Object.fromEntries(SEVERITIES.map(s=>[s,0]));for(const i of this.items)c[i.severity]++;return c}
}
