// Four alternative routes for the SAME stops, each with a number-based reason it was not the pick.
// Alternatives are cross-country paths planned on the DEM slope grid (the rover track network is nearly a single line,
// so it has no real alternatives). They are a slope-only model: rocks and sand are not in the data, and nothing here is rover-verified.
import {distance,panoramaSequence} from './routing.js';
import {chainRoute} from './dem-path.js';

export function offTrackMeters(g,coords,{stepM=25,toleranceM=45}={}){
 let off=0,carry=0;for(let k=1;k<coords.length;k++){const a=coords[k-1],b=coords[k],d=distance(a,b),n=Math.max(1,Math.round(d/stepM));
  for(let s=0;s<n;s++){const t=(s+.5)/n,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],near=g.nodes[g.nearest(p)];if(distance(p,near)>toleranceM)off+=d/n}}
 return off+carry;
}
export function planMetrics(g,{coords,distance:dist,minutes},{panos=[],slopeOf=null}={}){
 const sc=slopeOf?slopeOf(coords):null;
 return {distance:dist,minutes,maxDeg:sc&&Number.isFinite(sc.maxDeg)?sc.maxDeg:null,meanDeg:sc&&Number.isFinite(sc.meanDeg)?sc.meanDeg:null,
  overLimitMeters:sc?.overLimitMeters??null,views:panoramaSequence(coords,panos).length,offTrack:offTrackMeters(g,coords)};
}
const km=m=>(m/1000).toFixed(2)+' km',deg=d=>d.toFixed(1)+'°';
export function compareMetrics(chosen,alt){
 const worse=[],better=[],dd=alt.distance-chosen.distance,dm=alt.minutes-chosen.minutes;
 if(Math.abs(dd)>=25)(dd>0?worse:better).push(`${dd>0?'longer':'shorter'} by ${Math.round(Math.abs(dd))} m`);
 if(Math.abs(dm)>=1)(dm>0?worse:better).push(`${dm>0?'slower':'faster'} by ${Math.round(Math.abs(dm))} min`);
 if(alt.maxDeg!=null&&chosen.maxDeg!=null&&Math.abs(alt.maxDeg-chosen.maxDeg)>=.5)(alt.maxDeg>chosen.maxDeg?worse:better).push(`${alt.maxDeg>chosen.maxDeg?'steeper':'gentler'} worst point (${deg(alt.maxDeg)} vs ${deg(chosen.maxDeg)})`);
 if(alt.meanDeg!=null&&chosen.meanDeg!=null&&Math.abs(alt.meanDeg-chosen.meanDeg)>=.3)(alt.meanDeg>chosen.meanDeg?worse:better).push(`${alt.meanDeg>chosen.meanDeg?'steeper':'gentler'} on average`);
 const dv=alt.views-chosen.views;if(dv!==0)(dv<0?worse:better).push(`${dv<0?'fewer':'more'} photo sites (${alt.views} vs ${chosen.views})`);
 const dt=alt.offTrack-chosen.offTrack;if(dt>=50)worse.push(`${Math.round(alt.offTrack)} m off the recorded rover track`);else if(dt<=-50)better.push(`${Math.round(-dt)} m more on recorded track`);
 return {worse,better};
}
export function whyNotChosen(cmp){
 if(cmp.worse.length&&cmp.better.length)return `Not chosen: ${cmp.worse.join('; ')}. Upside: ${cmp.better.join('; ')}.`;
 if(cmp.worse.length)return `Not chosen: ${cmp.worse.join('; ')}. No upside we measure.`;
 if(cmp.better.length)return `Better on: ${cmp.better.join('; ')}, but off the recorded track.`;
 return 'Not chosen: same on every measured value.';
}
const perms=a=>a.length<=1?[a]:a.flatMap((x,i)=>perms([...a.slice(0,i),...a.slice(i+1)]).map(p=>[x,...p]));
// chosen: {coords,distance,minutes,stops:[{name,coord}]}; s: settings (speed km/h, maxGrade)
export function alternativeRoutes(D,g,base,chosen,s,{panos=[],slopeOf=null,max=4}={}){
 const stops=chosen.stops.filter(p=>p.coord).map(p=>({name:p.name,coord:[p.coord[0],p.coord[1]]})),cm=planMetrics(g,chosen,{panos,slopeOf});
 const lim=Math.min(20,s.maxGrade||20),mPerMin=s.speed*1000/60,baseC=[base[0],base[1]];
 const orderKey=o=>o.map(p=>p.name).join('>');
 const rev=[...stops].reverse(),straight=o=>[baseC,...o.map(p=>p.coord),baseC].reduce((t,p,i,a)=>i?t+distance(a[i-1],p):0,0);
 let best=stops;if(stops.length>=2&&stops.length<=5)best=perms(stops).sort((a,b)=>straight(a)-straight(b))[0];
 const variants=[
  {label:'Direct cross-country',how:'shortest path on the DEM, any ground up to '+lim+'°',order:stops,opt:{limitDeg:lim,penalty:0}},
  {label:'Gentlest cross-country',how:'strongly avoids steep ground',order:stops,opt:{limitDeg:lim,penalty:8,refDeg:10}},
  {label:'Cautious cross-country',how:'never above 10° on the DEM',order:stops,opt:{limitDeg:10,penalty:2,refDeg:10}},
  stops.length>=2?{label:'Reverse stop order',how:'visits the same stops in the opposite order',order:rev,opt:{limitDeg:lim,penalty:2,refDeg:10}}:{label:'Balanced cross-country',how:'trades distance against slope',order:stops,opt:{limitDeg:lim,penalty:2,refDeg:10}},
  stops.length>=2&&orderKey(best)!==orderKey(stops)&&orderKey(best)!==orderKey(rev)?{label:'Shortest stop order',how:'reorders stops to cut straight-line travel',order:best,opt:{limitDeg:lim,penalty:2,refDeg:10}}:null,
  {label:'Balanced cross-country',how:'trades distance against slope',order:stops,opt:{limitDeg:lim,penalty:2,refDeg:10}},
  {label:'Moderate-limit cross-country',how:'never above 15° on the DEM',order:stops,opt:{limitDeg:15,penalty:1,refDeg:10}}
 ].filter(Boolean);
 const out=[],seen=[];
 for(const v of variants){
  if(out.length>=max)break;
  const r=chainRoute(D,baseC,v.order.map(p=>p.coord),v.opt);if(!r)continue;
  const minutes=chosen.minutes+(r.distance-chosen.distance)/mPerMin,m=planMetrics(g,{coords:r.coords,distance:r.distance,minutes},{panos,slopeOf});
  const sig={o:orderKey(v.order),d:r.distance,x:m.maxDeg};
  if(seen.some(q=>q.o===sig.o&&Math.abs(q.d-sig.d)/sig.d<.02&&Math.abs((q.x??0)-(sig.x??0))<.5))continue;
  if(Math.abs(r.distance-chosen.distance)/chosen.distance<.005&&m.offTrack<50)continue; // same as chosen
  seen.push(sig);const cmp=compareMetrics(cm,m);
  out.push({label:v.label,how:v.how,order:v.order.map(p=>p.name),coords:r.coords,metrics:m,better:cmp.better,worse:cmp.worse,why:whyNotChosen(cmp),modelled:true});
 }
 return {chosen:cm,alternatives:out};
}
