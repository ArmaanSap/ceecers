// Plain-language reasons for a route found by route-cost.js. Every sentence is computed from the route and the DEM, never invented:
// each leg is compared with the straight line between its ends (is it allowed? how much steeper, longer, costlier?), and each real turn
// is explained by what lies straight ahead of it.
import {distance} from './routing.js';
import {STYLES} from './route-cost.js';

const m=v=>v<1000?`${Math.max(5,Math.round(v/5)*5)} m`:`${(v/1000).toFixed(2)} km`,deg=v=>`${v.toFixed(v<10?1:0)}°`,pct=v=>`${Math.round(v)}%`;
const bearing=(a,b)=>{const r=Math.PI/180,y=Math.sin((b[0]-a[0])*r)*Math.cos(b[1]*r),x=Math.cos(a[1]*r)*Math.sin(b[1]*r)-Math.sin(a[1]*r)*Math.cos(b[1]*r)*Math.cos((b[0]-a[0])*r);return (Math.atan2(y,x)/r+360)%360};
const turnBy=(h0,h1)=>{let d=((h1-h0+540)%360)-180;return d}; // + = right
// Douglas-Peucker on a lon/lat polyline with a tolerance in metres, so grid zig-zag is not reported as turns
function simplify(cs,tol){if(cs.length<3)return cs.map((c,i)=>i);const keep=new Set([0,cs.length-1]);
 const dist=(p,a,b)=>{const ax=(a[0]-p[0])*56200,ay=(a[1]-p[1])*59274,bx=(b[0]-p[0])*56200,by=(b[1]-p[1])*59274,dx=bx-ax,dy=by-ay,L=dx*dx+dy*dy;if(!L)return Math.hypot(ax,ay);const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/L));return Math.hypot(ax+t*dx,ay+t*dy)};
 const rec=(i,j)=>{let mx=0,k=-1;for(let q=i+1;q<j;q++){const d=dist(cs[q],cs[i],cs[j]);if(d>mx){mx=d;k=q}}if(mx>tol&&k>0){keep.add(k);rec(i,k);rec(k,j)}};rec(0,cs.length-1);return [...keep].sort((a,b)=>a-b)}
export const DRIVERS={energy:'walking effort (climbing)',time:'time outside (slow ground)',margin:'staying clear of your slope limit',cross:'side-hill walking',rough:'rugged ground'};
export function driversOf(parts){const tot=Object.values(parts).reduce((a,b)=>a+b,0)||1;return Object.entries(parts).map(([k,v])=>({key:k,label:DRIVERS[k],share:v/tot})).sort((a,b)=>b.share-a.share)}

// One leg versus its straight line.
export function legReason(leg,straight,limitDeg){
 const bits=[];
 const facts=`${m(leg.distance)}, about ${Math.round(leg.minutes)} min walking, about ${Math.round(leg.kcal)} kcal (Earth-gravity estimate), climbs ${Math.round(leg.ascent)} m, steepest ground ${deg(leg.maxSlopeDeg)}.`;
 let why;
 if(!straight||straight.outside)why='The straight line leaves the elevation model, so this route stays inside it.';
 else if(straight.blocked)why=`The straight line crosses ground you flagged as blocked, so the route goes around it (${m(leg.distance)} instead of ${m(straight.distance)}).`;
 else if(straight.overLimitMeters>10)why=`A straight line (${m(straight.distance)}) is not allowed: it crosses ${m(straight.overLimitMeters)} of ground steeper than your ${limitDeg}° limit (up to ${deg(straight.maxSlopeDeg)}). This route stays at ${deg(leg.maxSlopeDeg)} or less.`;
 else if(leg.distance>straight.distance*1.06&&leg.cost<straight.cost*0.98){
  const kc=Math.max(0,Math.round(straight.kcal-leg.kcal)),mn=straight.minutes-leg.minutes;
  why=`${pct((leg.distance/straight.distance-1)*100)} longer than a straight line on purpose: the straight line climbs ${Math.round(straight.ascent)} m (to ${deg(straight.maxSlopeDeg)}) while this route climbs ${Math.round(leg.ascent)} m, saving about ${kc} kcal${mn>=1?` and ${Math.round(mn)} min`:''} once slope margin and side-slope are counted.`;
 }else why=`Close to a straight line (${m(straight.distance)}): the ground between is gentle (steepest ${deg(leg.maxSlopeDeg)}), so no detour was cheaper.`;
 const d=driversOf(leg.parts||{}).filter(x=>x.share>=.2&&x.key!=='energy'&&x.key!=='time');
 if(d.length&&straight&&straight.overLimitMeters<=10)bits.push(`Also weighed: ${d.map(x=>x.label).join(' and ')}.`);
 return {facts,why,text:`${why} ${bits.join(' ')}`.trim()};
}
// route: planner output with .grid legs; router: createCostRouter; settings: planner settings
export function explainGridRoute(route,router,{settings={}}={}){
 if(!route?.grid||!route.legs?.length)return [];
 const P=router.params(),limit=P.limitDeg,items=[];let acc=0;const styleLabel=(STYLES[P.style]||STYLES.balanced).label;
 route.legs.forEach((leg,i)=>{
  const a=leg.coords[0],b=leg.coords.at(-1),straight=router.straight(a,b),r=legReason(leg,straight,limit);
  const from=i===0?'Martian Base':route.legs[i-1].toName,to=leg.toName,mid=leg.coords[Math.floor(leg.coords.length/2)];
  items.push({kind:straight&&leg.distance>straight.distance*1.06?'detour':'direct',title:`Leg ${i+1}: ${from} → ${to}`,text:`${r.facts} ${r.text}`,atMeters:acc,leg:i,coord:[mid[0],mid[1]],facts:r.facts,why:r.why});
  // real turns: simplify the grid path, then explain each corner by what lies straight ahead of it
  const idx=simplify(leg.coords,30),cum=[0];for(let k=1;k<leg.coords.length;k++)cum.push(cum[k-1]+distance(leg.coords[k-1],leg.coords[k]));
  const turns=[];
  for(let q=1;q<idx.length-1;q++){const p0=leg.coords[idx[q-1]],p1=leg.coords[idx[q]],p2=leg.coords[idx[q+1]];if(distance(p0,p1)<60||distance(p1,p2)<60)continue;
   const h0=bearing(p0,p1),h1=bearing(p1,p2),t=turnBy(h0,h1);if(Math.abs(t)<50)continue;
   const ahead=router.straight(p1,[p1[0]+Math.sin(h0*Math.PI/180)*150/56200,p1[1]+Math.cos(h0*Math.PI/180)*150/59274]),after=router.straight(p1,[p1[0]+Math.sin(h1*Math.PI/180)*150/56200,p1[1]+Math.cos(h1*Math.PI/180)*150/59274]),side=t>0?'right':'left';
   let why;
   if(ahead.overLimitMeters>10||ahead.blocked)why=`the ground straight ahead is steeper than your ${limit}° limit (up to ${deg(ahead.maxSlopeDeg)})${ahead.blocked?' or blocked':''}.`;
   else if(ahead.maxSlopeDeg>limit*0.7)why=`the ground straight ahead steepens to ${deg(ahead.maxSlopeDeg)}, close to your ${limit}° limit; the new heading stays at ${deg(after.maxSlopeDeg)}.`;
   else if(ahead.cost>after.cost*1.1)why=`the new heading is cheaper: ${deg(after.maxSlopeDeg)} steepest and about ${pct((1-after.cost/ahead.cost)*100)} less cost over the next 150 m than carrying straight on.`;
   else why=`a small adjustment to line up with the next stretch; straight on would cost about the same.`;
   turns.push({size:Math.abs(t),item:{kind:'turn',title:`${Math.round(Math.abs(t))}° turn ${side}`,text:`Turns ${side} ${Math.round(Math.abs(t))}° because ${why}`,atMeters:acc+cum[idx[q]],leg:i,coord:[p1[0],p1[1]]}})}
  turns.sort((x,y)=>y.size-x.size).slice(0,3).forEach(t=>items.push(t.item));
  acc+=leg.distance;
 });
 if(route.stops.length>1){const names=route.stops.map(s=>s.name).join(' → ');
  items.push({kind:'order',title:'Why this stop order',text:`Stops are picked one at a time by value per unit of walking cost (effort, time and slope margin together, not just distance), then checked so the walk home still fits your ${settings.budget??'time'}-minute budget with its 20% reserve. Order: ${names}.`,atMeters:0,leg:0});}
 items.push({kind:'cost',title:`How the path was chosen (${styleLabel})`,text:`The router searched every 20 m cell of the elevation model, not the rover's tracks. Each step costs: walking effort (Minetti 2002, Earth gravity, ${P.massKg} kg), time (Tobler hiking speed), a penalty that grows as slope nears your ${limit}° limit, extra for side-hill walking and for rugged ground. Steps over ${limit}° or onto blocked ground are not allowed. Weights: effort ${P.weights.wE}, time ${P.weights.wT}, slope margin ${P.weights.wM}, side-slope ${P.weights.wC}, roughness ${P.weights.wR}. The 20 m DEM cannot see rocks or sand, so treat it as a plan to check on the ground.`,atMeters:0,leg:0});
 return items;
}
// Whole-route numbers for the plan panel.
export function costSummary(route,router){
 if(!route?.grid)return null;const P=router.params(),parts={energy:0,time:0,margin:0,cross:0,rough:0};
 route.legs.forEach(l=>{for(const k in parts)parts[k]+=l.parts?.[k]||0});
 let direct=0,directKcal=0,directMin=0,over=0;route.legs.forEach(l=>{const s=router.straight(l.coords[0],l.coords.at(-1));direct+=s.distance;directKcal+=s.kcal;directMin+=s.minutes;over+=s.overLimitMeters});
 return {style:P.style,limitDeg:P.limitDeg,weights:P.weights,massKg:P.massKg,kcal:route.kcal,walkMinutes:route.legs.reduce((v,l)=>v+l.minutes,0),distance:route.distance,ascent:route.ascent,
  maxSlopeDeg:Math.max(...route.legs.map(l=>l.maxSlopeDeg)),directMeters:direct,directKcal,directMinutes:directMin,directOverLimitMeters:over,drivers:driversOf(parts)};
}
