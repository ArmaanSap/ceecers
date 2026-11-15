// Energy cost of walking a route, from the published Minetti et al. (2002) walking cost-vs-gradient polynomial
// (J per kg per metre, gradient i = rise/run, valid for about -0.45..+0.45). It is a PHYSICS model with a published fit, not machine learning.
// It is an EARTH-gravity, unsuited-walker baseline: Mars gravity and a pressurised suit change the real cost, and neither is modelled here.
// Use it to compare routes (uphill-heavy vs flat), not as a consumables or oxygen figure.
import {densify,heightAtLocal} from './dem3d-math.js';
export const walkCostJPerKgM=i=>{const g=Math.max(-.45,Math.min(.45,i));return 280.5*g**5-58.7*g**4-76.8*g**3+51.9*g**2+19.6*g+2.5};
const J_PER_KCAL=4184;
// coords [[lon,lat],...] in walking order. Returns null when too little of the route is inside the DEM.
export function routeEffort(D,coords,{massKg=100,stepM=20}={}){
 if(!D||!coords||coords.length<2)return null;
 const pts=densify(D,coords,stepM);if(pts.length<2)return null;
 let joules=0,meters=0,climb=0,descent=0,hardest=0,hardestAt=0,used=0;
 for(let k=1;k<pts.length;k++){
  const a=pts[k-1],b=pts[k],d=Math.hypot(b.x-a.x,b.z-a.z);if(!(d>0))continue;
  const za=heightAtLocal(D,a.x,a.z),zb=heightAtLocal(D,b.x,b.z);if(!Number.isFinite(za)||!Number.isFinite(zb))continue;
  const i=(zb-za)/d,c=walkCostJPerKgM(i)*massKg*d;joules+=c;meters+=d;used++;
  if(zb>za)climb+=zb-za;else descent+=za-zb;
  if(c/d>hardest){hardest=c/d;hardestAt=meters}
 }
 if(!used||meters<=0)return null;
 const flat=walkCostJPerKgM(0)*massKg*meters;
 return {kcal:joules/J_PER_KCAL,meters,climbM:climb,descentM:descent,extraVsFlatPct:(joules/flat-1)*100,hardestAtMeters:hardestAt,massKg,note:'Earth-gravity walking cost (Minetti 2002); Mars gravity and suit not modelled'};
}
