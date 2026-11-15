// Map notes for a planned route: numbered points at turns, stop arrivals and the steepest ground. Each note carries the
// measured numbers (distance, time, slope) and short "why" tags. Everything is computed from the route and the DEM;
// the radiation tag is a REFERENCE rate times time outside, labelled as such, not a Jezero measurement.
import {distance} from './routing.js';
export const RAD_MSV_PER_DAY=0.67; // Curiosity RAD, Gale Crater (same figure the conditions panel cites)
export const MAX_NOTES=14;
const r0=v=>Math.round(v),fmtM=m=>m<1000?`${Math.max(5,Math.round(m/5)*5)} m`:`${(m/1000).toFixed(2)} km`;
export function coordAt(legs,meters){
 let acc=0;for(const l of legs){const c=l.coords;for(let i=1;i<c.length;i++){const d=distance(c[i-1],c[i]);if(acc+d>=meters&&d>0){const t=(meters-acc)/d;return [c[i-1][0]+(c[i][0]-c[i-1][0])*t,c[i-1][1]+(c[i][1]-c[i-1][1])*t]}acc+=d}}
 const last=legs.at(-1)?.coords.at(-1);return last?[last[0],last[1]]:null;
}
const legLen=l=>{let t=0;for(let i=1;i<l.coords.length;i++)t+=distance(l.coords[i-1],l.coords[i]);return t};
// opts: {slopeAt(lon,lat)->deg|NaN, limitDeg, panos:[{name,coord}], speedKmh, base:[lon,lat]}
export function buildRouteNotes(route,{slopeAt=null,limitDeg=null,panos=[],speedKmh=2,base=null,terrainAt=null}={}){
 if(!route?.legs?.length)return [];
 const legs=route.legs,lens=legs.map(legLen),total=lens.reduce((a,b)=>a+b,0),start=[];let acc=0;lens.forEach(l=>{start.push(acc);acc+=l});
 const baseC=base||legs[0].coords[0].slice(0,2);
 // minutes at a distance along the route: walking time plus science time at stops already passed
 const minuteAt=m=>{let sci=0;legs.forEach((l,i)=>{if(start[i]+lens[i]<=m+0.5)sci+=l.scienceMinutes||0});return m/(speedKmh*1000)*60+sci};
 const slopeTxt=c=>{const s=slopeAt?.(c[0],c[1]);return Number.isFinite(s)?s:null};
 const view=c=>{let best=null;for(const p of panos){const d=distance(c,p.coord);if(!best||d<best.d)best={d,p}}return best&&best.d<=250?best:null};
 const mk=(kind,title,atMeters,summary,legIndex,extra={})=>{
  const coord=extra.coord||coordAt(legs,atMeters);if(!coord)return null;
  const min=minuteAt(atMeters),s=slopeTxt(coord),v=view(coord),leftM=Math.max(0,total-atMeters),home=distance(coord,baseC);
  const li=Math.min(legIndex,legs.length-1),legM=lens[li],legAt=atMeters-start[li];
  const why=[];
  // Traversability
  const spur=!!legs[li].spur||!!extra.spur;
  why.push({tag:'Traversability',text:[
   s==null?'Slope here is not available from the DEM.':`DEM slope here is about ${s.toFixed(1)}°${limitDeg?` (your limit is ${limitDeg}°)`:''}.`,
   route.grid?'The route was searched over the whole elevation model by effort, time and slope margin; it does not follow the rover. The 20 m DEM cannot see rocks or sand, so check it on the ground.':spur?'This stretch is an off-track spur checked against the DEM, not recorded rover ground.':'The route follows ground the rover actually drove, which is the best evidence we have that it is passable.'].join(' ')});
  // Radiation (reference rate x time outside)
  const dose=RAD_MSV_PER_DAY*min/1440;
  why.push({tag:'Radiation',text:`Reference rate ${RAD_MSV_PER_DAY} mSv/day (Curiosity RAD at Gale). After ${r0(min)} min outside that is about ${dose<0.01?'<0.01':dose.toFixed(2)} mSv. It is a reference, not a Jezero measurement, and the planner does not route around radiation: less time outside is the only lever, so shorter legs mean less dose.`});
  // Distance and time
  why.push({tag:'Distance & time',text:`${fmtM(atMeters)} along the route, ${fmtM(leftM)} to go; ${home<40?'at the base':fmtM(home)+' straight back to base'}. About ${r0(min)} min into the mission at ${speedKmh} km/h plus science time.`});
  const tr=v&&terrainAt?.(v.p);if(tr)why.push({tag:'Terrain AI',text:`Our model (SegFormer-B0 fine-tuned on NASA AI4Mars) reads ${tr.loose}% loose ground and ${tr.rock}% rock in the ${v.p.name} panorama, ${fmtM(v.d)} away. In our own hand check it was about 81% right on rock vs loose and tended to under-report rock.`});
  if(v)why.push({tag:'Views',text:`${v.p.name} is ${fmtM(v.d)} away: a real Mastcam-Z panorama of this ground.`});
  if(extra.why)why.unshift(...extra.why);
  return {kind,title,summary,atMeters,coord,leg:li,minute:r0(min),slopeDeg:s,legMeters:legM,legAtMeters:legAt,remainingMeters:leftM,why};
 };
 const notes=[],legX=i=>(route.explanations||[]).find(x=>(x.kind==='detour'||x.kind==='direct')&&x.leg===i);
 // stop / base arrivals
 legs.forEach((l,i)=>{
  const last=i===legs.length-1,name=last?'Martian Base':l.toName,stop=route.stops?.find(s=>s.name===l.toName);
  const tasks=stop?.tasks?.length?stop.tasks.map(t=>t.name).join(', '):'';
  const lx=legX(i),route_=lx?[{tag:'Why this way',text:lx.why}]:[],how=i===0&&route.costSummary?[{tag:'How it was chosen',text:`Cheapest walkable path over the whole DEM (${route.costSummary.style} style: effort, time, slope margin). Whole route about ${Math.round(route.costSummary.kcal)} kcal, steepest ${route.costSummary.maxSlopeDeg.toFixed(1)}°; a straight line between the same stops would cross ${Math.round(route.costSummary.directOverLimitMeters)} m of ground over your slope limit.`}]:[];
  const why=[...route_,...how,...(last?[{tag:'Reserve',text:'The planner only adds a stop if you can still walk home with the reserve you set, so this return leg is always accounted for.'}]:[{tag:'Why this stop',text:`You chose it${tasks?` for ${tasks}`:''}${stop?.alsoHere?.length?` (also covers ${stop.alsoHere.join(', ')}, which are within 25 m)`:''}. Stops are ordered by value for the walking they cost, then checked against your distance and time limits.`}])];
  const n=mk(last?'return':'stop',last?'Back at Martian Base':`Arrive: ${name}`,start[i]+lens[i],last?`Leg ${i+1} is ${fmtM(lens[i])}. Mission total ${fmtM(total)}.`:`Leg ${i+1} is ${fmtM(lens[i])}${l.scienceMinutes?`, then ${l.scienceMinutes} min of science here`:''}.`,i,{why});if(n)notes.push(n);
 });
 // turns, detours, retraces and spurs already verified by route-explain
 (route.explanations||[]).forEach(x=>{if(['order','cost','direct','detour'].includes(x.kind))return;const li=Math.min(x.leg??0,legs.length-1);
  const n=mk(x.kind==='turn'?'turn':'path',x.title,x.atMeters,x.text,li,{coord:x.coord||null,spur:x.kind==='spur',why:[{tag:'Why this path',text:x.text}]});if(n)notes.push(n)});
 // steepest point on the route
 if(slopeAt){let best=null,acc2=0;for(let d=0;d<=total;d+=25){const c=coordAt(legs,d),s=c&&slopeAt(c[0],c[1]);if(Number.isFinite(s)&&(!best||s>best.s))best={s,d,c}}
  if(best&&best.s>=1){const li=Math.max(0,start.findIndex((s0,i)=>best.d>=s0&&best.d<=s0+lens[i]));const over=limitDeg&&best.s>limitDeg;
   const n=mk('slope',`Steepest ground (${best.s.toFixed(1)}°)`,best.d,over?`This is above your ${limitDeg}° limit; check the plan panel.`:`The steepest DEM cell the route crosses${limitDeg?`, under your ${limitDeg}° limit`:''}.`,li,{coord:best.c,why:[{tag:'Traversability',text:`DEM cells are 20 m, so this is an average over a patch, not a rock-by-rock reading. ${over?'It exceeds the limit, so treat this stretch with caution.':'It is within your limit.'}`}]});if(n)notes.push(n)}}
 // keep the most useful, in route order, and number them
 const rank={return:0,stop:1,slope:2,turn:3,path:4};
 const kept=notes.sort((a,b)=>a.atMeters-b.atMeters).filter((n,i,arr)=>arr.findIndex(m=>m.kind===n.kind&&Math.abs(m.atMeters-n.atMeters)<30&&m.title===n.title)===i);
 const picked=kept.length>MAX_NOTES?[...kept].sort((a,b)=>rank[a.kind]-rank[b.kind]||a.atMeters-b.atMeters).slice(0,MAX_NOTES).sort((a,b)=>a.atMeters-b.atMeters):kept;
 return picked.map((n,i)=>({...n,id:'rn-'+(i+1),n:i+1}));
}
// The one-line question sent to live CAPCOM for a note (the server caps questions at 300 characters).
export function noteQuestion(n){
 const f=`${n.title}. ${n.summary} Slope ${n.slopeDeg==null?'unknown':n.slopeDeg.toFixed(1)+'°'}, ${fmtM(n.atMeters)} along, ${r0(n.minute)} min in.`;
 return `Explain this point on my route in two plain sentences, covering why the planner went this way: ${f}`.slice(0,300);
}
// The same facts as plain text, shown instantly and used when live CAPCOM is offline.
export const noteText=n=>`${n.summary} ${n.why.map(w=>`${w.tag}: ${w.text}`).join(' ')}`;

// Ground along the route as read by our model: sample every `step` m, take the nearest panorama within `reach` m, average its shares.
export function groundAlongRoute(route,{panos=[],terrainAt=null,step=50,reach=250}={}){
 if(!route?.legs?.length||!terrainAt)return null;
 const lens=route.legs.map(legLen),total=lens.reduce((a,b)=>a+b,0),used=new Map();let n=0,loose=0,rock=0;
 for(let d=0;d<=total;d+=step){const c=coordAt(route.legs,d);if(!c)continue;let best=null;for(const p of panos){const e=distance(c,p.coord);if(e<=reach&&(!best||e<best.e))best={e,p}}
  const t=best&&terrainAt(best.p);if(!t)continue;n++;loose+=t.loose;rock+=t.rock;used.set(best.p.name,(used.get(best.p.name)||0)+1)}
 return n?{loose:Math.round(loose/n),rock:Math.round(rock/n),panoramas:[...used.keys()],samples:n}:null;
}
